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
