-- ======== patch-v73 ========
-- Patch v73 (à coller dans Supabase > SQL Editor) : récompense de la semaine, gains Sudoku/Jumpy, skins Cardinal/Poussin

create or replace function roll_dice(p_member int) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Indian/Reunion')::date;
  v_week  date := date_trunc('week', now() at time zone 'Indian/Reunion')::date;
  v_n int; v_cost int; v_pos int; v_roll int; v_to int; v_note text := ''; v_laps int; v_cellno int;
  v_perk text; v_ch int := 0; v_cell goose_cells; v_depth int := 0; v_xp int := 0; v_tr int := 0; v_size int := 30;
begin
  if not exists (select 1 from members where id = p_member and kind = 'coloc') then raise exception 'Seuls les colocataires jouent au plateau.'; end if;
  perform pg_advisory_xact_lock(hashtext('dice:' || p_member));
  select count(*) into v_n from dice_rolls where member_id = p_member and (created_at at time zone 'Indian/Reunion')::date = v_today;
  v_cost := (array[0, 1, 3, 5, 10, 20])[least(v_n + 1, 6)];
  if v_n >= 8 then raise exception 'Tu as lancé tous tes dés du jour (maximum 8).'; end if;
  if week_soap_of(p_member) < v_cost then raise exception 'Il te faut % savon% gagnés cette semaine pour ce dé.', v_cost, case when v_cost > 1 then 's' else '' end; end if;
  select to_pos into v_pos from dice_rolls where member_id = p_member and week = v_week order by id desc limit 1;
  v_pos := coalesce(v_pos, 0);                                           -- position cumulée (les tours sont infinis)
  select coalesce(max(to_pos / v_size), 0) into v_laps from dice_rolls where member_id = p_member and week = v_week;
  v_roll := 1 + floor(random() * 6)::int;
  v_to := v_pos + v_roll;
  loop
    v_cellno := case when v_to <= 0 then 0 else ((v_to - 1) % v_size) + 1 end;
    select * into v_cell from goose_cells where cell = v_cellno;
    exit when not found or v_depth >= 3;
    v_depth := v_depth + 1;
    if v_cell.kind = 'xp' then v_xp := v_xp + v_cell.v; v_note := v_note || ' +' || v_cell.v || ' XP'; exit;
    elsif v_cell.kind = 'chips' then v_ch := v_ch + v_cell.v; v_note := v_note || ' +' || v_cell.v || ' colocoins'; exit;
    elsif v_cell.kind = 'back' then v_to := greatest(v_to - v_cell.v, 0); v_note := v_note || ' piège : recule de ' || v_cell.v;
    elsif v_cell.kind = 'goose' then v_to := v_to + v_roll; v_note := v_note || ' oie : avance encore de ' || v_roll;
    else exit; end if;
  end loop;
  if v_to / v_size > v_laps then
    v_xp := v_xp + 200; v_tr := v_tr + 0; v_note := v_note || ' TOUR TERMINÉ ! +' || 200 || ' XP';
    -- (la récompense de la semaine va désormais au coloc qui a gagné le plus de savons : voir settle_plateau)
  end if;
  insert into dice_rolls (member_id, week, cost, roll, from_pos, to_pos, note) values (p_member, v_week, 0, v_roll, v_pos, v_to, nullif(trim(v_note), ''));   -- les dés ne consomment plus de savons
  if v_xp > 0 then perform add_xp(p_member, v_xp, 'plateau'); end if;
  if v_tr > 0 then insert into coin_ledger (member_id, amount, reason) values (p_member, v_tr, 'plateau'); end if;
  if v_ch > 0 then insert into chip_ledger (member_id, amount, reason) values (p_member, v_ch, 'plateau'); end if;
  return json_build_object('perk', v_perk, 'roll', v_roll, 'from', v_pos, 'to', v_to, 'cost', v_cost, 'xp', v_xp, 'trophies', v_tr, 'chips', v_ch, 'note', trim(v_note));
end $$;

grant execute on function roll_dice(int) to anon, authenticated;

create or replace function settle_plateau() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prev date := (date_trunc('week', now() at time zone 'Indian/Reunion')::date) - 7;
  v_max int; v_win int[];
