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
