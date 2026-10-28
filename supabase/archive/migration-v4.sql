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
