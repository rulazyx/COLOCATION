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
