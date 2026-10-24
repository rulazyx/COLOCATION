-- ============================================================
--  MIGRATION v2 — à lancer UNIQUEMENT si tu avais déjà lancé l'ancien schema.sql
--  (si tu n'as encore rien lancé, utilise simplement schema.sql à la place).
--  ⚠️ Efface les tâches existantes (cases cochées comprises) : l'appli les recrée toute seule
--  à la prochaine ouverture. Les produits, prénoms et abonnements aux notifications sont conservés.
-- ============================================================

drop view if exists scores;
drop table if exists tasks cascade;

create table tasks (
  id          bigint generated always as identity primary key,
  week        date   not null,
  slot        int    not null,
  kind        text   not null,
  label       text   not null,
  detail      text,
  day_index   int    not null check (day_index between 0 and 6),
  assignee_id int    not null references members(id),
  reward      int    not null default 0,
  status      text   not null default 'todo' check (status in ('todo', 'done', 'skipped')),
  actor_id    int    references members(id),
  coins       int    not null default 0,
  acted_at    timestamptz,
  unique (week, slot, assignee_id)
);

create view scores as
  select actor_id as member_id,
         sum(coins)::int as coins,
         (count(*) filter (where status = 'done'))::int as done_count
  from tasks
  where status <> 'todo' and actor_id is not null
  group by actor_id;
grant select on scores to anon, authenticated;

alter table tasks enable row level security;
create policy "tasks lecture" on tasks for select using (true);
create policy "tasks ajout"   on tasks for insert with check (true);
create policy "tasks maj"     on tasks for update using (true) with check (true);

alter publication supabase_realtime add table tasks;
