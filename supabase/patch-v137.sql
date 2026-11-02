-- v137 : la course aux pièces repart à zéro chaque lundi à minuit (heure de La Réunion) ; le coloc le plus avancé gagne 1000 colocoins.
create table if not exists course_resets (
  id            int generated always as identity primary key,
  at            timestamptz not null default now(),
  week          date not null,
  after_roll_id bigint not null default 0,   -- seuls les lancers d'id supérieur comptent pour la saison en cours
  winners       int[] not null default '{}',
  best          int not null default 0
);
alter table course_resets enable row level security;
drop policy if exists "course_resets lecture" on course_resets; create policy "course_resets lecture" on course_resets for select using (true);
grant select on course_resets to anon, authenticated;
do $$ begin alter publication supabase_realtime add table course_resets; exception when others then null; end $$;

create or replace function settle_course(p_force boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_week date := date_trunc('week', now() at time zone 'Indian/Reunion')::date;
  v_after bigint; v_max int; v_win int[]; v_rid int; v_names text;
begin
  perform pg_advisory_xact_lock(hashtext('course_resets'));
  if not p_force and exists (select 1 from course_resets where week = v_week) then return; end if;
  select coalesce(max(after_roll_id), 0) into v_after from course_resets;
  create temp table if not exists _cr (member_id int, pos int) on commit drop;
  delete from _cr;
  insert into _cr select distinct on (member_id) member_id, to_pos from dice_rolls where id > v_after order by member_id, id desc;
  select coalesce(max(pos), 0) into v_max from _cr;
  if v_max >= 1 then select array_agg(member_id) into v_win from _cr where pos = v_max; end if;
  insert into course_resets (week, after_roll_id, winners, best) values (v_week, coalesce((select max(id) from dice_rolls), 0), coalesce(v_win, '{}'), v_max) returning id into v_rid;
  if v_win is not null then
    insert into chip_ledger (member_id, amount, reason) select unnest(v_win), 1000, 'course-week:' || v_rid;
    select string_agg(name, ', ' order by name) into v_names from members where id = any(v_win);
  end if;
  insert into popups (key, to_id, title, body, theme)
  select 'course-' || v_rid || '-' || m.id, m.id, 'Course aux pièces : nouvelle semaine !',
         case when v_names is null then E'La course est remise à zéro, personne n\'avait avancé.'
              else 'Gagnant' || case when array_length(v_win, 1) > 1 then 's' else '' end || ' : ' || v_names || E' (+1000 colocoins).\nLa course repart à zéro.' end, 'info'
  from members m where m.kind = 'coloc'
  on conflict (key) do nothing;
end $$;
grant execute on function settle_course(boolean) to anon, authenticated;

create or replace function roll_dice(p_member int) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_t timestamptz; v_after bigint;
  v_week  date := date_trunc('week', now() at time zone 'Indian/Reunion')::date;
  v_pos int; v_roll int; v_to int; v_note text := ''; v_laps int; v_cellno int;
  v_perk text; v_ch int := 0; v_cell goose_cells; v_depth int := 0; v_xp int := 0; v_tr int := 0; v_size int := 30;
begin
  if not exists (select 1 from members where id = p_member and kind = 'coloc') then raise exception 'Seuls les colocataires jouent à la course aux pièces.'; end if;
  perform pg_advisory_xact_lock(hashtext('dice:' || p_member));
  perform settle_course();                                               -- remise à zéro du lundi si elle n'a pas encore eu lieu
  select coalesce(max(after_roll_id), 0) into v_after from course_resets;
  -- horloge des dés : un dé par tranche de 3 h écoulée depuis v_t, 3 au plus (au-delà de 9 h sans jouer, on n'en gagne plus)
  select t into v_t from dice_clock where member_id = p_member;
  v_t := greatest(coalesce(v_t, now() - interval '9 hours'), now() - interval '9 hours');
  if now() - v_t < interval '3 hours' then
    raise exception 'Pas encore de dé : le prochain arrive dans % min.', ceil(extract(epoch from (v_t + interval '3 hours' - now())) / 60)::int;
  end if;
  insert into dice_clock (member_id, t) values (p_member, v_t + interval '3 hours') on conflict (member_id) do update set t = excluded.t;
  select to_pos into v_pos from dice_rolls where member_id = p_member and id > v_after order by id desc limit 1;
  v_pos := coalesce(v_pos, 0);                                           -- position cumulée (les tours sont infinis)
  select coalesce(max(to_pos / v_size), 0) into v_laps from dice_rolls where member_id = p_member and id > v_after;
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
-- Planification : chaque lundi à 00:00 (heure de La Réunion = dimanche 20:00 UTC)
create extension if not exists pg_cron;
do $$ begin perform cron.unschedule('course-reset'); exception when others then null; end $$;
select cron.schedule('course-reset', '0 20 * * 0', $$select settle_course()$$);

-- Remise à zéro immédiate (une seule fois, à l'application du patch) : le plus avancé reçoit ses 1000 colocoins
select settle_course(true);