begin
  -- Le gagnant de la semaine est celui qui a gagné le plus de SAVONS (tâches validées) ; `laps` contient désormais ce nombre de savons
  perform pg_advisory_xact_lock(hashtext('plateau_weeks'));
  if exists (select 1 from plateau_weeks where week = v_prev) then return; end if;
  create temp table if not exists _wk (member_id int, n int) on commit drop;
  delete from _wk;
  insert into _wk select doer_id, sum(soap)::int from task_logs
    where status = 'validated' and date_trunc('week', answered_at at time zone 'Indian/Reunion')::date = v_prev group by doer_id;
  select coalesce(max(n), 0) into v_max from _wk;
  if v_max >= 1 then
    select array_agg(member_id) into v_win from _wk where n = v_max;
    insert into chip_ledger (member_id, amount, reason) select unnest(v_win), 1000, 'plateau-week:' || v_prev;
    insert into perks (member_id, week, kind) select unnest(v_win), v_prev, (array['biere', 'course', 'vacances'])[1 + ((v_prev - date '2024-01-01') / 7) % 3] on conflict do nothing;
  end if;
  insert into plateau_weeks (week, winners, laps) values (v_prev, coalesce(v_win, '{}'), v_max);
end $$;

grant execute on function settle_plateau() to anon, authenticated;

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
    v_chips := 3; v_cap := 9;
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

create or replace function poulailler_skin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.item = 'poulailler' then insert into purchases (member_id, item, price) values (new.member_id, 'poussin', 0) on conflict do nothing; end if;
  return new;
end $$;

drop trigger if exists poulailler_skin on farm_builds;
create trigger poulailler_skin after insert on farm_builds for each row execute function poulailler_skin();

insert into purchases (member_id, item, price) select member_id, 'poussin', 0 from farm_builds where item = 'poulailler' on conflict do nothing;
insert into purchases (member_id, item, price) select member_id, 'cardinal', 0 from unlocks where key = 'maitre_poussin' on conflict do nothing;
update challenges set skin = 'cardinal' where key = 'maitre_poussin';

-- ======== patch-v74 ========
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

-- ======== patch-v75 ========
-- Patch v75 (à coller dans Supabase > SQL Editor, APRÈS patch-v74) : niveau d'intelligence du Sudoku
alter table member_stats add column if not exists sudoku_easy int not null default 0;
alter table member_stats add column if not exists sudoku_mid  int not null default 0;
alter table member_stats add column if not exists sudoku_hard int not null default 0;

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
    update member_stats set sudoku_done = sudoku_done + 1, sudoku_easy = sudoku_easy + 1, sudoku_best = least(coalesce(sudoku_best, p_seconds), p_seconds) where member_id = p_member;
  else
    v_xp := case p_mode when 'easy' then 10 when 'mid' then 25 else 50 end;
    v_coins := case p_mode when 'easy' then 1 when 'mid' then 2 else 4 end;
    update member_stats set sudoku_done = sudoku_done + 1, sudoku_easy = sudoku_easy + (case when p_mode = 'easy' then 1 else 0 end), sudoku_mid = sudoku_mid + (case when p_mode = 'mid' then 1 else 0 end), sudoku_hard = sudoku_hard + (case when p_mode = 'hard' then 1 else 0 end) where member_id = p_member;
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

-- ======== patch-v103 ========
-- Patch v103 (à coller dans Supabase > SQL Editor) : nouveaux défis et colocoins gagnés au cumul
insert into challenges (key, coins, skin, xp) values
  ('perso_5', 0, null, 300), ('perso_10', 0, null, 700), ('perso_15', 0, null, 1200),
  ('oiseaux_2', 0, null, 200), ('oiseaux_5', 0, null, 600), ('oiseaux_tous', 0, null, 1500),
  ('sudoku_semaine', 0, null, 300), ('sudoku_niv3', 0, null, 300), ('sudoku_niv5', 0, null, 600), ('sudoku_niv10', 0, null, 1500),
  ('bj_10', 0, null, 200), ('bj_50', 0, null, 600), ('bj_200', 0, null, 1500),
  ('cumul_100', 0, null, 100), ('cumul_1000', 0, null, 400), ('cumul_10000', 0, null, 1500), ('cumul_100000', 0, null, 5000)
on conflict (key) do update set xp = excluded.xp, skin = excluded.skin;

-- Solde + colocoins gagnés au cumul (somme des entrées, dépenses non déduites)
create or replace view chip_balances as
  select m.id as member_id, coalesce(sum(c.amount), 0)::int as chips,
         coalesce(sum(c.amount) filter (where c.amount > 0), 0)::int as earned
  from members m left join chip_ledger c on c.member_id = m.id group by m.id;
grant select on chip_balances to anon, authenticated;

