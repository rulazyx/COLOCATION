-- Patch v74 (à coller dans Supabase > SQL Editor, APRÈS patch-v73) : Sudoku (semaine + aléatoire), gains Jumpy, suppression des quêtes de jeux

create table if not exists sudoku_weekly (
  member_id int  not null references members(id) on delete cascade,
  week      date not null,
  seconds   int  not null check (seconds >= 1),
  updated_at timestamptz not null default now(),
  primary key (member_id, week)
);
alter table sudoku_weekly enable row level security;
drop policy if exists "sudoku_weekly lecture" on sudoku_weekly; create policy "sudoku_weekly lecture" on sudoku_weekly for select using (true);
grant select on sudoku_weekly to anon, authenticated;
do $$ begin begin alter publication supabase_realtime add table sudoku_weekly; exception when duplicate_object then null; end; end $$;

-- Remise à zéro unique des records de sudoku (les défis déjà obtenus, comme Mathématicien, sont conservés)
do $$ begin
  if not exists (select 1 from app_meta where key = 'reset_sudoku_v2') then
    update member_stats set sudoku_best = null, sudoku_done = 0;
    insert into app_meta (key, value) values ('reset_sudoku_v2', 'done');
  end if;
end $$;


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
    elsif p_seconds < v_prev then
      v_record := true; update sudoku_weekly set seconds = p_seconds, updated_at = now() where member_id = p_member and week = v_week;
    end if;
    update member_stats set sudoku_done = sudoku_done + 1, sudoku_best = least(coalesce(sudoku_best, p_seconds), p_seconds) where member_id = p_member;
  else
    v_xp := case p_mode when 'easy' then 10 when 'mid' then 25 else 50 end;
    v_coins := case p_mode when 'easy' then 1 when 'mid' then 2 else 4 end;
    update member_stats set sudoku_done = sudoku_done + 1 where member_id = p_member;
    if exists (select 1 from members where id = p_member and kind = 'coloc') then
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

create or replace function report_game(p_member int, p_game text, p_score int) returns member_stats
language plpgsql security definer set search_path = public as $$
declare s member_stats; v_xp int := 0; v_new int; v_want int := 0; v_today int; v_chips int := 0; v_cap int := 0;
begin
  if p_score is null or p_score < 0 then raise exception 'Score invalide.'; end if;
  insert into member_stats (member_id) values (p_member) on conflict do nothing;
  select * into s from member_stats where member_id = p_member for update;
  if p_game = 'flappy' then
    v_new := least(p_score, 5000);
    v_xp := least(p_score * 3, 300) + milestone_xp('flappy', s.flappy_best, v_new);
    update member_stats set flappy_best = greatest(flappy_best, v_new), flappy_total = flappy_total + v_new where member_id = p_member;
    v_chips := least(v_new / 10, 3); v_cap := 15;
  elsif p_game = 'raid' then
    v_new := least(p_score, 1000000);
    v_xp := least((p_score / 50) * 2, 300) + milestone_xp('raid', s.raid_best, v_new);
    update member_stats set raid_best = greatest(raid_best, v_new) where member_id = p_member;
  elsif p_game = 'sudoku' then
    if p_score < 20 then raise exception 'Temps invalide.'; end if;
    v_xp := 150 + milestone_xp('sudoku', s.sudoku_best, p_score);
    update member_stats set sudoku_done = sudoku_done + 1, sudoku_best = least(coalesce(sudoku_best, p_score), p_score) where member_id = p_member;
  elsif p_game = 'blackjack' then
    if p_score > 3 then raise exception 'Résultat invalide.'; end if;   -- 0 perdu · 1 égalité · 2 gagné · 3 blackjack
    v_xp := 10 + case p_score when 2 then 15 when 3 then 30 else 0 end;
    v_want := case p_score when 2 then undefined when 3 then undefined else 0 end;
    select coalesce(sum(amount), 0) into v_today from coin_ledger
      where member_id = p_member and reason = 'blackjack'
        and (created_at at time zone 'Indian/Reunion')::date = (now() at time zone 'Indian/Reunion')::date;
    v_want := greatest(0, least(v_want, undefined - v_today));
    if v_want > 0 then insert into coin_ledger (member_id, amount, reason) values (p_member, v_want, 'blackjack'); end if;
    update member_stats set blackjack_played = blackjack_played + 1, blackjack_wins = blackjack_wins + (case when p_score >= 2 then 1 else 0 end)
     where member_id = p_member;
  else raise exception 'Jeu inconnu.';
  end if;
  if v_chips > 0 and exists (select 1 from members where id = p_member and kind = 'coloc') then
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

create or replace function report_flappy(p_member int, p_score int) returns json
language plpgsql security definer set search_path = public as $$
declare v_x0 int; v_c0 int; v_x1 int; v_c1 int;
begin
  select coalesce(sum(amount), 0) into v_x0 from xp_log where member_id = p_member;
  select coalesce(sum(amount), 0) into v_c0 from chip_ledger where member_id = p_member;
  perform report_game(p_member, 'flappy', p_score);
  select coalesce(sum(amount), 0) into v_x1 from xp_log where member_id = p_member;
  select coalesce(sum(amount), 0) into v_c1 from chip_ledger where member_id = p_member;
  return json_build_object('xp', v_x1 - v_x0, 'coins', v_c1 - v_c0);
end $$;
grant execute on function report_flappy(int, int) to anon, authenticated;

drop function if exists game_quest(int, text, int);
drop table if exists game_quests;
drop table if exists game_quest_defs;
