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
