-- ============================================================
--  Base de données de la coloc — à coller dans Supabase > SQL Editor > Run
-- ============================================================

-- Les colocataires (modifie les prénoms ici si besoin AVANT de lancer)
create table members (
  id     int generated always as identity primary key,
  name   text unique not null,
  gender text not null default 'homme' check (gender in ('homme', 'femme')),  -- personnage
  skin   text not null default '#e0a878',                                     -- couleur de peau
  hair   text not null default '#5b3a29',                                     -- couleur de cheveux
  outfit text not null default 'none'                                         -- tenue portée
);
insert into members (name) values ('Anthony'), ('Mathilde'), ('Lily'), ('Victor'), ('Zak');

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
create policy "members maj"      on members  for update using (true) with check (true);  -- personnage

create policy "tasks lecture"    on tasks    for select using (true);
create policy "tasks ajout"      on tasks    for insert with check (true);
create policy "tasks maj"        on tasks    for update using (true) with check (true);

create policy "products lecture" on products for select using (true);
create policy "products maj"     on products for update using (true) with check (true);

create policy "subs lecture"     on push_subs for select using (true);
create policy "subs ajout"       on push_subs for insert with check (true);
create policy "subs maj"         on push_subs for update using (true) with check (true);
create policy "subs suppression" on push_subs for delete using (true);


-- ============================================================
--  Boutique de tenues et duels de chifoumi
-- ============================================================

-- Les tenues achetées (le prix est enregistré au moment de l'achat)
create table purchases (
  id         bigint generated always as identity primary key,
  member_id  int  not null references members(id) on delete cascade,
  item       text not null,
  price      int  not null check (price >= 0),
  created_at timestamptz not null default now(),
  unique (member_id, item)
);

-- Les duels de chifoumi
create table duels (
  id              bigint generated always as identity primary key,
  challenger_id   int  not null references members(id) on delete cascade,
  opponent_id     int  not null references members(id) on delete cascade,
  wager           int  not null check (wager >= 1),            -- la mise, en pièces
  status          text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  challenger_move text check (challenger_move in ('pierre', 'feuille', 'ciseaux')), -- révélé seulement une fois le duel joué
  opponent_move   text check (opponent_move   in ('pierre', 'feuille', 'ciseaux')),
  winner_id       int  references members(id),                 -- vide = égalité
  created_at      timestamptz not null default now(),
  played_at       timestamptz,
  check (challenger_id <> opponent_id)
);

-- Le coup secret de celui qui lance le défi. Aucune règle d'accès : personne ne peut le lire
-- avec la clé publique, seules les fonctions ci-dessous (play_duel…) y ont accès.
create table duel_secrets (
  duel_id bigint primary key references duels(id) on delete cascade,
  move    text not null check (move in ('pierre', 'feuille', 'ciseaux'))
);
alter table duel_secrets enable row level security;

-- ---------- Calcul des soldes ----------
-- solde = pièces gagnées au ménage − achats ± duels terminés
create or replace function balance_of(p_member int) returns int
language sql stable security definer set search_path = public as $$
  select (
    coalesce((select sum(coins) from tasks where actor_id = p_member and status <> 'todo'), 0)
    - coalesce((select sum(price) from purchases where member_id = p_member), 0)
    + coalesce((select sum(case when winner_id = p_member then wager else -wager end)
                from duels
                where status = 'done' and winner_id is not null and p_member in (challenger_id, opponent_id)), 0)
  )::int
$$;

-- disponible = solde − mises de ses propres défis encore en attente
create or replace function available_of(p_member int) returns int
language sql stable security definer set search_path = public as $$
  select balance_of(p_member)
       - coalesce((select sum(wager) from duels where status = 'pending' and challenger_id = p_member), 0)::int
$$;

create view balances as
  select id as member_id, balance_of(id) as coins from members;
grant select on balances to anon, authenticated;

-- ---------- Actions (les seules façons de toucher aux achats et aux duels) ----------
create or replace function buy_item(p_member int, p_item text, p_price int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_price < 0 then raise exception 'Prix invalide.'; end if;
  if exists (select 1 from purchases where member_id = p_member and item = p_item) then
    raise exception 'Tu possèdes déjà cette tenue.';
  end if;
  if available_of(p_member) < p_price then raise exception 'Tu n''as pas assez de pièces.'; end if;
  insert into purchases (member_id, item, price) values (p_member, p_item, p_price);
end $$;

create or replace function create_duel(p_challenger int, p_opponent int, p_wager int, p_move text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_move not in ('pierre', 'feuille', 'ciseaux') then raise exception 'Coup invalide.'; end if;
  if p_wager is null or p_wager < 1 then raise exception 'Mise invalide.'; end if;
  if p_challenger = p_opponent then raise exception 'Tu ne peux pas te défier toi-même.'; end if;
  if available_of(p_challenger) < p_wager then raise exception 'Tu n''as pas assez de pièces.'; end if;
  if balance_of(p_opponent) < p_wager then raise exception 'Ton adversaire n''a pas assez de pièces.'; end if;
  insert into duels (challenger_id, opponent_id, wager) values (p_challenger, p_opponent, p_wager) returning id into v_id;
  insert into duel_secrets (duel_id, move) values (v_id, p_move);
  return v_id;
end $$;

create or replace function play_duel(p_duel bigint, p_player int, p_move text) returns duels
language plpgsql security definer set search_path = public as $$
declare d duels; cm text; w int;
begin
  if p_move not in ('pierre', 'feuille', 'ciseaux') then raise exception 'Coup invalide.'; end if;
  select * into d from duels where id = p_duel for update;
  if not found or d.status <> 'pending' then raise exception 'Ce défi n''est plus disponible.'; end if;
  if d.opponent_id <> p_player then raise exception 'Ce défi ne t''est pas adressé.'; end if;
  if balance_of(d.challenger_id) < d.wager or balance_of(d.opponent_id) < d.wager then
    raise exception 'Il n''y a plus assez de pièces pour ce duel.';
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
  return d;
end $$;

-- Annuler son défi, ou refuser un défi reçu
create or replace function cancel_duel(p_duel bigint, p_player int) returns void
language plpgsql security definer set search_path = public as $$
declare d duels;
begin
  select * into d from duels where id = p_duel for update;
  if not found or d.status <> 'pending' then raise exception 'Ce défi n''est plus disponible.'; end if;
  if p_player not in (d.challenger_id, d.opponent_id) then raise exception 'Ce défi ne te concerne pas.'; end if;
  update duels set status = 'cancelled' where id = p_duel;
  delete from duel_secrets where duel_id = p_duel;
end $$;

grant execute on function buy_item(int, text, int) to anon, authenticated;
grant execute on function create_duel(int, int, int, text) to anon, authenticated;
grant execute on function play_duel(bigint, int, text) to anon, authenticated;
grant execute on function cancel_duel(bigint, int) to anon, authenticated;

-- Accès : lecture seule des achats et des duels (on ne les modifie que par les fonctions ci-dessus)
alter table purchases enable row level security;
alter table duels     enable row level security;
create policy "purchases lecture" on purchases for select using (true);
create policy "duels lecture"     on duels     for select using (true);

-- Synchronisation en temps réel (quand quelqu'un coche, joue ou change de tenue, les autres le voient tout de suite)
alter publication supabase_realtime add table tasks, products, members, purchases, duels;