-- ======== patch-v104 ========
-- v104 : la course aux pièces passe dans Jeux. Plus de savons : un dé toutes les 3 h, 3 en réserve au maximum.
-- Le plateau n'est plus remis à zéro chaque lundi : chacun garde sa position actuelle. Univers pirate avec malus (cases en fin de fichier).
create table if not exists dice_clock (member_id int primary key references members(id) on delete cascade, t timestamptz not null);
alter table dice_clock enable row level security;
drop policy if exists "dice_clock lecture" on dice_clock; create policy "dice_clock lecture" on dice_clock for select using (true);
grant select on dice_clock to anon, authenticated;
do $$ begin
  begin alter publication supabase_realtime add table dice_clock; exception when duplicate_object then null; end;
end $$;
create or replace function roll_dice(p_member int) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_t timestamptz;
  v_week  date := date_trunc('week', now() at time zone 'Indian/Reunion')::date;
  v_pos int; v_roll int; v_to int; v_note text := ''; v_laps int; v_cellno int;
  v_perk text; v_ch int := 0; v_cell goose_cells; v_depth int := 0; v_xp int := 0; v_tr int := 0; v_size int := 30;
begin
  if not exists (select 1 from members where id = p_member and kind = 'coloc') then raise exception 'Seuls les colocataires jouent à la course aux pièces.'; end if;
  perform pg_advisory_xact_lock(hashtext('dice:' || p_member));
  -- horloge des dés : un dé par tranche de 3 h écoulée depuis v_t, 3 au plus (au-delà de 9 h sans jouer, on n'en gagne plus)
  select t into v_t from dice_clock where member_id = p_member;
  v_t := greatest(coalesce(v_t, now() - interval '9 hours'), now() - interval '9 hours');
  if now() - v_t < interval '3 hours' then
    raise exception 'Pas encore de dé : le prochain arrive dans % min.', ceil(extract(epoch from (v_t + interval '3 hours' - now())) / 60)::int;
  end if;
  insert into dice_clock (member_id, t) values (p_member, v_t + interval '3 hours') on conflict (member_id) do update set t = excluded.t;
  select to_pos into v_pos from dice_rolls where member_id = p_member order by id desc limit 1;
  v_pos := coalesce(v_pos, 0);                                           -- position cumulée (les tours sont infinis)
  select coalesce(max(to_pos / v_size), 0) into v_laps from dice_rolls where member_id = p_member;
  v_roll := 1 + floor(random() * 6)::int;
  v_to := v_pos + v_roll;
  loop
    v_cellno := case when v_to <= 0 then 0 else ((v_to - 1) % v_size) + 1 end;
    select * into v_cell from goose_cells where cell = v_cellno;
    exit when not found or v_depth >= 3;
    v_depth := v_depth + 1;
    if v_cell.kind = 'xp' then v_xp := v_xp + v_cell.v; v_note := v_note || ' +' || v_cell.v || ' XP'; exit;
    elsif v_cell.kind = 'chips' and v_cell.v < 0 then   -- pirates : on ne vole jamais plus que le solde
      v_ch := v_ch - least(-v_cell.v, greatest(coalesce((select chips from chip_balances where member_id = p_member), 0), 0));
      v_note := v_note || ' ' || coalesce(v_cell.name, 'Pirates') || ' : ' || v_ch || ' colocoins'; exit;
    elsif v_cell.kind = 'chips' then v_ch := v_ch + v_cell.v; v_note := v_note || ' +' || v_cell.v || ' colocoins'; exit;
    elsif v_cell.kind = 'back' then v_to := greatest(v_to - v_cell.v, 0); v_note := v_note || ' ' || lower(coalesce(v_cell.name, 'piège')) || ' : recule de ' || v_cell.v;
    elsif v_cell.kind = 'goose' then v_to := v_to + v_roll; v_note := v_note || ' vent favorable : avance encore de ' || v_roll;
    else exit; end if;
  end loop;
  if v_to / v_size > v_laps then
    v_xp := v_xp + 200; v_tr := v_tr + 0; v_note := v_note || ' TOUR TERMINÉ ! +' || 200 || ' XP';
    -- (la récompense de la semaine va désormais au coloc qui a gagné le plus de savons : voir settle_plateau)
  end if;
  insert into dice_rolls (member_id, week, cost, roll, from_pos, to_pos, note) values (p_member, v_week, 0, v_roll, v_pos, v_to, nullif(trim(v_note), ''));   -- les dés ne consomment plus de savons
  if v_xp > 0 then perform add_xp(p_member, v_xp, 'plateau'); end if;
  if v_tr > 0 then insert into coin_ledger (member_id, amount, reason) values (p_member, v_tr, 'plateau'); end if;
  if v_ch <> 0 then insert into chip_ledger (member_id, amount, reason) values (p_member, v_ch, 'plateau'); end if;
  return json_build_object('perk', v_perk, 'roll', v_roll, 'from', v_pos, 'to', v_to, 'cost', 0, 'xp', v_xp, 'trophies', v_tr, 'chips', v_ch, 'note', trim(v_note));
end $$;
grant execute on function roll_dice(int) to anon, authenticated;
-- Plateau pirate : malus (récif, tempête, kraken = reculer ; pirates = vol de colocoins, jamais plus que le solde). Même liste que GOOSE dans config.js.
alter table goose_cells add column if not exists name text;
delete from goose_cells;
insert into goose_cells (cell, kind, v, name) values
  (2, 'chips', 20, 'Coffre'),
  (4, 'back', 2, 'Récif'),
  (5, 'xp', 30, 'Carte au trésor'),
  (7, 'chips', -20, 'Pirates'),
  (9, 'goose', 0, 'Vent favorable'),
  (10, 'xp', 40, 'Carte au trésor'),
  (12, 'back', 3, 'Tempête'),
  (13, 'chips', 30, 'Coffre'),
  (15, 'xp', 50, 'Carte au trésor'),
  (16, 'back', 5, 'Kraken'),
  (18, 'goose', 0, 'Vent favorable'),
  (20, 'xp', 60, 'Carte au trésor'),
  (21, 'chips', -30, 'Pirates'),
  (23, 'chips', 40, 'Coffre'),
  (25, 'xp', 80, 'Carte au trésor'),
  (26, 'back', 2, 'Récif'),
  (28, 'back', 3, 'Tempête');

-- ======== patch-v106-punitions ========
-- ===== Punitions : un coloc propose une sanction en savons, les autres votent (majorité des colocs hors puni) =====
create table if not exists punishments (
  id         bigserial primary key,
  author_id  int  not null references members(id) on delete cascade,
  target_id  int  not null references members(id) on delete cascade,
  reason     text not null check (char_length(reason) between 2 and 120),
  soap       int  not null check (soap between 1 and 10),
  status     text not null default 'open' check (status in ('open', 'validated', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  closed_at  timestamptz
);
create table if not exists punishment_votes (
  punishment_id bigint not null references punishments(id) on delete cascade,
  member_id     int    not null references members(id) on delete cascade,
  vote          boolean not null,
  created_at    timestamptz not null default now(),
  primary key (punishment_id, member_id)
);
alter table punishments enable row level security;
alter table punishment_votes enable row level security;
drop policy if exists "punishments lecture" on punishments; create policy "punishments lecture" on punishments for select using (true);
drop policy if exists "punishment_votes lecture" on punishment_votes; create policy "punishment_votes lecture" on punishment_votes for select using (true);
grant select on punishments, punishment_votes to anon, authenticated;
do $$ begin
  begin alter publication supabase_realtime add table punishments; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table punishment_votes; exception when duplicate_object then null; end;
end $$;

-- Clôture : validée quand plus de la moitié des votants dit oui, rejetée quand le oui ne peut plus l'emporter
create or replace function settle_punishment(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r punishments; v_n int; v_yes int; v_no int; v_need int;
begin
  select * into r from punishments where id = p_id for update;
  if not found or r.status <> 'open' then return; end if;
  select count(*) into v_n from members where kind = 'coloc' and id <> r.target_id;
  select count(*) filter (where vote), count(*) filter (where not vote) into v_yes, v_no from punishment_votes where punishment_id = p_id;
  v_need := v_n / 2 + 1;
  if v_yes >= v_need then update punishments set status = 'validated', closed_at = now() where id = p_id;
  elsif v_n - v_no < v_need then update punishments set status = 'rejected', closed_at = now() where id = p_id;
  end if;
end $$;
create or replace function add_punishment(p_member int, p_target int, p_reason text, p_soap int) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_reason text := trim(p_reason);
begin
  if not exists (select 1 from members where id = p_member and kind = 'coloc') then raise exception 'Réservé aux colocataires.'; end if;
  if not exists (select 1 from members where id = p_target and kind = 'coloc') then raise exception 'Choisis un coloc à punir.'; end if;
  if p_target = p_member then raise exception 'Tu ne peux pas te punir toi-même.'; end if;
  if v_reason is null or char_length(v_reason) < 2 then raise exception 'Écris le motif.'; end if;
  if char_length(v_reason) > 120 then raise exception 'Motif trop long (120 caractères maximum).'; end if;
  if p_soap is null or p_soap < 1 or p_soap > 10 then raise exception 'Sanction entre 1 et 10 savons.'; end if;
  if (select count(*) from punishments where author_id = p_member and status = 'open') >= 3 then raise exception 'Déjà 3 punitions en cours.'; end if;
  insert into punishments (author_id, target_id, reason, soap) values (p_member, p_target, v_reason, p_soap) returning id into v_id;
  insert into punishment_votes (punishment_id, member_id, vote) values (v_id, p_member, true);
  perform settle_punishment(v_id);
  return v_id;
end $$;
create or replace function vote_punishment(p_member int, p_id bigint, p_vote boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r punishments;
begin
  if not exists (select 1 from members where id = p_member and kind = 'coloc') then raise exception 'Réservé aux colocataires.'; end if;
  select * into r from punishments where id = p_id for update;
  if not found or r.status <> 'open' then raise exception 'Ce vote est terminé.'; end if;
  if r.target_id = p_member then raise exception 'Tu ne peux pas voter pour ta propre punition.'; end if;
  insert into punishment_votes (punishment_id, member_id, vote) values (p_id, p_member, p_vote)
    on conflict (punishment_id, member_id) do update set vote = excluded.vote, created_at = now();
  perform settle_punishment(p_id);
end $$;
create or replace function cancel_punishment(p_member int, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update punishments set status = 'cancelled', closed_at = now() where id = p_id and author_id = p_member and status = 'open';
  if not found then raise exception 'Impossible d''annuler.'; end if;
end $$;
revoke execute on function settle_punishment(bigint) from public, anon, authenticated;
grant execute on function add_punishment(int, int, text, int), vote_punishment(int, bigint, boolean), cancel_punishment(int, bigint) to anon, authenticated;

-- Les punitions validées comptent comme des savons dépensés
create or replace view soap_spent as
  select m.id as member_id,
    (coalesce((select sum(cost) from dice_rolls where member_id = m.id), 0)
     + coalesce((select sum(soap) from soap_exchanges where member_id = m.id), 0)
     + coalesce((select sum(soap) from punishments where target_id = m.id and status = 'validated'), 0))::int as spent
  from members m;
grant select on soap_spent to anon, authenticated;
create or replace function soap_of(p_member int) returns int
language sql stable security definer set search_path = public as $$
  select (coalesce((select sum(soap) from task_logs where doer_id = p_member and status = 'validated'), 0)
        - coalesce((select sum(cost) from dice_rolls where member_id = p_member), 0)
        - coalesce((select sum(soap) from soap_exchanges where member_id = p_member), 0)
        - coalesce((select sum(soap) from punishments where target_id = p_member and status = 'validated'), 0))::int
$$;

-- ======== patch-v107 ========
-- v107 : récompense du 1er de la semaine = 400 colocoins (au lieu de 1000)
create or replace function settle_plateau() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prev date := (date_trunc('week', now() at time zone 'Indian/Reunion')::date) - 7;
  v_max int; v_win int[];
begin
  -- Le gagnant de la semaine est celui qui a gagné le plus de SAVONS (tâches validées) ; `laps` contient désormais ce nombre de savons
  perform pg_advisory_xact_lock(hashtext('plateau_weeks'));
  if exists (select 1 from plateau_weeks where week = v_prev) then return; end if;
  create temp table if not exists _wk (member_id int, n int) on commit drop;
  delete from _wk;
  insert into _wk select doer_id, sum(soap)::int from task_logs
    where status = 'validated' and date_trunc('week', answered_at at time zone 'Indian/Reunion')::date = v_prev group by doer_id;
  select coalesce(max(n), 0) into v_max from _wk;
  if v_max >= 1 then
    select array_agg(member_id) into v_win from _wk where n = v_max;
    insert into chip_ledger (member_id, amount, reason) select unnest(v_win), 400, 'plateau-week:' || v_prev;
    insert into perks (member_id, week, kind) select unnest(v_win), v_prev, (array['biere', 'course', 'vacances'])[1 + ((v_prev - date '2024-01-01') / 7) % 3] on conflict do nothing;
  end if;
  insert into plateau_weeks (week, winners, laps) values (v_prev, coalesce(v_win, '{}'), v_max);
end $$;
grant execute on function settle_plateau() to anon, authenticated;

