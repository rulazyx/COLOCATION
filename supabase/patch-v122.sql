-- La Kaz v122 : Cardinal (nouveau jeu) — 8 nouveaux oiseaux, paliers de décors, quêtes du jour
-- À coller dans Supabase > SQL Editor > Run. Sans risque si on le relance.

-- 1) Nouveaux oiseaux dans la boîte mystère
insert into bird_odds (key, w) values
  ('pirate', 8), ('noel', 8), ('zombie', 5), ('robot', 5), ('astro', 5), ('fantome', 2), ('licorne', 2), ('phenix', 1)
on conflict (key) do update set w = excluded.w;

-- 2) report_game : les colocoins de Cardinal viennent des 16 paliers (score 15, 30, 50 … 1000), 100 par jour au maximum
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
    v_chips := coalesce((select sum(t.c) from unnest(
        array[15, 30, 50, 75, 100, 150, 200, 300, 400, 500, 600, 700, 800, 900, 1000],
        array[10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 250]) as t(at, c) where v_new >= t.at), 0);
    v_cap := 100;
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

-- 3) Quêtes du jour de Cardinal : 1 à 10 colocoins par récupération, 40 par jour au maximum
create or replace function cardinal_quest(p_member int, p_coins int) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int := least(greatest(coalesce(p_coins, 0), 0), 10); v_today int;
begin
  if v_n = 0 or not can_play(p_member) then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('cquest:' || p_member));
  select coalesce(sum(amount), 0) into v_today from chip_ledger
    where member_id = p_member and reason = 'cardinal:quete'
      and (created_at at time zone 'Indian/Reunion')::date = (now() at time zone 'Indian/Reunion')::date;
  v_n := greatest(0, least(v_n, 40 - v_today));
  if v_n > 0 then insert into chip_ledger (member_id, amount, reason) values (p_member, v_n, 'cardinal:quete'); end if;
  return v_n;
end $$;
grant execute on function cardinal_quest(int, int) to anon, authenticated;
