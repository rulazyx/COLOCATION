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


-- ============================================================
--  Version 4 : 500 pièces de départ, classement, profils, jeux, récompense quotidienne, défis
--  À lancer UNE fois sur une base en version 3 (rien n'est effacé). Sans risque si relancé.
-- ============================================================

-- ---------- Profil : couleur de fond et titre affiché ----------
alter table members add column if not exists bg    text not null default '#e6ebf1';
alter table members add column if not exists title text;   -- clé du défi dont on affiche le titre

-- ---------- Journal des pièces (bonus de départ, récompenses, roue, défis) ----------
create table if not exists coin_ledger (
  id         bigint generated always as identity primary key,
  member_id  int  not null references members(id) on delete cascade,
  amount     int  not null,
  reason     text not null,            -- start | daily | wheel | challenge:<clé>
  created_at timestamptz not null default now()
);
-- 500 pièces offertes à chacun (une seule fois par personne)
insert into coin_ledger (member_id, amount, reason)
  select m.id, 0, 'start' from members m
  where not exists (select 1 from coin_ledger l where l.member_id = m.id and l.reason = 'start');

-- ---------- Statistiques des jeux et de la connexion ----------
create table if not exists member_stats (
  member_id    int primary key references members(id) on delete cascade,
  flappy_best  int  not null default 0,
  flappy_total int  not null default 0,      -- obstacles passés, tous jeux cumulés
  raid_best    int  not null default 0,      -- mètres
  sudoku_best  int,                          -- meilleur temps en secondes
  sudoku_done  int  not null default 0,
  login_days   int  not null default 0,
  streak       int  not null default 0,      -- jour en cours de la série (1 à 7)
  last_login   date,
  wheel_ready  boolean not null default false
);
insert into member_stats (member_id) select id from members on conflict do nothing;

-- ---------- Défis réussis, profils consultés ----------
create table if not exists unlocks (
  member_id  int  not null references members(id) on delete cascade,
  key        text not null,
  created_at timestamptz not null default now(),
  primary key (member_id, key)
);
create table if not exists profile_views (
  viewer_id int not null references members(id) on delete cascade,
  viewed_id int not null references members(id) on delete cascade,
  primary key (viewer_id, viewed_id)
);

-- Récompenses des défis et prix de la boutique (la base fait foi : le téléphone ne choisit plus les prix)
create table if not exists challenges (key text primary key, coins int not null default 0, skin text);
delete from challenges;
insert into challenges (key, coins, skin) values
  ('clochard', 0, 'clochard'),
  ('propre_soi', 10, null),
  ('fee_logis', 100, null),
  ('nickel', 200, 'nickel'),
  ('premier_envol', 10, null),
  ('employe_friterie', 30, null),
  ('maitre_poussin', 100, 'poussin'),
  ('mascareigne', 0, null),
  ('diagonale', 0, 'hugodeck'),
  ('roc', 0, null),
  ('tailladeur', 0, null),
  ('mentaliste', 50, 'sorcier'),
  ('petit_nouveau', 0, null),
  ('maitre_rh', 0, null),
  ('pilier', 0, 'chevalier'),
  ('prince', 0, null),
  ('roi_coloc', 0, 'roi'),
  ('dieu_coloc', 0, 'zeus'),
  ('noob', 0, 'zippo'),
  ('mathematicien', 0, null),
  ('inspecteur', 0, 'detective');;
create table if not exists shop_prices (item text primary key, price int not null check (price >= 0));
delete from shop_prices;
insert into shop_prices (item, price) values
  ('singe', 30),
  ('pirate', 80),
  ('ninja', 100),
  ('astronaute', 120),
  ('zippo', 150);;

-- ---------- Chifoumi : les défis à 0 pièce sont autorisés ----------
do $$ declare c text; begin
  for c in select conname from pg_constraint
           where conrelid = 'duels'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%wager%'
  loop execute format('alter table duels drop constraint %I', c); end loop;
end $$;
alter table duels add constraint duels_wager_check check (wager >= 0);

-- ---------- Soldes : on ajoute le journal ----------
create or replace function balance_of(p_member int) returns int
language sql stable security definer set search_path = public as $$
  select (
    coalesce((select sum(coins) from tasks where actor_id = p_member and status <> 'todo'), 0)
    - coalesce((select sum(price) from purchases where member_id = p_member), 0)
    + coalesce((select sum(amount) from coin_ledger where member_id = p_member), 0)
    + coalesce((select sum(case when winner_id = p_member then wager else -wager end)
                from duels
                where status = 'done' and winner_id is not null and p_member in (challenger_id, opponent_id)), 0)
  )::int
$$;

create or replace function create_duel(p_challenger int, p_opponent int, p_wager int, p_move text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_move not in ('pierre', 'feuille', 'ciseaux') then raise exception 'Coup invalide.'; end if;
  if p_wager is null or p_wager < 0 then raise exception 'Mise invalide.'; end if;
  if p_challenger = p_opponent then raise exception 'Tu ne peux pas te défier toi-même.'; end if;
  if available_of(p_challenger) < p_wager then raise exception 'Tu n''as pas assez de pièces.'; end if;
  if balance_of(p_opponent) < p_wager then raise exception 'Ton adversaire n''a pas assez de pièces.'; end if;
  insert into duels (challenger_id, opponent_id, wager) values (p_challenger, p_opponent, p_wager) returning id into v_id;
  insert into duel_secrets (duel_id, move) values (v_id, p_move);
  return v_id;
end $$;

-- Victoires au chifoumi (pour le classement)
create or replace view duel_stats as
  select m.id as member_id,
         (count(d.id) filter (where d.winner_id = m.id))::int as wins,
         count(d.id)::int as played
  from members m
  left join duels d on d.status = 'done' and m.id in (d.challenger_id, d.opponent_id)
  group by m.id;
grant select on duel_stats to anon, authenticated;

-- ---------- Boutique : seul le prix de la base compte ----------
create or replace function buy_item(p_member int, p_item text, p_price int) returns void
language plpgsql security definer set search_path = public as $$
declare v_price int;
begin
  select price into v_price from shop_prices where item = p_item;
  if v_price is null then raise exception 'Cette apparence ne s''achète pas : elle se gagne avec un défi.'; end if;
  if exists (select 1 from purchases where member_id = p_member and item = p_item) then
    raise exception 'Tu possèdes déjà cette tenue.';
  end if;
  if available_of(p_member) < v_price then raise exception 'Tu n''as pas assez de pièces.'; end if;
  insert into purchases (member_id, item, price) values (p_member, p_item, v_price);
end $$;

-- On ne peut porter qu'une apparence qu'on possède, et n'afficher qu'un titre débloqué
create or replace function members_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.outfit is distinct from old.outfit and new.outfit <> 'none'
     and not exists (select 1 from purchases where member_id = new.id and item = new.outfit) then
    raise exception 'Tu ne possèdes pas cette apparence.';
  end if;
  if new.title is distinct from old.title and new.title is not null
     and not exists (select 1 from unlocks where member_id = new.id and key = new.title) then
    raise exception 'Ce titre n''est pas débloqué.';
  end if;
  return new;
end $$;
drop trigger if exists members_guard on members;
create trigger members_guard before update on members for each row execute function members_guard();

-- ---------- Récompense quotidienne ----------
-- Jours 1 à 6 : des pièces. Jour 7 : la roue de la fortune. Rater un jour remet la série à 1.
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
  return v_amount;
end $$;

-- ---------- Scores des jeux (envoyés par le téléphone en fin de partie) ----------
create or replace function report_game(p_member int, p_game text, p_score int) returns member_stats
language plpgsql security definer set search_path = public as $$
declare s member_stats;
begin
  if p_score is null or p_score < 0 then raise exception 'Score invalide.'; end if;
  insert into member_stats (member_id) values (p_member) on conflict do nothing;
  if p_game = 'flappy' then
    update member_stats set flappy_best = greatest(flappy_best, least(p_score, 5000)),
           flappy_total = flappy_total + least(p_score, 5000) where member_id = p_member;
  elsif p_game = 'raid' then
    update member_stats set raid_best = greatest(raid_best, least(p_score, 1000000)) where member_id = p_member;
  elsif p_game = 'sudoku' then
    if p_score < 20 then raise exception 'Temps invalide.'; end if;
    update member_stats set sudoku_done = sudoku_done + 1,
           sudoku_best = least(coalesce(sudoku_best, p_score), p_score) where member_id = p_member;
  else raise exception 'Jeu inconnu.';
  end if;
  select * into s from member_stats where member_id = p_member;
  return s;
end $$;

-- ---------- Défis : la base verse la récompense (une seule fois) ----------
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
  return json_build_object('key', c.key, 'coins', c.coins, 'skin', c.skin);
end $$;

grant execute on function claim_daily(int, date)        to anon, authenticated;
grant execute on function spin_wheel(int)               to anon, authenticated;
grant execute on function report_game(int, text, int)   to anon, authenticated;
grant execute on function claim_challenge(int, text)    to anon, authenticated;

-- ---------- Accès : lecture seule (on n'écrit que par les fonctions ci-dessus), sauf les profils consultés ----------
alter table coin_ledger    enable row level security;
alter table member_stats   enable row level security;
alter table unlocks        enable row level security;
alter table profile_views  enable row level security;
alter table challenges     enable row level security;
alter table shop_prices    enable row level security;
drop policy if exists "ledger lecture"   on coin_ledger;   create policy "ledger lecture"   on coin_ledger   for select using (true);
drop policy if exists "stats lecture"    on member_stats;  create policy "stats lecture"    on member_stats  for select using (true);
drop policy if exists "unlocks lecture"  on unlocks;       create policy "unlocks lecture"  on unlocks       for select using (true);
drop policy if exists "views lecture"    on profile_views; create policy "views lecture"    on profile_views for select using (true);
drop policy if exists "views ajout"      on profile_views; create policy "views ajout"      on profile_views for insert with check (true);
drop policy if exists "challenges lecture" on challenges;  create policy "challenges lecture" on challenges for select using (true);
drop policy if exists "shop lecture"     on shop_prices;   create policy "shop lecture"     on shop_prices   for select using (true);

-- Temps réel : classement et pièces à jour chez tout le monde
do $$ begin
  begin alter publication supabase_realtime add table member_stats; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table coin_ledger;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table unlocks;      exception when duplicate_object then null; end;
end $$;


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


-- ============================================================
--  Version 6 : départ à 0 trophée, quête principale, défi « Le noob »
--  À lancer UNE fois sur une base en version 5. Sans risque si relancé.
-- ============================================================

-- Tout le monde repart de 0 : les trophées de départ (500) sont remis à 0
update coin_ledger set amount = 0 where reason = 'start';

-- Progression de la quête principale : une étape = un bit (1 à 4)
alter table member_stats add column if not exists quest_mask int not null default 0;

create or replace function quest_step(p_member int, p_step int) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if p_step < 1 or p_step > 4 then raise exception 'Étape inconnue.'; end if;
  insert into member_stats (member_id) values (p_member) on conflict do nothing;
  update member_stats set quest_mask = (quest_mask | (1 << (p_step - 1))) & 15
    where member_id = p_member returning quest_mask into v;
  return v;
end $$;
grant execute on function quest_step(int, int) to anon, authenticated;

-- Défis (le nouveau « Le noob » s'ajoute, les autres sont inchangés)
insert into challenges (key, coins, skin) values
  ('clochard', 0, 'clochard'),
  ('propre_soi', 10, null),
  ('fee_logis', 100, null),
  ('nickel', 200, 'nickel'),
  ('premier_envol', 10, null),
  ('employe_friterie', 30, null),
  ('maitre_poussin', 100, 'poussin'),
  ('mascareigne', 0, null),
  ('diagonale', 0, 'hugodeck'),
  ('roc', 0, null),
  ('tailladeur', 0, null),
  ('mentaliste', 50, 'sorcier'),
  ('petit_nouveau', 0, null),
  ('maitre_rh', 0, null),
  ('pilier', 0, 'chevalier'),
  ('prince', 0, null),
  ('roi_coloc', 0, 'roi'),
  ('dieu_coloc', 0, 'zeus'),
  ('noob', 0, 'zippo'),
  ('mathematicien', 0, null),
  ('inspecteur', 0, 'detective')
on conflict (key) do update set coins = excluded.coins, skin = excluded.skin;

-- Zippo n'est plus débloqué au niveau 10 mais par le défi « Le noob »
delete from skin_levels where item = 'zippo';
-- ceux qui ont déjà « Le noob » reçoivent tout de suite l'apparence
insert into purchases (member_id, item, price)
  select member_id, 'zippo', 0 from unlocks where key = 'noob' on conflict do nothing;

-- Niveaux des apparences (Singe 3, Pirate 5, Ninja 8, Astronaute 10)
delete from skin_levels;
insert into skin_levels (item, level) values
  ('singe', 3),
  ('pirate', 5),
  ('ninja', 8),
  ('astronaute', 10);


-- ============================================================
--  Version 7 : savons (tâches validées par un coloc), trophées via les jeux, XP partout,
--              code secret à 4 chiffres, Blackjack, nouvelle courbe de niveaux
--  ⚠️ REMET À ZÉRO les stats, l'XP, les trophées, les défis et les apparences gagnées (une seule fois :
--     si tu relances ce fichier plus tard, la remise à zéro n'est PAS refaite).
-- ============================================================

create table if not exists app_meta (key text primary key, value text, created_at timestamptz not null default now());
alter table app_meta enable row level security;   -- aucune politique : invisible depuis l'appli

-- ---------- Nouvelles tables et colonnes ----------
alter table member_stats add column if not exists blackjack_played int not null default 0;
alter table member_stats add column if not exists blackjack_wins   int not null default 0;
alter table challenges   add column if not exists xp int not null default 0;

create table if not exists task_kinds (kind text primary key, soap int not null, cooldown_h int not null);
delete from task_kinds;
insert into task_kinds (kind, soap, cooldown_h) values
  ('cuisine', 4, 12),
  ('poubelles', 2, 12),
  ('wc', 5, 72),
  ('aspijour', 4, 24),
  ('sdb', 6, 72),
  ('aspieau', 3, 24);;

create table if not exists task_logs (
  id           bigint generated always as identity primary key,
  kind         text not null references task_kinds(kind),
  doer_id      int  not null references members(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'validated', 'rejected', 'cancelled')),
  soap         int  not null default 0,
  validator_id int references members(id) on delete set null,
  created_at   timestamptz not null default now(),
  answered_at  timestamptz
);
create index if not exists task_logs_kind on task_logs (kind, status);

-- ---------- Code secret (4 chiffres) ----------
alter table members add column if not exists has_pin boolean not null default false;
create table if not exists member_pins (
  member_id    int primary key references members(id) on delete cascade,
  salt         text not null,
  hash         text not null,
  fails        int  not null default 0,
  locked_until timestamptz
);
alter table member_pins enable row level security;   -- aucune politique : l'appli ne peut jamais lire les codes

create or replace function set_pin(p_member int, p_pin text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_salt text;
begin
  if p_pin !~ '^[0-9]{4}$' then raise exception 'Le code doit avoir 4 chiffres.'; end if;
  if exists (select 1 from member_pins where member_id = p_member) then raise exception 'Un code existe déjà pour ce joueur.'; end if;
  v_salt := md5(random()::text || clock_timestamp()::text);
  insert into member_pins (member_id, salt, hash) values (p_member, v_salt, encode(sha256(convert_to(v_salt || p_pin, 'UTF8')), 'hex'));
  update members set has_pin = true where id = p_member;
  return true;
end $$;

create or replace function check_pin(p_member int, p_pin text) returns json
language plpgsql security definer set search_path = public as $$
declare r member_pins; v_ok boolean;
begin
  select * into r from member_pins where member_id = p_member for update;
  if not found then return json_build_object('ok', false, 'locked_s', 0); end if;
  if r.locked_until is not null and r.locked_until > now() then
    return json_build_object('ok', false, 'locked_s', ceil(extract(epoch from r.locked_until - now()))::int);
  end if;
  v_ok := r.hash = encode(sha256(convert_to(r.salt || coalesce(p_pin, ''), 'UTF8')), 'hex');
  if v_ok then
    update member_pins set fails = 0, locked_until = null where member_id = p_member;
    return json_build_object('ok', true, 'locked_s', 0);
  end if;
  update member_pins set fails = case when r.fails + 1 >= 5 then 0 else r.fails + 1 end,
         locked_until = case when r.fails + 1 >= 5 then now() + interval '5 minutes' else null end
   where member_id = p_member;
  return json_build_object('ok', false, 'locked_s', case when r.fails + 1 >= 5 then 300 else 0 end);
end $$;
grant execute on function set_pin(int, text)   to anon, authenticated;
grant execute on function check_pin(int, text) to anon, authenticated;

-- ---------- Niveaux : courbe 7 × L × (L − 1), sans limite ----------
create or replace function level_of(p_xp int) returns int
language sql immutable as $$
  select floor((1 + sqrt(1 + greatest(p_xp, 0)::numeric * 4 / 7)) / 2)::int
$$;

-- Niveaux des apparences
delete from skin_levels;
insert into skin_levels (item, level) values
  ('singe', 3),
  ('pirate', 5),
  ('ninja', 8),
  ('astronaute', 10);;
delete from skin_levels where item = 'zippo';

-- ---------- Trophées = jeux uniquement ; savons = tâches validées ----------
create or replace function balance_of(p_member int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(amount) from coin_ledger where member_id = p_member), 0)::int
$$;

create or replace view scores as
  select doer_id as member_id, sum(soap)::int as coins, count(*)::int as done_count
  from task_logs where status = 'validated' group by doer_id;
grant select on scores to anon, authenticated;

create or replace view weekly_trophies as
  select member_id, date_trunc('week', created_at at time zone 'Indian/Reunion')::date as week, sum(amount)::int as trophies
  from coin_ledger where reason <> 'start' group by member_id, date_trunc('week', created_at at time zone 'Indian/Reunion')::date;
grant select on weekly_trophies to anon, authenticated;

-- ---------- Tâches : un coloc fait, un AUTRE coloc confirme ----------
create or replace function submit_task(p_member int, p_kind text) returns bigint
language plpgsql security definer set search_path = public as $$
declare k task_kinds; v_id bigint; v_last timestamptz;
begin
  if not exists (select 1 from members where id = p_member and kind = 'coloc') then
    raise exception 'Seuls les colocataires font les tâches.';
  end if;
  select * into k from task_kinds where kind = p_kind;
  if not found then raise exception 'Tâche inconnue.'; end if;
  perform pg_advisory_xact_lock(hashtext('task:' || p_kind));
  if exists (select 1 from task_logs where kind = p_kind and status = 'pending') then
    raise exception 'Cette tâche est déjà en attente de confirmation.';
  end if;
  select max(answered_at) into v_last from task_logs where kind = p_kind and status = 'validated';
  if v_last is not null and v_last > now() - make_interval(hours => k.cooldown_h) then
    raise exception 'Cette tâche vient déjà d''être faite.';
  end if;
  insert into task_logs (kind, doer_id, soap) values (p_kind, p_member, k.soap) returning id into v_id;
  return v_id;
end $$;

-- p_ok = true : un AUTRE coloc confirme · false : il refuse, ou l'auteur annule sa demande
create or replace function answer_task(p_log bigint, p_member int, p_ok boolean) returns task_logs
language plpgsql security definer set search_path = public as $$
declare l task_logs;
begin
  select * into l from task_logs where id = p_log for update;
  if not found or l.status <> 'pending' then raise exception 'Cette tâche n''est plus en attente.'; end if;
  if p_member = l.doer_id then
    if p_ok then raise exception 'Il faut qu''un autre coloc confirme ta tâche.'; end if;
    update task_logs set status = 'cancelled', answered_at = now() where id = p_log returning * into l;
    return l;
  end if;
  if not exists (select 1 from members where id = p_member and kind = 'coloc') then
    raise exception 'Seuls les colocataires peuvent confirmer.';
  end if;
  if p_ok then
    update task_logs set status = 'validated', validator_id = p_member, answered_at = now() where id = p_log returning * into l;
    perform add_xp(l.doer_id, l.soap * 25, 'task');
    perform add_xp(p_member, 10, 'validate');
  else
    update task_logs set status = 'rejected', validator_id = p_member, answered_at = now() where id = p_log returning * into l;
  end if;
  return l;
end $$;
grant execute on function submit_task(int, text)        to anon, authenticated;
grant execute on function answer_task(bigint, int, boolean) to anon, authenticated;

alter table task_kinds enable row level security;
alter table task_logs  enable row level security;
drop policy if exists "task_kinds lecture" on task_kinds; create policy "task_kinds lecture" on task_kinds for select using (true);
drop policy if exists "task_logs lecture"  on task_logs;  create policy "task_logs lecture"  on task_logs  for select using (true);
do $$ begin
  begin alter publication supabase_realtime add table task_logs; exception when duplicate_object then null; end;
end $$;

-- ---------- XP : paliers de score ----------
create or replace function milestone_xp(p_game text, p_old numeric, p_new numeric) returns int
language plpgsql immutable as $$
declare v_at int[]; v_xp int[]; v_low boolean := false; i int; t int := 0;
begin
  if p_game = 'flappy' then v_at := array[10, 25, 50, 100, 250, 500, 1000]; v_xp := array[50, 100, 150, 250, 400, 600, 1000];
  elsif p_game = 'raid' then v_at := array[500, 1000, 3070, 6000, 10000, 20000]; v_xp := array[50, 100, 200, 300, 500, 800];
  elsif p_game = 'sudoku' then v_at := array[900, 600, 420, 300, 240]; v_xp := array[50, 100, 200, 400, 700]; v_low := true;
  else return 0; end if;
  for i in 1 .. array_length(v_at, 1) loop
    if v_low then
      if p_new <= v_at[i] and (p_old is null or p_old > v_at[i]) then t := t + v_xp[i]; end if;
    else
      if p_new >= v_at[i] and coalesce(p_old, 0) < v_at[i] then t := t + v_xp[i]; end if;
    end if;
  end loop;
  return t;
end $$;

-- ---------- Jeux ----------
create or replace function report_game(p_member int, p_game text, p_score int) returns member_stats
language plpgsql security definer set search_path = public as $$
declare s member_stats; v_xp int := 0; v_new int; v_want int := 0; v_today int;
begin
  if p_score is null or p_score < 0 then raise exception 'Score invalide.'; end if;
  insert into member_stats (member_id) values (p_member) on conflict do nothing;
  select * into s from member_stats where member_id = p_member for update;
  if p_game = 'flappy' then
    v_new := least(p_score, 5000);
    v_xp := least(p_score * 3, 300) + milestone_xp('flappy', s.flappy_best, v_new);
    update member_stats set flappy_best = greatest(flappy_best, v_new), flappy_total = flappy_total + v_new where member_id = p_member;
  elsif p_game = 'raid' then
    v_new := least(p_score, 1000000);
    v_xp := least((p_score / 50) * 2, 300) + milestone_xp('raid', s.raid_best, v_new);
    update member_stats set raid_best = greatest(raid_best, v_new) where member_id = p_member;
  elsif p_game = 'sudoku' then
    if p_score < 20 then raise exception 'Temps invalide.'; end if;
    v_xp := 150 + milestone_xp('sudoku', s.sudoku_best, p_score);
    update member_stats set sudoku_done = sudoku_done + 1, sudoku_best = least(coalesce(sudoku_best, p_score), p_score) where member_id = p_member;
  elsif p_game = 'blackjack' then
    if p_score > 3 then raise exception 'Résultat invalide.'; end if;   -- 0 perdu · 1 égalité · 2 gagné · 3 blackjack
    v_xp := 10 + case p_score when 2 then 15 when 3 then 30 else 0 end;
    v_want := case p_score when 2 then 1 when 3 then 2 else 0 end;
    select coalesce(sum(amount), 0) into v_today from coin_ledger
      where member_id = p_member and reason = 'blackjack'
        and (created_at at time zone 'Indian/Reunion')::date = (now() at time zone 'Indian/Reunion')::date;
    v_want := greatest(0, least(v_want, 6 - v_today));
    if v_want > 0 then insert into coin_ledger (member_id, amount, reason) values (p_member, v_want, 'blackjack'); end if;
    update member_stats set blackjack_played = blackjack_played + 1, blackjack_wins = blackjack_wins + (case when p_score >= 2 then 1 else 0 end)
     where member_id = p_member;
  else raise exception 'Jeu inconnu.';
  end if;
  perform add_xp(p_member, v_xp, 'game:' || p_game);
  select * into s from member_stats where member_id = p_member;
  return s;
end $$;

create or replace function play_duel(p_duel bigint, p_player int, p_move text) returns duels
language plpgsql security definer set search_path = public as $$
declare d duels; cm text; w int; v_today int; v_want int;
begin
  if p_move not in ('pierre', 'feuille', 'ciseaux') then raise exception 'Coup invalide.'; end if;
  select * into d from duels where id = p_duel for update;
  if not found or d.status <> 'pending' then raise exception 'Ce défi n''est plus disponible.'; end if;
  if d.opponent_id <> p_player then raise exception 'Ce défi ne t''est pas adressé.'; end if;
  select move into cm from duel_secrets where duel_id = p_duel;
  w := case
    when cm = p_move then null
    when (cm = 'pierre' and p_move = 'ciseaux') or (cm = 'feuille' and p_move = 'pierre') or (cm = 'ciseaux' and p_move = 'feuille')
      then d.challenger_id
    else d.opponent_id
  end;
  update duels set status = 'done', challenger_move = cm, opponent_move = p_move, winner_id = w, played_at = now()
   where id = p_duel returning * into d;
  delete from duel_secrets where duel_id = p_duel;
  perform add_xp(d.challenger_id, 15, 'duel');
  perform add_xp(d.opponent_id, 15, 'duel');
  if w is not null then
    perform add_xp(w, 25, 'duel-win');
    select coalesce(sum(amount), 0) into v_today from coin_ledger
      where member_id = w and reason = 'duel-win'
        and (created_at at time zone 'Indian/Reunion')::date = (now() at time zone 'Indian/Reunion')::date;
    v_want := greatest(0, least(2, 10 - v_today));
    if v_want > 0 then insert into coin_ledger (member_id, amount, reason) values (w, v_want, 'duel-win'); end if;
  end if;
  return d;
end $$;

-- ---------- Récompense quotidienne et roue : de l'XP ----------
create or replace function claim_daily(p_member int, p_day date) returns json
language plpgsql security definer set search_path = public as $$
declare s member_stats; v_streak int; v_xp int := 0; v_wheel boolean := false;
  v_table int[] := array[30, 40, 50, 60, 80, 100];
begin
  if p_day not between current_date - 1 and current_date + 1 then raise exception 'Date invalide.'; end if;
  insert into member_stats (member_id) values (p_member) on conflict do nothing;
  select * into s from member_stats where member_id = p_member for update;
  if s.last_login = p_day then raise exception 'Récompense déjà récupérée aujourd''hui.'; end if;
  if s.last_login = p_day - 1 and s.streak < 7 then v_streak := s.streak + 1; else v_streak := 1; end if;
  if v_streak = 7 then v_wheel := true; else v_xp := v_table[v_streak]; end if;
  update member_stats set streak = v_streak, last_login = p_day, login_days = login_days + 1,
         wheel_ready = wheel_ready or v_wheel where member_id = p_member;
  perform add_xp(p_member, v_xp, 'daily');
  return json_build_object('streak', v_streak, 'xp', v_xp, 'wheel', v_wheel);
end $$;

create or replace function spin_wheel(p_member int) returns int
language plpgsql security definer set search_path = public as $$
declare v_amount int;
begin
  perform 1 from member_stats where member_id = p_member and wheel_ready for update;
  if not found then raise exception 'La roue n''est pas débloquée.'; end if;
  v_amount := 100 + floor(random() * (1000 - 100 + 1))::int;
  update member_stats set wheel_ready = false where member_id = p_member;
  perform add_xp(p_member, v_amount, 'wheel');
  return v_amount;
end $$;

-- ---------- Défis : XP (plus de trophées) ----------
delete from challenges;
insert into challenges (key, coins, skin, xp) values
  ('propre_soi', 0, null, 100),
  ('fee_logis', 0, null, 400),
  ('nickel', 0, 'nickel', 800),
  ('premier_envol', 0, null, 100),
  ('employe_friterie', 0, null, 300),
  ('maitre_poussin', 0, 'poussin', 800),
  ('legende_airs', 0, 'papangue', 2000),
  ('mascareigne', 0, null, 300),
  ('diagonale', 0, 'hugodeck', 1000),
  ('roc', 0, null, 100),
  ('tailladeur', 0, null, 200),
  ('mentaliste', 0, 'sorcier', 600),
  ('clochard', 0, 'clochard', 100),
  ('petit_nouveau', 0, null, 100),
  ('maitre_rh', 0, null, 1000),
  ('pilier', 0, 'chevalier', 800),
  ('prince', 0, null, 300),
  ('roi_coloc', 0, 'roi', 600),
  ('dieu_coloc', 0, 'zeus', 2000),
  ('noob', 0, 'zippo', 100),
  ('mathematicien', 0, null, 200),
  ('inspecteur', 0, 'detective', 200);;

create or replace function claim_challenge(p_member int, p_key text) returns json
language plpgsql security definer set search_path = public as $$
declare c challenges;
begin
  select * into c from challenges where key = p_key;
  if not found then raise exception 'Défi inconnu.'; end if;
  insert into unlocks (member_id, key) values (p_member, p_key) on conflict do nothing;
  if not found then return null; end if;   -- déjà réussi
  if c.skin is not null then
    insert into purchases (member_id, item, price) values (p_member, c.skin, 0) on conflict do nothing;
  end if;
  perform add_xp(p_member, c.xp, 'challenge:' || p_key);
  return json_build_object('key', c.key, 'xp', c.xp, 'skin', c.skin);
end $$;

-- Plus de planning : les anciennes tâches et échanges n'ont plus d'usage
drop trigger if exists tasks_xp on tasks;

-- ---------- REMISE À ZÉRO (une seule fois) ----------
do $$ begin
  if not exists (select 1 from app_meta where key = 'reset_v7') then
    delete from xp_log;
    delete from coin_ledger;
    delete from duels;
    delete from unlocks;
    delete from purchases;
    delete from profile_views;
    delete from task_logs;
    delete from task_requests;
    delete from tasks;
    delete from member_stats;
    insert into member_stats (member_id) select id from members;
    update members set outfit = 'none', title = null;
    insert into app_meta (key, value) values ('reset_v7', 'done');
  end if;
end $$;


-- ============================================================
--  Version 8 : introduction (5 onglets), plateau (jeu de l'oie), messages courts,
--              chifoumi +5/−4 trophées, blackjack avec mises, niveaux plus durs
--  Ne remet RIEN à zéro. Sans risque si relancé.
-- ============================================================

-- ---------- Niveaux : courbe 25 × L × (L − 1) ----------
create or replace function level_of(p_xp int) returns int
language sql immutable as $$
  select floor((1 + sqrt(1 + greatest(p_xp, 0)::numeric * 4 / 25)) / 2)::int
$$;

-- ---------- Introduction : 5 étapes (une par onglet) ----------
create or replace function quest_step(p_member int, p_step int) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if p_step < 1 or p_step > 6 then raise exception 'Étape inconnue.'; end if;
  insert into member_stats (member_id) values (p_member) on conflict do nothing;
  update member_stats set quest_mask = (quest_mask | (1 << (p_step - 1))) & 63
    where member_id = p_member returning quest_mask into v;
  return v;
end $$;
-- ceux qui avaient fini l'ancienne quête (4 étapes) ne refont pas l'introduction
update member_stats set quest_mask = 63 where quest_mask in (15, 31);

-- ---------- Colocoins (monnaie du blackjack) ----------
alter table members add column if not exists badge text;   -- badge mis en avant sur le profil
alter table members add column if not exists frame text;    -- cadre de profil équipé (boutique)
alter table members add column if not exists namefx text;   -- effet de pseudo équipé (boutique)
alter table members add column if not exists bird text;     -- look de l'oiseau de Jumpy Cardinal (boutique)

-- ---------- Boutique : cadres, effets de pseudo, looks de l'oiseau (payés en colocoins) ----------
create table if not exists shop_items (item text primary key, slot text not null, price int not null check (price >= 0));
delete from shop_items;
insert into shop_items (item, slot, price) values
  ('frame:bronze', 'frame', 150),
  ('frame:argent', 'frame', 300),
  ('frame:or', 'frame', 600),
  ('frame:rubis', 'frame', 500),
  ('frame:neon', 'frame', 800),
  ('frame:arcenciel', 'frame', 1000),
  ('frame:flammes', 'frame', 1500),
  ('frame:glace', 'frame', 1500),
  ('frame:royal', 'frame', 2500),
  ('namefx:rouge', 'namefx', 100),
  ('namefx:bleu', 'namefx', 100),
  ('namefx:vert', 'namefx', 100),
  ('namefx:violet', 'namefx', 100),
  ('namefx:rose', 'namefx', 100),
  ('namefx:dore', 'namefx', 300),
  ('namefx:neon', 'namefx', 400),
  ('namefx:arcenciel', 'namefx', 500),
  ('namefx:feu', 'namefx', 600),
  ('bird:bleu', 'bird', 120),
  ('bird:vert', 'bird', 120),
  ('bird:rose', 'bird', 150),
  ('bird:jaune', 'bird', 150),
  ('bird:lunettes', 'bird', 250),
  ('bird:ninja', 'bird', 300),
  ('bird:or', 'bird', 700),
  ('bird:arcenciel', 'bird', 1000);
alter table shop_items enable row level security;
drop policy if exists "shop lecture" on shop_items; create policy "shop lecture" on shop_items for select using (true);

create or replace function buy_shop(p_member int, p_item text) returns json
language plpgsql security definer set search_path = public as $$
declare v_price int;
begin
  perform pg_advisory_xact_lock(hashtext('shop:' || p_member));
  select price into v_price from shop_items where item = p_item;
  if v_price is null then raise exception 'Article inconnu.'; end if;
  if exists (select 1 from purchases where member_id = p_member and item = p_item) then raise exception 'Tu possèdes déjà cet article.'; end if;
  if chips_of(p_member) < v_price then raise exception 'Il te faut % colocoins.', v_price; end if;
  insert into chip_ledger (member_id, amount, reason) values (p_member, -v_price, 'shop');
  insert into purchases (member_id, item, price) values (p_member, p_item, 0);
  return json_build_object('item', p_item, 'price', v_price);
end $$;
grant execute on function buy_shop(int, text) to anon, authenticated;

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
  if new.frame is distinct from old.frame and new.frame is not null
     and not exists (select 1 from purchases where member_id = new.id and item = 'frame:' || new.frame) then
    raise exception 'Ce cadre n''est pas acheté.';
  end if;
  if new.namefx is distinct from old.namefx and new.namefx is not null
     and not exists (select 1 from purchases where member_id = new.id and item = 'namefx:' || new.namefx) then
    raise exception 'Cet effet n''est pas acheté.';
  end if;
  if new.bird is distinct from old.bird and new.bird is not null
     and not exists (select 1 from purchases where member_id = new.id and item = 'bird:' || new.bird) then
    raise exception 'Ce look n''est pas acheté.';
  end if;
  return new;
end $$;

create table if not exists chip_ledger (
  id         bigint generated always as identity primary key,
  member_id  int  not null references members(id) on delete cascade,
  amount     int  not null,
  reason     text not null,
  created_at timestamptz not null default now()
);
create index if not exists chip_ledger_member on chip_ledger (member_id);
create or replace view chip_balances as
  select m.id as member_id, coalesce(sum(c.amount), 0)::int as chips
  from members m left join chip_ledger c on c.member_id = m.id group by m.id;
grant select on chip_balances to anon, authenticated;
create or replace function chips_of(p_member int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(amount) from chip_ledger where member_id = p_member), 0)::int
$$;
alter table chip_ledger enable row level security;
drop policy if exists "chips lecture" on chip_ledger; create policy "chips lecture" on chip_ledger for select using (true);
do $$ begin
  begin alter publication supabase_realtime add table chip_ledger; exception when duplicate_object then null; end;
end $$;

-- Récompense du jour : 50 colocoins + 50 XP (plus de série ni de roue)
create or replace function claim_daily(p_member int, p_day date) returns json
language plpgsql security definer set search_path = public as $$
declare s member_stats; v_streak int;
begin
  if p_day not between current_date - 1 and current_date + 1 then raise exception 'Date invalide.'; end if;
  insert into member_stats (member_id) values (p_member) on conflict do nothing;
  select * into s from member_stats where member_id = p_member for update;
  if s.last_login = p_day then raise exception 'Récompense déjà récupérée aujourd''hui.'; end if;
  if s.last_login = p_day - 1 and s.streak < 7 then v_streak := s.streak + 1; else v_streak := 1; end if;
  update member_stats set streak = v_streak, last_login = p_day, login_days = login_days + 1 where member_id = p_member;
  perform add_xp(p_member, 50, 'daily');
  insert into chip_ledger (member_id, amount, reason) values (p_member, 50, 'daily');
  return json_build_object('streak', v_streak, 'xp', 50, 'chips', 50, 'wheel', false);
end $$;
grant execute on function claim_daily(int, date) to anon, authenticated;

-- ---------- Chifoumi : un seul défi en attente à la fois avec un même joueur (dans un sens ou dans l'autre) ----------
create or replace function create_duel(p_challenger int, p_opponent int, p_wager int, p_move text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_move not in ('pierre', 'feuille', 'ciseaux') then raise exception 'Coup invalide.'; end if;
  if coalesce(p_wager, 0) <> 10 then raise exception 'La mise du chifoumi est de 10 colocoins.'; end if;
  if chips_of(p_challenger) < 10 then raise exception 'Il te faut au moins 10 colocoins pour défier.'; end if;
  if p_challenger = p_opponent then raise exception 'Tu ne peux pas te défier toi-même.'; end if;
  perform pg_advisory_xact_lock(hashtext('duel:' || least(p_challenger, p_opponent) || '-' || greatest(p_challenger, p_opponent)));
  if exists (select 1 from duels where status = 'pending'
             and ((challenger_id = p_challenger and opponent_id = p_opponent) or (challenger_id = p_opponent and opponent_id = p_challenger))) then
    raise exception 'Un défi est déjà en attente avec ce joueur.';
  end if;
  insert into duels (challenger_id, opponent_id, wager) values (p_challenger, p_opponent, 10) returning id into v_id;
  insert into duel_secrets (duel_id, move) values (v_id, p_move);
  return v_id;
end $$;
grant execute on function create_duel(int, int, int, text) to anon, authenticated;

-- ---------- Savons dépensés (dés du plateau) ----------
create table if not exists goose_cells (cell int primary key, kind text not null, v int not null default 0);
delete from goose_cells;
insert into goose_cells (cell, kind, v) values
  (3, 'chips', 20),
  (5, 'xp', 30),
  (7, 'back', 1),
  (9, 'goose', 0),
  (10, 'xp', 40),
  (13, 'chips', 20),
  (15, 'xp', 50),
  (17, 'back', 1),
  (18, 'goose', 0),
  (20, 'xp', 60),
  (23, 'chips', 40),
  (25, 'xp', 80),
  (27, 'back', 1);;

create table if not exists dice_rolls (
  id         bigint generated always as identity primary key,
  member_id  int  not null references members(id) on delete cascade,
  week       date not null,                 -- lundi de la semaine (heure de La Réunion)
  cost       int  not null,
  roll       int  not null,
  from_pos   int  not null,
  to_pos     int  not null,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists dice_rolls_week on dice_rolls (week, member_id);

create or replace view soap_spent as
  select member_id, sum(cost)::int as spent from dice_rolls group by member_id;
grant select on soap_spent to anon, authenticated;

-- Savons disponibles = gagnés (tâches validées) − dépensés
create or replace function soap_of(p_member int) returns int
language sql stable security definer set search_path = public as $$
  select (coalesce((select sum(soap) from task_logs where doer_id = p_member and status = 'validated'), 0)
        - coalesce((select sum(cost) from dice_rolls where member_id = p_member), 0))::int
$$;

-- Récompenses immatérielles d'arrivée (une par joueur et par semaine) + confirmations des colocs
create table if not exists perks (
  id         bigint generated always as identity primary key,
  member_id  int  not null references members(id) on delete cascade,
  week       date not null,
  kind       text not null,
  created_at timestamptz not null default now(),
  unique (member_id, week)
);
create table if not exists perk_confirms (
  perk_id    bigint not null references perks(id) on delete cascade,
  member_id  int    not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (perk_id, member_id)
);
alter table perks enable row level security;
alter table perk_confirms enable row level security;
drop policy if exists "perks lecture" on perks; create policy "perks lecture" on perks for select using (true);
drop policy if exists "perkc lecture" on perk_confirms; create policy "perkc lecture" on perk_confirms for select using (true);
do $$ begin
  begin alter publication supabase_realtime add table perks; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table perk_confirms; exception when duplicate_object then null; end;
end $$;
-- « J'ai offert ma part » : seul un autre coloc peut confirmer, et seulement pour les récompenses à tenir
create or replace function confirm_perk(p_perk bigint, p_member int) returns void
language plpgsql security definer set search_path = public as $$
declare v_p perks;
begin
  select * into v_p from perks where id = p_perk;
  if not found then raise exception 'Récompense introuvable.'; end if;
  if v_p.kind not in ('biere', 'course') then raise exception 'Rien à confirmer ici.'; end if;
  if p_member = v_p.member_id or not exists (select 1 from members where id = p_member and kind = 'coloc') then raise exception 'Seuls les autres colocs confirment.'; end if;
  insert into perk_confirms (perk_id, member_id) values (p_perk, p_member) on conflict do nothing;
end $$;
grant execute on function confirm_perk(bigint, int) to anon, authenticated;

-- Lancer un dé : le 1er du jour est gratuit, puis 1, 3, 5, 10, 20 savons (repart à minuit, heure de La Réunion). Tours infinis.
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
  if soap_of(p_member) < v_cost then raise exception 'Il te faut % savon% pour ce dé.', v_cost, case when v_cost > 1 then 's' else '' end; end if;
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
    if v_laps = 0 then
      v_perk := (array['biere', 'course', 'vacances'])[1 + ((v_week - date '2024-01-01') / 7) % 3];
      insert into perks (member_id, week, kind) values (p_member, v_week, v_perk) on conflict do nothing;
    end if;
  end if;
  insert into dice_rolls (member_id, week, cost, roll, from_pos, to_pos, note) values (p_member, v_week, v_cost, v_roll, v_pos, v_to, nullif(trim(v_note), ''));
  if v_xp > 0 then perform add_xp(p_member, v_xp, 'plateau'); end if;
  if v_tr > 0 then insert into coin_ledger (member_id, amount, reason) values (p_member, v_tr, 'plateau'); end if;
  if v_ch > 0 then insert into chip_ledger (member_id, amount, reason) values (p_member, v_ch, 'plateau'); end if;
  return json_build_object('perk', v_perk, 'roll', v_roll, 'from', v_pos, 'to', v_to, 'cost', v_cost, 'xp', v_xp, 'trophies', v_tr, 'chips', v_ch, 'note', trim(v_note));
end $$;
grant execute on function roll_dice(int) to anon, authenticated;

alter table goose_cells enable row level security;
alter table dice_rolls  enable row level security;
drop policy if exists "goose lecture" on goose_cells; create policy "goose lecture" on goose_cells for select using (true);
drop policy if exists "dice lecture"  on dice_rolls;  create policy "dice lecture"  on dice_rolls  for select using (true);
do $$ begin
  begin alter publication supabase_realtime add table dice_rolls; exception when duplicate_object then null; end;
end $$;

-- ---------- Messages courts ----------
create table if not exists messages (
  id         bigint generated always as identity primary key,
  from_id    int  not null references members(id) on delete cascade,
  to_id      int  not null references members(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 140),
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  check (from_id <> to_id)
);
create index if not exists messages_to on messages (to_id, created_at desc);

create or replace function send_message(p_from int, p_to int, p_body text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_body text := trim(p_body);
begin
  if v_body is null or char_length(v_body) = 0 then raise exception 'Écris un message.'; end if;
  if char_length(v_body) > 140 then raise exception 'Message trop long (140 caractères maximum).'; end if;
  if p_from = p_to then raise exception 'Tu ne peux pas t''écrire à toi-même.'; end if;
  if (select count(*) from messages where from_id = p_from and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Trop de messages d''un coup, réessaie dans un moment.';
  end if;
  insert into messages (from_id, to_id, body) values (p_from, p_to, v_body) returning id into v_id;
  return v_id;
end $$;
create or replace function read_messages(p_member int) returns void
language sql security definer set search_path = public as $$
  update messages set read_at = now() where to_id = p_member and read_at is null
$$;
grant execute on function send_message(int, int, text) to anon, authenticated;
grant execute on function read_messages(int)           to anon, authenticated;
alter table messages enable row level security;
drop policy if exists "messages lecture" on messages; create policy "messages lecture" on messages for select using (true);
do $$ begin
  begin alter publication supabase_realtime add table messages; exception when duplicate_object then null; end;
end $$;

-- ---------- Chifoumi : mise de 10 colocoins (le gagnant les prend au perdant) + 5 trophées au gagnant ----------
create or replace function play_duel(p_duel bigint, p_player int, p_move text) returns duels
language plpgsql security definer set search_path = public as $$
declare d duels; cm text; w int; l int; v_today int; v_gain int; v_loss int; v_stake int;
begin
  if p_move not in ('pierre', 'feuille', 'ciseaux') then raise exception 'Coup invalide.'; end if;
  select * into d from duels where id = p_duel for update;
  if not found or d.status <> 'pending' then raise exception 'Ce défi n''est plus disponible.'; end if;
  if d.opponent_id <> p_player then raise exception 'Ce défi ne t''est pas adressé.'; end if;
  if chips_of(p_player) < d.wager then raise exception 'Il te faut au moins % colocoins pour relever ce défi.', d.wager; end if;
  select move into cm from duel_secrets where duel_id = p_duel;
  w := case
    when cm = p_move then null
    when (cm = 'pierre' and p_move = 'ciseaux') or (cm = 'feuille' and p_move = 'pierre') or (cm = 'ciseaux' and p_move = 'feuille')
      then d.challenger_id
    else d.opponent_id
  end;
  update duels set status = 'done', challenger_move = cm, opponent_move = p_move, winner_id = w, played_at = now()
   where id = p_duel returning * into d;
  delete from duel_secrets where duel_id = p_duel;
  perform add_xp(d.challenger_id, 15, 'duel');
  perform add_xp(d.opponent_id, 15, 'duel');
  if w is not null then
    l := case when w = d.challenger_id then d.opponent_id else d.challenger_id end;
    perform add_xp(w, 25, 'duel-win');
    select coalesce(sum(amount), 0) into v_today from coin_ledger
      where member_id = w and reason = 'duel-win'
        and (created_at at time zone 'Indian/Reunion')::date = (now() at time zone 'Indian/Reunion')::date;
    v_gain := greatest(0, least(0, 25 - v_today));
    if v_gain > 0 then insert into coin_ledger (member_id, amount, reason) values (w, v_gain, 'duel-win'); end if;
    v_stake := least(d.wager, greatest(chips_of(l), 0));          -- le perdant paie sa mise (jamais sous 0)
    if v_stake > 0 then
      insert into chip_ledger (member_id, amount, reason) values (l, -v_stake, 'duel-loss');
      insert into chip_ledger (member_id, amount, reason) values (w, v_stake, 'duel-win');
    end if;
  end if;
  return d;
end $$;

-- ---------- Blackjack : on mise des colocoins (10-20-30-50, puis 100-200-300-500 au-delà de 500 colocoins) ----------
-- p_net = gain (+) ou perte (−) de colocoins de la main, p_hands = 1 (ou 2 après un split), p_wins = mains gagnées
create or replace function report_blackjack(p_member int, p_bet int, p_net int, p_hands int, p_wins int, p_blackjack boolean) returns member_stats
language plpgsql security definer set search_path = public as $$
declare s member_stats; v_xp int; v_net int; v_bal int;
begin
  if p_bet not in (5, 10, 25, 50, 100, 200, 300, 500) then raise exception 'Mise invalide.'; end if;
  if p_hands not between 1 and 2 or p_wins not between 0 and p_hands then raise exception 'Résultat invalide.'; end if;
  if abs(p_net) > 4 * p_bet then raise exception 'Résultat invalide.'; end if;
  insert into member_stats (member_id) values (p_member) on conflict do nothing;
  v_bal := chips_of(p_member);
  v_net := case when p_net < 0 then -least(-p_net, greatest(v_bal, 0)) else p_net end;   -- on ne descend jamais sous 0
  if v_net <> 0 then insert into chip_ledger (member_id, amount, reason) values (p_member, v_net, 'blackjack'); end if;
  v_xp := p_hands * 10 + p_wins * 15 + case when p_blackjack then 30 else 0 end;
  perform add_xp(p_member, v_xp, 'game:blackjack');
  update member_stats set blackjack_played = blackjack_played + p_hands, blackjack_wins = blackjack_wins + p_wins where member_id = p_member;
  select * into s from member_stats where member_id = p_member;
  return s;
end $$;
grant execute on function report_blackjack(int, int, int, int, int, boolean) to anon, authenticated;

-- ---------- Défis (textes et XP) ----------
delete from challenges;
insert into challenges (key, coins, skin, xp) values
  ('propre_soi', 0, null, 100),
  ('fee_logis', 0, null, 400),
  ('nickel', 0, 'nickel', 800),
  ('premier_envol', 0, null, 100),
  ('employe_friterie', 0, null, 300),
  ('maitre_poussin', 0, 'poussin', 800),
  ('legende_airs', 0, 'papangue', 2000),
  ('mascareigne', 0, null, 300),
  ('diagonale', 0, 'hugodeck', 1000),
  ('roc', 0, null, 100),
  ('tailladeur', 0, null, 200),
  ('mentaliste', 0, 'sorcier', 600),
  ('clochard', 0, 'clochard', 100),
  ('petit_nouveau', 0, null, 100),
  ('maitre_rh', 0, null, 1000),
  ('pilier', 0, 'chevalier', 800),
  ('dollars_500', 0, null, 300),
  ('dollars_1000', 0, 'roi', 800),
  ('dollars_10000', 0, 'zeus', 3000),
  ('noob', 0, 'zippo', 100),
  ('mathematicien', 0, null, 200),
  ('inspecteur', 0, 'detective', 200);;

-- ---------- REMISE À ZÉRO COMPLÈTE (une seule fois) : XP, records, trophées, colocoins, savons, défis, apparences ----------
do $$ begin
  if not exists (select 1 from app_meta where key = 'reset_v11b') then
    create temp table _qm on commit drop as select member_id, quest_mask from member_stats;
    delete from xp_log;
    delete from coin_ledger;
    delete from chip_ledger;
    delete from duel_secrets;
    delete from duels;
    delete from unlocks;
    delete from purchases;
    delete from profile_views;
    delete from task_logs;
    delete from dice_rolls;
    delete from perks;
    delete from member_stats;
    insert into member_stats (member_id) select id from members;
    update member_stats s set quest_mask = q.quest_mask from _qm q where q.member_id = s.member_id;   -- l'introduction déjà vue n'est pas rejouée
    update members set outfit = 'none', title = null, badge = null;
    insert into app_meta (key, value) values ('reset_v11b', 'done');
  end if;
end $$;

-- ---------- Tout le monde revoit l'introduction (une seule fois) ----------
do $$ begin
  if not exists (select 1 from app_meta where key = 'intro_again_v11') then
    update member_stats set quest_mask = 0;
    insert into app_meta (key, value) values ('intro_again_v11', 'done');
  end if;
end $$;
