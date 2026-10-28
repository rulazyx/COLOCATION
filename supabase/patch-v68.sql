-- Patch v68 (à coller dans Supabase > SQL Editor) : activités à invités, demandes d'achat, gain hebdomadaire 1000

alter table events add column if not exists invitees int[];

drop function if exists create_event(int, text, text, timestamptz);
create or replace function create_event(p_member int, p_title text, p_place text, p_starts timestamptz, p_invitees int[] default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_title text := trim(p_title); v_place text := nullif(trim(coalesce(p_place, '')), '');
begin
  if not exists (select 1 from members where id = p_member) then raise exception 'Membre inconnu.'; end if;
  if v_title is null or char_length(v_title) < 2 then raise exception 'Donne un titre à l''activité.'; end if;
  if char_length(v_title) > 60 then raise exception 'Titre trop long (60 caractères maximum).'; end if;
  if v_place is not null and char_length(v_place) > 60 then raise exception 'Lieu trop long (60 caractères maximum).'; end if;
  if p_starts is null or p_starts < now() - interval '1 day' or p_starts > now() + interval '1 year' then raise exception 'Date invalide.'; end if;
  if (select count(*) from events where creator_id = p_member and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Déjà 10 activités proposées aujourd''hui.';
  end if;
  insert into events (creator_id, title, place, starts_at, invitees) values (p_member, v_title, v_place, p_starts, case when coalesce(array_length(p_invitees, 1), 0) = 0 then null else p_invitees end) returning id into v_id;
  insert into event_votes (event_id, member_id, vote) values (v_id, p_member, 'yes');
  return v_id;
end $$;
create or replace function vote_event(p_member int, p_event bigint, p_vote text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_vote not in ('yes', 'no', 'maybe') then raise exception 'Réponse invalide.'; end if;
  if not exists (select 1 from members where id = p_member) then raise exception 'Membre inconnu.'; end if;
  if not exists (select 1 from events where id = p_event) then raise exception 'Activité introuvable.'; end if;
  insert into event_votes (event_id, member_id, vote) values (p_event, p_member, p_vote)
    on conflict (event_id, member_id) do update set vote = excluded.vote, updated_at = now();
end $$;
create or replace function delete_event(p_member int, p_event bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from events where id = p_event and creator_id = p_member;
  if not found then raise exception 'Seul l''organisateur peut supprimer cette activité.'; end if;
end $$;
grant execute on function create_event(int, text, text, timestamptz, int[]) to anon, authenticated;

insert into task_kinds (kind, soap, cooldown_h) values ('courses', 2, 0) on conflict (kind) do nothing;

-- ===== Demandes d'achat : un coloc demande, un autre achète (+2 savons), le demandeur confirme =====
create table if not exists shop_requests (
  id           bigserial primary key,
  requester_id int  not null references members(id) on delete cascade,
  item         text not null check (char_length(item) between 2 and 80),
  reward       int  not null default 2,
  status       text not null default 'open' check (status in ('open', 'bought', 'done', 'cancelled')),
  buyer_id     int  references members(id) on delete set null,
  created_at   timestamptz not null default now(),
  bought_at    timestamptz
);
alter table shop_requests enable row level security;
drop policy if exists "shop_requests lecture" on shop_requests; create policy "shop_requests lecture" on shop_requests for select using (true);
grant select on shop_requests to anon, authenticated;
do $$ begin begin alter publication supabase_realtime add table shop_requests; exception when duplicate_object then null; end; end $$;

create or replace function add_shop_request(p_member int, p_item text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_item text := trim(p_item);
begin
  if not exists (select 1 from members where id = p_member and kind = 'coloc') then raise exception 'Réservé aux colocataires.'; end if;
  if v_item is null or char_length(v_item) < 2 then raise exception 'Écris ce qu''il faut acheter.'; end if;
  if char_length(v_item) > 80 then raise exception 'Trop long (80 caractères maximum).'; end if;
  if (select count(*) from shop_requests where requester_id = p_member and status in ('open', 'bought')) >= 5 then raise exception 'Déjà 5 demandes en cours.'; end if;
  insert into shop_requests (requester_id, item) values (p_member, v_item) returning id into v_id;
  return v_id;
end $$;
create or replace function shop_request_bought(p_member int, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r shop_requests;
begin
  if not exists (select 1 from members where id = p_member and kind = 'coloc') then raise exception 'Réservé aux colocataires.'; end if;
  select * into r from shop_requests where id = p_id for update;
  if not found or r.status <> 'open' then raise exception 'Cette demande n''est plus disponible.'; end if;
  if r.requester_id = p_member then raise exception 'Tu ne peux pas acheter ta propre demande.'; end if;
  update shop_requests set status = 'bought', buyer_id = p_member, bought_at = now() where id = p_id;
end $$;
create or replace function answer_shop_request(p_member int, p_id bigint, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r shop_requests; v_log bigint;
begin
  select * into r from shop_requests where id = p_id for update;
  if not found or r.status <> 'bought' or r.requester_id <> p_member then raise exception 'Rien à confirmer.'; end if;
  if p_ok then
    update shop_requests set status = 'done' where id = p_id;
    insert into task_logs (kind, doer_id, status, soap, validator_id, answered_at) values ('courses', r.buyer_id, 'validated', r.reward, p_member, now());
    perform add_xp(r.buyer_id, r.reward * 25, 'task');
    perform add_xp(p_member, 10, 'validate');
  else
    update shop_requests set status = 'open', buyer_id = null, bought_at = null where id = p_id;
  end if;
end $$;
create or replace function cancel_shop_request(p_member int, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update shop_requests set status = 'cancelled' where id = p_id and requester_id = p_member and status in ('open', 'bought');
  if not found then raise exception 'Impossible d''annuler.'; end if;
end $$;
grant execute on function add_shop_request(int, text), shop_request_bought(int, bigint), answer_shop_request(int, bigint, boolean), cancel_shop_request(int, bigint) to anon, authenticated;

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
  end if;
  insert into plateau_weeks (week, winners, laps) values (v_prev, coalesce(v_win, '{}'), v_max);
end $$;
grant execute on function settle_plateau() to anon, authenticated;
