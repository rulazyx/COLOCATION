-- ===== v120 : à coller dans Supabase > SQL Editor puis Run (peut être relancé sans risque) =====
-- Etienne (copain) a accès à la course aux pièces, à la ferme et aux gains de colocoins ; Cardinal : gains par palier ; blackjack : mises 5/10/20/30 ; Sudoku : colocoins de la grille de la semaine.

create or replace function can_play(p_member int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where id = p_member and (kind = 'coloc' or name = 'Etienne'));
$$;
grant execute on function can_play(int) to anon, authenticated;

-- Course aux pièces : même règle que la version en place, ouverte à Etienne
do $$
declare d text;
begin
  select pg_get_functiondef(oid) into d from pg_proc where pronamespace = 'public'::regnamespace and proname = 'roll_dice';
  d := replace(d, 'not exists (select 1 from members where id = p_member and kind = ''coloc'')', 'not can_play(p_member)');
  execute d;
end $$;

-- Blackjack : mises définitives 5 / 10 / 20 / 30 (les anciennes restent acceptées)
create or replace function report_blackjack(p_member int, p_bet int, p_net int, p_hands int, p_wins int, p_blackjack boolean) returns member_stats
language plpgsql security definer set search_path = public as $$
declare s member_stats; v_xp int; v_net int; v_bal int;
begin
  if p_bet not in (5, 10, 20, 30, 25, 50, 100, 200, 300, 500) then raise exception 'Mise invalide.'; end if;
  if p_hands not between 1 and 2 or p_wins not between 0 and p_hands then raise exception 'Résultat invalide.'; end if;
  if abs(p_net) > 4 * p_bet then raise exception 'Résultat invalide.'; end if;
  insert into member_stats (member_id) values (p_member) on conflict do nothing;
  v_bal := chips_of(p_member);
  v_net := case when p_net < 0 then -least(-p_net, greatest(v_bal, 0)) else p_net end;
  if v_net <> 0 then insert into chip_ledger (member_id, amount, reason) values (p_member, v_net, 'blackjack'); end if;
  v_xp := p_hands * 10 + p_wins * 15 + case when p_blackjack then 30 else 0 end;
  perform add_xp(p_member, v_xp, 'game:blackjack');
  update member_stats set blackjack_played = blackjack_played + p_hands, blackjack_wins = blackjack_wins + p_wins where member_id = p_member;
  select * into s from member_stats where member_id = p_member;
  return s;
end $$;
grant execute on function report_blackjack(int, int, int, int, int, boolean) to anon, authenticated;

-- Jeux (Cardinal, raid, sudoku) : Cardinal ne rapporte des colocoins qu'au passage d'un palier (50, 100, 150, 200, 250)
create or replace function report_game(p_member int, p_game text, p_score int) returns member_stats
language plpgsql security definer set search_path = public as $$
declare s member_stats; v_xp int := 0; v_new int; v_today int; v_chips int := 0; v_cap int := 0;
begin
  if p_score is null or p_score < 0 then raise exception 'Score invalide.'; end if;
  insert into member_stats (member_id) values (p_member) on conflict do nothing;
  select * into s from member_stats where member_id = p_member for update;
  if p_game = 'flappy' then
    v_new := least(p_score, 5000);
    v_xp := least(p_score * 3, 300) + milestone_xp('flappy', s.flappy_best, v_new);
    update member_stats set flappy_best = greatest(flappy_best, v_new), flappy_total = flappy_total + v_new where member_id = p_member;
    v_chips := coalesce((select sum(t.c) from unnest(array[50, 100, 150, 200, 250], array[5, 10, 15, 25, 40]) as t(at, c) where v_new >= t.at), 0); v_cap := 100;
  elsif p_game = 'raid' then
    v_new := least(p_score, 1000000);
    v_xp := least((p_score / 50) * 2, 300) + milestone_xp('raid', s.raid_best, v_new);
    update member_stats set raid_best = greatest(raid_best, v_new) where member_id = p_member;
  elsif p_game = 'sudoku' then
    if p_score < 20 then raise exception 'Temps invalide.'; end if;
    v_xp := 150 + milestone_xp('sudoku', s.sudoku_best, p_score);
    update member_stats set sudoku_done = sudoku_done + 1, sudoku_best = least(coalesce(sudoku_best, p_score), p_score) where member_id = p_member;
  else raise exception 'Jeu inconnu.';
  end if;
  if v_chips > 0 and can_play(p_member) then
    select coalesce(sum(amount), 0) into v_today from chip_ledger
      where member_id = p_member and reason = 'jeu:' || p_game
        and (created_at at time zone 'Indian/Reunion')::date = (now() at time zone 'Indian/Reunion')::date;
    v_chips := greatest(0, least(v_chips, v_cap - v_today));
    if v_chips > 0 then insert into chip_ledger (member_id, amount, reason) values (p_member, v_chips, 'jeu:' || p_game); end if;
  end if;
  perform add_xp(p_member, v_xp, 'game:' || p_game);
  select * into s from member_stats where member_id = p_member;
  return s;
