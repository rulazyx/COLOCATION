-- ============================================================
--  Base de données de la coloc — à coller dans Supabase > SQL Editor > Run
-- ============================================================

-- Les colocataires (modifie les prénoms ici si besoin AVANT de lancer)
create table members (
  id   int generated always as identity primary key,
  name text unique not null
);
insert into members (name) values ('Anthony'), ('Mathilde'), ('Lily'), ('Victor'), ('Zakaria');

-- Les tâches de chaque semaine (créées automatiquement par l'appli)
create table tasks (
  id          bigint generated always as identity primary key,
  week        date   not null,                 -- lundi de la semaine
  slot        int    not null,                 -- numéro de la tâche dans la liste de config.js
  kind        text   not null,                 -- type de tâche (cuisine, wc…)
  label       text   not null,
  detail      text,
  day_index   int    not null check (day_index between 0 and 6), -- 0 = lundi
  assignee_id int    not null references members(id),  -- à qui la tâche est confiée
  reward      int    not null default 0,       -- pièces que rapporte la tâche
  status      text   not null default 'todo' check (status in ('todo', 'done', 'skipped')),
  actor_id    int    references members(id),   -- qui l'a faite / sautée (peut différer de assignee_id)
  coins       int    not null default 0,       -- pièces gagnées (ou perdues) au moment de l'action
  acted_at    timestamptz,
  unique (week, slot, assignee_id)             -- 1 ligne par personne (plusieurs si "pour tous")
);

-- Score de chacun (sert au classement) : somme des pièces et nombre de tâches faites
create view scores as
  select actor_id as member_id,
         sum(coins)::int as coins,
         (count(*) filter (where status = 'done'))::int as done_count
  from tasks
  where status <> 'todo' and actor_id is not null
  group by actor_id;
grant select on scores to anon, authenticated;

-- Les produits communs
create table products (
  id           int generated always as identity primary key,
  name         text unique not null,
  out_of_stock boolean not null default false,
  updated_by   int references members(id),
  updated_at   timestamptz not null default now()
);
insert into products (name) values
  ('Papier toilette'), ('Sopalin'), ('Produit toilettes'), ('Cumin'), ('Curcuma'), ('Paprika'),
  ('Poivre'), ('Sel'), ('Liquide vaisselle'), ('Désinfectant spray'), ('Vinaigre blanc'),
  ('Huile d''olive'), ('Huile de tournesol');

-- Les téléphones abonnés aux notifications
create table push_subs (
  endpoint   text primary key,
  member_id  int  not null references members(id) on delete cascade,
  sub        jsonb not null,
  created_at timestamptz not null default now()
);

-- Sécurité : accès ouvert à quiconque connaît l'adresse de l'appli (pas de mot de passe, voir README).
alter table members   enable row level security;
alter table tasks     enable row level security;
alter table products  enable row level security;
alter table push_subs enable row level security;

create policy "members lecture"  on members  for select using (true);

create policy "tasks lecture"    on tasks    for select using (true);
create policy "tasks ajout"      on tasks    for insert with check (true);
create policy "tasks maj"        on tasks    for update using (true) with check (true);

create policy "products lecture" on products for select using (true);
create policy "products maj"     on products for update using (true) with check (true);

create policy "subs lecture"     on push_subs for select using (true);
create policy "subs ajout"       on push_subs for insert with check (true);
create policy "subs maj"         on push_subs for update using (true) with check (true);
create policy "subs suppression" on push_subs for delete using (true);

-- Synchronisation en temps réel (quand quelqu'un coche, les autres le voient tout de suite)
alter publication supabase_realtime add table tasks, products;
