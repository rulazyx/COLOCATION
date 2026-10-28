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