end $$;
grant execute on function report_game(int, text, int) to anon, authenticated;

-- Sudoku : colocoins pour Etienne aussi, + 10 colocoins pour la première grille de la semaine
create or replace function report_sudoku(p_member int, p_mode text, p_seconds int) returns json
language plpgsql security definer set search_path = public as $$
declare s member_stats; v_week date := date_trunc('week', now() at time zone 'Indian/Reunion')::date;
        v_xp int := 0; v_coins int := 0; v_today int; v_prev int; v_record boolean := false;
begin
  if p_mode not in ('week', 'easy', 'mid', 'hard') then raise exception 'Mode inconnu.'; end if;
  if p_seconds is null or p_seconds < 20 then raise exception 'Temps invalide.'; end if;
  if not exists (select 1 from members where id = p_member) then raise exception 'Membre inconnu.'; end if;
  insert into member_stats (member_id) values (p_member) on conflict do nothing;
  select * into s from member_stats where member_id = p_member for update;
  if p_mode = 'week' then
    select seconds into v_prev from sudoku_weekly where member_id = p_member and week = v_week;
    if v_prev is null then
      v_xp := 150 + milestone_xp('sudoku', s.sudoku_best, p_seconds); v_record := true;
      insert into sudoku_weekly (member_id, week, seconds) values (p_member, v_week, p_seconds);
      if can_play(p_member) then v_coins := 10; insert into chip_ledger (member_id, amount, reason) values (p_member, 10, 'sudokuw'); end if;
    elsif p_seconds < v_prev then
      v_record := true; update sudoku_weekly set seconds = p_seconds, updated_at = now() where member_id = p_member and week = v_week;
    end if;
    update member_stats set sudoku_done = sudoku_done + 1, sudoku_easy = sudoku_easy + 1, sudoku_best = least(coalesce(sudoku_best, p_seconds), p_seconds) where member_id = p_member;
  else
    v_xp := case p_mode when 'easy' then 10 when 'mid' then 25 else 50 end;
    v_coins := case p_mode when 'easy' then 1 when 'mid' then 2 else 4 end;
    update member_stats set sudoku_done = sudoku_done + 1, sudoku_easy = sudoku_easy + (case when p_mode = 'easy' then 1 else 0 end), sudoku_mid = sudoku_mid + (case when p_mode = 'mid' then 1 else 0 end), sudoku_hard = sudoku_hard + (case when p_mode = 'hard' then 1 else 0 end) where member_id = p_member;
    if can_play(p_member) then
      select coalesce(sum(amount), 0) into v_today from chip_ledger
        where member_id = p_member and reason like 'sudoku:%' and (created_at at time zone 'Indian/Reunion')::date = (now() at time zone 'Indian/Reunion')::date;
      v_coins := greatest(0, least(v_coins, 12 - v_today));
      if v_coins > 0 then insert into chip_ledger (member_id, amount, reason) values (p_member, v_coins, 'sudoku:' || p_mode); end if;
    else v_coins := 0; end if;
  end if;
  if v_xp > 0 then perform add_xp(p_member, v_xp, 'game:sudoku'); end if;
  return json_build_object('xp', v_xp, 'coins', v_coins, 'record', v_record, 'mode', p_mode);
end $$;
grant execute on function report_sudoku(int, text, int) to anon, authenticated;

-- Nouvelles tâches ménagères (catégorie Maison)
insert into task_kinds (kind, soap, cooldown_h) values
  ('mais_arrosage', 1, 48), ('mais_compost', 2, 72), ('mais_terrasse', 2, 72), ('mais_linge', 2, 96)
on conflict (kind) do update set soap = excluded.soap, cooldown_h = excluded.cooldown_h;
