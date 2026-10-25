-- ============================================================
--  Version 5 : trophées (plus de monnaie), niveaux et XP, copains, échange de tâches
--  À lancer UNE fois sur une base en version 4 (rien n'est effacé). Sans risque si relancé.
-- ============================================================

-- ---------- Copains (joueurs qui ne sont pas en coloc) ----------
alter table members add column if not exists kind text not null default 'coloc';
do $$ begin
  alter table members add constraint members_kind_check check (kind in ('coloc', 'copain'));
exception when duplicate_object then null; end $$;

-- Tout nouveau membre reçoit ses trophées de départ et sa ligne de stats
create or replace function members_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into coin_ledger (member_id, amount, reason) values (new.id, 0, 'start');
  insert into member_stats (member_id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists members_after_insert on members;
create trigger members_after_insert after insert on members for each row execute function members_after_insert();

-- Pour ajouter un autre copain plus tard :  insert into members (name, kind) values ('Prénom', 'copain');
insert into members (name, kind) values ('Etienne', 'copain') on conflict (name) do nothing;
-- (si Etienne existait déjà, on s'assure qu'il est bien « copain » et qu'il a ses trophées de départ)
update members set kind = 'copain' where name = 'Etienne';
insert into coin_ledger (member_id, amount, reason)
  select m.id, 0, 'start' from members m
  where not exists (select 1 from coin_ledger l where l.member_id = m.id and l.reason = 'start');
insert into member_stats (member_id) select id from members on conflict do nothing;

-- ---------- XP ----------
create table if not exists xp_log (
  id         bigint generated always as identity primary key,
  member_id  int  not null references members(id) on delete cascade,
  amount     int  not null,
  reason     text not null,
  created_at timestamptz not null default now()
);
create index if not exists xp_log_member on xp_log (member_id);

create or replace function add_xp(p_member int, p_amount int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_amount is null or p_amount = 0 then return; end if;
  insert into xp_log (member_id, amount, reason) values (p_member, p_amount, p_reason);
end $$;
revoke execute on function add_xp(int, int, text) from public, anon, authenticated;  -- réservé aux fonctions de la base

create or replace view member_xp as
  select m.id as member_id, coalesce(sum(x.amount), 0)::int as xp
  from members m left join xp_log x on x.member_id = m.id group by m.id;
grant select on member_xp to anon, authenticated;

-- Niveau L atteint à 50 × L × (L − 1) XP (même formule que config.js)
create or replace function level_of(p_xp int) returns int
language sql immutable as $$
  select floor((1 + sqrt(1 + greatest(p_xp, 0)::numeric * 4 / 50)) / 2)::int
$$;

-- Les tâches déjà faites avant la v5 comptent aussi (une seule fois)
insert into xp_log (member_id, amount, reason)
  select actor_id, coins * 2, 'task-backfill' from tasks
  where status = 'done' and actor_id is not null and coins > 0
    and not exists (select 1 from xp_log where reason = 'task-backfill');

-- XP d'une tâche : gagnée à la validation, retirée si on annule
create or replace function tasks_xp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status <> 'done' and new.actor_id is not null then
    perform add_xp(new.actor_id, new.coins * 2, 'task');
  elsif old.status = 'done' and new.status <> 'done' and old.actor_id is not null then
    perform add_xp(old.actor_id, -old.coins * 2, 'task-undo');
  end if;
  return new;
end $$;
drop trigger if exists tasks_xp on tasks;
create trigger tasks_xp after update of status on tasks for each row execute function tasks_xp();

-- XP d'un signalement de rupture (1 fois par jour et par produit)
create or replace function products_xp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.out_of_stock and not old.out_of_stock and new.updated_by is not null
     and not exists (select 1 from xp_log where member_id = new.updated_by and reason = 'stock:' || new.id
                     and created_at > now() - interval '1 day') then
    perform add_xp(new.updated_by, 5, 'stock:' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists products_xp on products;
create trigger products_xp after update of out_of_stock on products for each row execute function products_xp();

-- ---------- Apparences : niveaux (plus de boutique) ----------
create table if not exists skin_levels (item text primary key, level int not null);
delete from skin_levels;
insert into skin_levels (item, level) values
  ('singe', 3),
  ('pirate', 5),
  ('ninja', 8),
  ('astronaute', 10);;
alter table skin_levels enable row level security;
drop policy if exists "skin_levels lecture" on skin_levels;
create policy "skin_levels lecture" on skin_levels for select using (true);

drop function if exists buy_item(int, text, int);

create or replace function members_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_level int; v_need int;
begin
  if new.outfit is distinct from old.outfit and new.outfit <> 'none'
     and not exists (select 1 from purchases where member_id = new.id and item = new.outfit) then
    select level into v_need from skin_levels where item = new.outfit;
    select level_of(xp) into v_level from member_xp where member_id = new.id;
    if v_need is null or coalesce(v_level, 1) < v_need then
      raise exception 'Tu n''as pas encore débloqué cette apparence.';
    end if;
  end if;
  if new.title is distinct from old.title and new.title is not null
     and not exists (select 1 from unlocks where member_id = new.id and key = new.title) then
    raise exception 'Ce titre n''est pas débloqué.';
  end if;
  return new;
end $$;

-- ---------- Trophées : on ne dépense plus (les anciens achats ne coûtent plus rien) ----------
create or replace function balance_of(p_member int) returns int
language sql stable security definer set search_path = public as $$
  select (
    coalesce((select sum(coins) from tasks where actor_id = p_member and status <> 'todo'), 0)
    + coalesce((select sum(amount) from coin_ledger where member_id = p_member), 0)
    + coalesce((select sum(case when winner_id = p_member then wager else -wager end)
                from duels
                where status = 'done' and winner_id is not null and p_member in (challenger_id, opponent_id)), 0)
  )::int
$$;

-- Classement hebdomadaire : trophées gagnés chaque semaine (lundi → dimanche, heure de La Réunion)
create or replace view weekly_trophies as
  select member_id, week, sum(amount)::int as trophies from (
    select actor_id as member_id, date_trunc('week', acted_at at time zone 'Indian/Reunion')::date as week, coins as amount
      from tasks where status = 'done' and actor_id is not null and acted_at is not null
    union all
    select member_id, date_trunc('week', created_at at time zone 'Indian/Reunion')::date, amount
      from coin_ledger where reason <> 'start'
  ) t group by member_id, week;
grant select on weekly_trophies to anon, authenticated;

-- ---------- Les fonctions qui rapportent de l'XP ----------
create or replace function play_duel(p_duel bigint, p_player int, p_move text) returns duels
language plpgsql security definer set search_path = public as $$
declare d duels; cm text; w int;
begin
  if p_move not in ('pierre', 'feuille', 'ciseaux') then raise exception 'Coup invalide.'; end if;
  select * into d from duels where id = p_duel for update;
  if not found or d.status <> 'pending' then raise exception 'Ce défi n''est plus disponible.'; end if;
  if d.opponent_id <> p_player then raise exception 'Ce défi ne t''est pas adressé.'; end if;
  if balance_of(d.challenger_id) < d.wager or balance_of(d.opponent_id) < d.wager then
    raise exception 'Il n''y a plus assez de trophées pour ce duel.';
  end if;
  select move into cm from duel_secrets where duel_id = p_duel;
  w := case
    when cm = p_move then null
    when (cm = 'pierre' and p_move = 'ciseaux') or (cm = 'feuille' and p_move = 'pierre') or (cm = 'ciseaux' and p_move = 'feuille')
      then d.challenger_id
    else d.opponent_id
  end;
  update duels
     set status = 'done', challenger_move = cm, opponent_move = p_move, winner_id = w, played_at = now()
   where id = p_duel returning * into d;
  delete from duel_secrets where duel_id = p_duel;
  perform add_xp(d.challenger_id, 5, 'duel');
  perform add_xp(d.opponent_id, 5, 'duel');
  if w is not null then perform add_xp(w, 10, 'duel-win'); end if;
  return d;
end $$;

create or replace function claim_daily(p_member int, p_day date) returns json
language plpgsql security definer set search_path = public as $$
declare s member_stats; v_streak int; v_coins int := 0; v_wheel boolean := false;
  v_table int[] := array[10, 15, 20, 25, 30, 40];
begin
  if p_day not between current_date - 1 and current_date + 1 then raise exception 'Date invalide.'; end if;
  insert into member_stats (member_id) values (p_member) on conflict do nothing;
  select * into s from member_stats where member_id = p_member for update;
  if s.last_login = p_day then raise exception 'Récompense déjà récupérée aujourd''hui.'; end if;
  if s.last_login = p_day - 1 and s.streak < 7 then v_streak := s.streak + 1; else v_streak := 1; end if;
  if v_streak = 7 then v_wheel := true; else v_coins := v_table[v_streak]; end if;
  update member_stats set streak = v_streak, last_login = p_day, login_days = login_days + 1,
         wheel_ready = wheel_ready or v_wheel where member_id = p_member;
  if v_coins > 0 then insert into coin_ledger (member_id, amount, reason) values (p_member, v_coins, 'daily'); end if;
  perform add_xp(p_member, 10, 'daily');
  return json_build_object('streak', v_streak, 'coins', v_coins, 'wheel', v_wheel);
end $$;

create or replace function spin_wheel(p_member int) returns int
language plpgsql security definer set search_path = public as $$
declare v_amount int;
begin
  perform 1 from member_stats where member_id = p_member and wheel_ready for update;
  if not found then raise exception 'La roue n''est pas débloquée.'; end if;
  v_amount := 50 + floor(random() * (1000 - 50 + 1))::int;
  update member_stats set wheel_ready = false where member_id = p_member;
  insert into coin_ledger (member_id, amount, reason) values (p_member, v_amount, 'wheel');
  perform add_xp(p_member, 20, 'wheel');
  return v_amount;
end $$;

create or replace function report_game(p_member int, p_game text, p_score int) returns member_stats
language plpgsql security definer set search_path = public as $$
declare s member_stats; v_xp int := 0;
begin
  if p_score is null or p_score < 0 then raise exception 'Score invalide.'; end if;
  insert into member_stats (member_id) values (p_member) on conflict do nothing;
  if p_game = 'flappy' then
    update member_stats set flappy_best = greatest(flappy_best, least(p_score, 5000)),
           flappy_total = flappy_total + least(p_score, 5000) where member_id = p_member;
    v_xp := least(p_score * 1, 100);
  elsif p_game = 'raid' then
    update member_stats set raid_best = greatest(raid_best, least(p_score, 1000000)) where member_id = p_member;
    v_xp := least((p_score / 50) * 1, 100);
  elsif p_game = 'sudoku' then
    if p_score < 20 then raise exception 'Temps invalide.'; end if;
    update member_stats set sudoku_done = sudoku_done + 1,
           sudoku_best = least(coalesce(sudoku_best, p_score), p_score) where member_id = p_member;
    v_xp := 40;
  else raise exception 'Jeu inconnu.';
  end if;
  perform add_xp(p_member, v_xp, 'game:' || p_game);
  select * into s from member_stats where member_id = p_member;
  return s;
end $$;

create or replace function claim_challenge(p_member int, p_key text) returns json
language plpgsql security definer set search_path = public as $$
declare c challenges;
begin
  select * into c from challenges where key = p_key;
  if not found then raise exception 'Défi inconnu.'; end if;
  insert into unlocks (member_id, key) values (p_member, p_key) on conflict do nothing;
  if not found then return null; end if;   -- déjà réussi
  if c.coins > 0 then insert into coin_ledger (member_id, amount, reason) values (p_member, c.coins, 'challenge:' || p_key); end if;
  if c.skin is not null then
    insert into purchases (member_id, item, price) values (p_member, c.skin, 0) on conflict do nothing;
  end if;
  perform add_xp(p_member, 50, 'challenge:' || p_key);
  return json_build_object('key', c.key, 'coins', c.coins, 'skin', c.skin);
end $$;

-- ---------- Échange de tâches (on ne saute plus : on propose à quelqu'un d'autre) ----------
create table if not exists task_requests (
  id         bigint generated always as identity primary key,
  task_id    bigint not null references tasks(id) on delete cascade,
  from_id    int    not null references members(id) on delete cascade,
  to_id      int    not null references members(id) on delete cascade,
  status     text   not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  check (from_id <> to_id)
);

create or replace function create_task_request(p_task bigint, p_from int, p_to int) returns bigint
language plpgsql security definer set search_path = public as $$
declare t tasks; v_id bigint;
begin
  select * into t from tasks where id = p_task for update;
  if not found or t.status <> 'todo' then raise exception 'Cette tâche n''est plus à faire.'; end if;
  if t.assignee_id <> p_from then raise exception 'Cette tâche n''est pas la tienne.'; end if;
  if not exists (select 1 from members where id = p_to and kind = 'coloc') then
    raise exception 'Tu ne peux proposer une tâche qu''à un colocataire.';
  end if;
  if exists (select 1 from tasks where week = t.week and slot = t.slot and assignee_id = p_to) then
    raise exception 'Cette personne a déjà cette tâche.';
  end if;
  update task_requests set status = 'cancelled', answered_at = now() where task_id = p_task and status = 'pending';
  insert into task_requests (task_id, from_id, to_id) values (p_task, p_from, p_to) returning id into v_id;
  return v_id;
end $$;

-- p_accept = true : le destinataire accepte (la tâche devient la sienne) · false : il refuse, ou l'auteur annule
create or replace function answer_task_request(p_req bigint, p_player int, p_accept boolean) returns task_requests
language plpgsql security definer set search_path = public as $$
declare r task_requests; t tasks;
begin
  select * into r from task_requests where id = p_req for update;
  if not found or r.status <> 'pending' then raise exception 'Cette demande n''est plus disponible.'; end if;
  if p_player not in (r.from_id, r.to_id) then raise exception 'Cette demande ne te concerne pas.'; end if;
  if p_accept then
    if p_player <> r.to_id then raise exception 'Seul le destinataire peut accepter.'; end if;
    select * into t from tasks where id = r.task_id for update;
    if t.status <> 'todo' or t.assignee_id <> r.from_id then
      update task_requests set status = 'cancelled', answered_at = now() where id = p_req returning * into r;
      raise exception 'Cette tâche a changé entre-temps.';
    end if;
    if exists (select 1 from tasks where week = t.week and slot = t.slot and assignee_id = r.to_id) then
      raise exception 'Tu as déjà cette tâche.';
    end if;
    update tasks set assignee_id = r.to_id where id = r.task_id;
    update task_requests set status = 'accepted', answered_at = now() where id = p_req returning * into r;
  else
    update task_requests set status = case when p_player = r.from_id then 'cancelled' else 'declined' end, answered_at = now()
     where id = p_req returning * into r;
  end if;
  return r;
end $$;

grant execute on function create_task_request(bigint, int, int)   to anon, authenticated;
grant execute on function answer_task_request(bigint, int, boolean) to anon, authenticated;

alter table task_requests enable row level security;
drop policy if exists "requests lecture" on task_requests;
create policy "requests lecture" on task_requests for select using (true);

do $$ begin
  begin alter publication supabase_realtime add table task_requests; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table xp_log;        exception when duplicate_object then null; end;
end $$;
alter table xp_log enable row level security;
drop policy if exists "xp lecture" on xp_log;
create policy "xp lecture" on xp_log for select using (true);
