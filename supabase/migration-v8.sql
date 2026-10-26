-- ============================================================
--  Version 8 : introduction (5 onglets), plateau (jeu de l'oie), messages courts,
--              chifoumi +5/−4 trophées, blackjack avec mises, niveaux plus durs
--  Ne remet RIEN à zéro. Sans risque si relancé.
-- ============================================================

-- ---------- Niveaux : courbe 25 × L × (L − 1) ----------
create or replace function level_of(p_xp int) returns int
language sql immutable as $$
  select floor((1 + sqrt(1 + greatest(p_xp - 100, 0)::numeric * 4 / 25)) / 2)::int
$$;

-- ---------- EXP + palier : tous les 10 niveaux, 100 colocoins (une seule fois par palier) ----------
create or replace function add_xp(p_member int, p_amount int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_lvl int; n int;
begin
  if p_amount is null or p_amount = 0 then return; end if;
  insert into xp_log (member_id, amount, reason) values (p_member, p_amount, p_reason);
  select level_of(coalesce(sum(amount), 0)::int) into v_lvl from xp_log where member_id = p_member;
  n := 10;
  while n <= v_lvl loop
    if not exists (select 1 from chip_ledger where member_id = p_member and reason = 'level:' || n) then
      insert into chip_ledger (member_id, amount, reason) values (p_member, 100, 'level:' || n);
    end if;
    n := n + 10;
  end loop;
end $$;
revoke execute on function add_xp(int, int, text) from public, anon, authenticated;

-- ---------- Introduction : 5 étapes (une par onglet) ----------
create or replace function quest_step(p_member int, p_step int) returns int
language plpgsql security definer set search_path = public as $$
declare v int; v_old int;
begin
  if p_step < 1 or p_step > 6 then raise exception 'Étape inconnue.'; end if;
  insert into member_stats (member_id) values (p_member) on conflict do nothing;
  select quest_mask into v_old from member_stats where member_id = p_member for update;
  update member_stats set quest_mask = (quest_mask | (1 << (p_step - 1))) & 63
    where member_id = p_member returning quest_mask into v;
  if v = 63 and v_old <> 63 and not exists (select 1 from xp_log where member_id = p_member and reason = 'intro') then
    perform add_xp(p_member, 50, 'intro');                  -- fin de l'introduction : 1re étape vers le niveau 2
  end if;
  return v;
end $$;

-- Premier lancement d'un jeu (une seule fois) : dernière étape vers le niveau 2
create or replace function launch_game(p_member int) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from xp_log where member_id = p_member and reason = 'first_game') then
    perform add_xp(p_member, 50, 'first_game');
    return 50;
  end if;
  return 0;
end $$;
grant execute on function launch_game(int) to anon, authenticated;
-- ceux qui avaient fini l'ancienne quête (4 étapes) ne refont pas l'introduction
update member_stats set quest_mask = 63 where quest_mask in (15, 31);

-- ---------- Colocoins (monnaie du blackjack) ----------
alter table members add column if not exists badge text;   -- badge mis en avant sur le profil
alter table members add column if not exists frame text;    -- cadre de profil équipé (boutique)
alter table members add column if not exists namefx text;   -- effet de pseudo équipé (boutique)
alter table members add column if not exists bird text;     -- look de l'oiseau de Jumpy Cardinal (boutique)

-- ---------- Apparences débloquées au niveau (singe 5, tortue 10, lion 20, dino 30) ----------
delete from skin_levels;
insert into skin_levels (item, level) values
  ('singe', 5),
  ('tortue', 10),
  ('lion', 20),
  ('dino', 30);

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
  ('bird:arcenciel', 'bird', 1000),
  ('bird:chevalier', 'bird', 500),
  ('bird:tenebres', 'bird', 900),
  ('outfit:pirate', 'outfit', 400),
  ('outfit:ninja', 'outfit', 500),
  ('outfit:astronaute', 'outfit', 800),
  ('outfit:fee', 'outfit', 600),
  ('outfit:creole', 'outfit', 500),
  ('outfit:docteur', 'outfit', 600),
  ('outfit:chevalier', 'outfit', 1000);
alter table shop_items enable row level security;
drop policy if exists "shop lecture" on shop_items; create policy "shop lecture" on shop_items for select using (true);

create or replace function buy_shop(p_member int, p_item text) returns json
language plpgsql security definer set search_path = public as $$
declare v_price int; v_store text;
begin
  perform pg_advisory_xact_lock(hashtext('shop:' || p_member));
  select price into v_price from shop_items where item = p_item;
  if v_price is null then raise exception 'Article inconnu.'; end if;
  v_store := case when p_item like 'outfit:%' then substr(p_item, 8) else p_item end;      -- les apparences sont stockées sous leur nom simple
  if exists (select 1 from purchases where member_id = p_member and item = v_store) then raise exception 'Tu possèdes déjà cet article.'; end if;
  if chips_of(p_member) < v_price then raise exception 'Il te faut % colocoins.', v_price; end if;
  insert into chip_ledger (member_id, amount, reason) values (p_member, -v_price, 'shop');
  insert into purchases (member_id, item, price) values (p_member, v_store, 0);
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

-- Échanges savons → colocoins
create table if not exists soap_exchanges (
  id bigint generated always as identity primary key,
  member_id int not null references members(id) on delete cascade,
  soap int not null check (soap > 0),
  coins int not null check (coins > 0),
  created_at timestamptz not null default now()
);
alter table soap_exchanges enable row level security;
drop policy if exists "exch lecture" on soap_exchanges; create policy "exch lecture" on soap_exchanges for select using (true);
do $$ begin
  begin alter publication supabase_realtime add table soap_exchanges; exception when duplicate_object then null; end;
end $$;

create or replace view soap_spent as
  select m.id as member_id,
    (coalesce((select sum(cost) from dice_rolls where member_id = m.id), 0) + coalesce((select sum(soap) from soap_exchanges where member_id = m.id), 0))::int as spent
  from members m;
grant select on soap_spent to anon, authenticated;

-- Savons disponibles = gagnés (tâches validées) − dépensés
create or replace function soap_of(p_member int) returns int
language sql stable security definer set search_path = public as $$
  select (coalesce((select sum(soap) from task_logs where doer_id = p_member and status = 'validated'), 0)
        - coalesce((select sum(cost) from dice_rolls where member_id = p_member), 0)
        - coalesce((select sum(soap) from soap_exchanges where member_id = p_member), 0))::int
$$;

create or replace function exchange_soap(p_member int, p_soap int) returns json
language plpgsql security definer set search_path = public as $$
declare v_coins int;
begin
  perform pg_advisory_xact_lock(hashtext('shop:' || p_member));
  v_coins := case p_soap when 1 then 100 when 10 then 1200 end;
  if v_coins is null then raise exception 'Échange invalide.'; end if;
  if soap_of(p_member) < p_soap then raise exception 'Il te faut % savons.', p_soap; end if;
  insert into soap_exchanges (member_id, soap, coins) values (p_member, p_soap, v_coins);
  insert into chip_ledger (member_id, amount, reason) values (p_member, v_coins, 'echange');
  return json_build_object('soap', p_soap, 'coins', v_coins);
end $$;
grant execute on function exchange_soap(int, int) to anon, authenticated;

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
  ('sauteur_pro', 0, 'pterodactyl', 1200),
  ('maitre_poussin', 0, 'poussin', 800),
  ('legende_airs', 0, 'papangue', 2000),
  ('premiere_recolte', 0, null, 100),
  ('jardinier', 0, null, 400),
  ('maraicher', 0, 'fermier', 1000),
  ('bon_voisin', 0, null, 300),
  ('ferme_1000', 0, null, 600),
  ('grand_domaine', 0, null, 500),
  ('roc', 0, null, 100),
  ('tailladeur', 0, null, 200),
  ('mentaliste', 0, 'sorcier', 600),
  ('clochard', 0, 'clochard', 100),
  ('maitre_rh', 0, null, 1000),
  ('pilier', 0, null, 800),
  ('dollars_500', 0, null, 300),
  ('dollars_1000', 0, 'roi', 800),
  ('dollars_10000', 0, 'zeus', 3000),
  ('noob', 0, 'zippo', 0),
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

-- ---------- REMISE À ZÉRO TOTALE v15 (une seule fois) : niveaux, XP, pièces, records, achats, tout ----------
do $$ begin
  if not exists (select 1 from app_meta where key = 'reset_v15') then
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
    delete from perk_confirms;
    delete from soap_exchanges;
    delete from messages;
    delete from member_stats;
    insert into member_stats (member_id) select id from members;
    update members set outfit = 'none', title = null, badge = null, frame = null, namefx = null, bird = null;
    insert into app_meta (key, value) values ('reset_v15', 'done');
  end if;
end $$;

-- ---------- Tout le monde revoit l'introduction (une seule fois) ----------
do $$ begin
  if not exists (select 1 from app_meta where key = 'intro_again_v11') then
    update member_stats set quest_mask = 0;
    insert into app_meta (key, value) values ('intro_again_v11', 'done');
  end if;
end $$;

-- ---------- Plateau : le joueur qui a fait le plus de tours la semaine passée gagne 500 colocoins ----------
create table if not exists plateau_weeks (
  week    date primary key,
  winners int[] not null default '{}',
  laps    int  not null default 0
);
alter table plateau_weeks enable row level security;
drop policy if exists "plateau_weeks lecture" on plateau_weeks; create policy "plateau_weeks lecture" on plateau_weeks for select using (true);
grant select on plateau_weeks to anon, authenticated;

create or replace function settle_plateau() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prev date := (date_trunc('week', now() at time zone 'Indian/Reunion')::date) - 7;
  v_max int; v_win int[];
begin
  perform pg_advisory_xact_lock(hashtext('plateau_weeks'));
  if exists (select 1 from plateau_weeks where week = v_prev) then return; end if;
  select coalesce(max(l), 0) into v_max from (select max(to_pos / 30) as l from dice_rolls where week = v_prev group by member_id) t;
  if v_max >= 1 then
    select array_agg(member_id) into v_win from (select member_id from dice_rolls where week = v_prev group by member_id having max(to_pos / 30) = v_max) t;
    insert into chip_ledger (member_id, amount, reason) select unnest(v_win), 500, 'plateau-week:' || v_prev;
  end if;
  insert into plateau_weeks (week, winners, laps) values (v_prev, coalesce(v_win, '{}'), v_max);
end $$;
grant execute on function settle_plateau() to anon, authenticated;

-- ---------- Colo-Ferme ----------
create table if not exists farm_crops (key text primary key, hours int not null, cost int not null, gain int not null);
alter table farm_crops add column if not exists level int not null default 1;
insert into farm_crops (key, hours, cost, gain, level) values
  ('curcuma', 1, 5, 9, 1),
  ('tomate', 2, 9, 18, 3),
  ('letchi', 4, 14, 28, 6),
  ('passion', 6, 20, 40, 9),
  ('papaye', 8, 27, 55, 12),
  ('ananas', 12, 35, 70, 15),
  ('avocat', 16, 42, 85, 18),
  ('vanille', 24, 50, 100, 21)
on conflict (key) do update set hours = excluded.hours, cost = excluded.cost, gain = excluded.gain, level = excluded.level;
alter table member_stats add column if not exists farm_harvests int not null default 0;
alter table member_stats add column if not exists farm_coins    int not null default 0;
alter table member_stats add column if not exists farm_waters   int not null default 0;
alter table member_stats add column if not exists farm_slots    int not null default 1;
update members set outfit = 'none' where outfit = 'hugodeck';
create table if not exists farm_plots (
  member_id  int  not null references members(id) on delete cascade,
  slot       int  not null,
  crop       text not null references farm_crops(key),
  planted_at timestamptz not null default now(),
  ready_at   timestamptz not null,
  watered_by int[] not null default '{}',
  primary key (member_id, slot)
);
create table if not exists farm_state (member_id int primary key references members(id) on delete cascade, slots int not null default 1);
create or replace view farm_day as
  select member_id, sum(amount)::int as got from chip_ledger
  where reason = 'ferme:recolte' and (created_at at time zone 'Indian/Reunion')::date = (now() at time zone 'Indian/Reunion')::date
  group by member_id;
alter table farm_crops enable row level security; alter table farm_plots enable row level security; alter table farm_state enable row level security;
drop policy if exists "farm_crops lecture" on farm_crops; create policy "farm_crops lecture" on farm_crops for select using (true);
drop policy if exists "farm_plots lecture" on farm_plots; create policy "farm_plots lecture" on farm_plots for select using (true);
drop policy if exists "farm_state lecture" on farm_state; create policy "farm_state lecture" on farm_state for select using (true);
grant select on farm_crops, farm_plots, farm_state, farm_day to anon, authenticated;
do $$ begin
  begin alter publication supabase_realtime add table farm_plots; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table farm_state; exception when duplicate_object then null; end;
end $$;

create or replace function farm_slots_of(p_member int) returns int
language sql stable as $$ select coalesce((select slots from farm_state where member_id = p_member), 1) $$;

create or replace function farm_plant(p_member int, p_slot int, p_crop text) returns void
language plpgsql security definer set search_path = public as $$
declare c farm_crops; o farm_plots;
begin
  if not exists (select 1 from members where id = p_member and kind = 'coloc') then raise exception 'Seuls les colocataires ont une ferme.'; end if;
  select * into c from farm_crops where key = p_crop;
  if not found then raise exception 'Culture inconnue.'; end if;
  if p_slot < 0 or p_slot >= farm_slots_of(p_member) then raise exception 'Parcelle verrouillée.'; end if;
  if level_of(coalesce((select xp from member_xp where member_id = p_member), 0)) < c.level then raise exception 'Cette culture se débloque au niveau %.', c.level; end if;
  perform pg_advisory_xact_lock(hashtext('farm:' || p_member));
  select * into o from farm_plots where member_id = p_member and slot = p_slot;
  if found then
    if o.ready_at + make_interval(hours => 24) < now() then delete from farm_plots where member_id = p_member and slot = p_slot;
    else raise exception 'Cette parcelle est occupée.'; end if;
  end if;
  if chips_of(p_member) < c.cost then raise exception 'Il te faut % colocoins pour ces graines.', c.cost; end if;
  insert into chip_ledger (member_id, amount, reason) values (p_member, -c.cost, 'ferme:semis');
  insert into farm_plots (member_id, slot, crop, ready_at) values (p_member, p_slot, p_crop, now() + make_interval(hours => c.hours));
end $$;

create or replace function farm_harvest(p_member int, p_slot int) returns json
language plpgsql security definer set search_path = public as $$
declare p farm_plots; c farm_crops; v_got int; v_pay int;
begin
  perform pg_advisory_xact_lock(hashtext('farm:' || p_member));
  select * into p from farm_plots where member_id = p_member and slot = p_slot for update;
  if not found then raise exception 'Rien à récolter ici.'; end if;
  if p.ready_at > now() then raise exception 'Ce n''est pas encore mûr.'; end if;
  delete from farm_plots where member_id = p_member and slot = p_slot;
  if p.ready_at + make_interval(hours => 24) < now() then
    return json_build_object('coins', 0, 'lost', 0, 'withered', true);
  end if;
  select * into c from farm_crops where key = p.crop;
  select coalesce(got, 0) into v_got from farm_day where member_id = p_member;
  v_got := coalesce(v_got, 0);
  v_pay := least(c.gain, greatest(100 - v_got, 0));
  if v_pay > 0 then insert into chip_ledger (member_id, amount, reason) values (p_member, v_pay, 'ferme:recolte'); end if;
  insert into member_stats (member_id, farm_harvests, farm_coins) values (p_member, 1, v_pay)
    on conflict (member_id) do update set farm_harvests = member_stats.farm_harvests + 1, farm_coins = member_stats.farm_coins + v_pay;
  return json_build_object('coins', v_pay, 'lost', c.gain - v_pay, 'withered', false);
end $$;

create or replace function farm_water(p_waterer int, p_owner int, p_slot int) returns json
language plpgsql security definer set search_path = public as $$
declare p farm_plots; v_n int; v_reward int := 0;
begin
  if not exists (select 1 from members where id = p_waterer and kind = 'coloc') then raise exception 'Seuls les colocataires arrosent.'; end if;
  if p_waterer = p_owner then raise exception 'Tu ne peux arroser que les parcelles des autres.'; end if;
  select * into p from farm_plots where member_id = p_owner and slot = p_slot for update;
  if not found then raise exception 'Rien à arroser ici.'; end if;
  if p.ready_at <= now() then raise exception 'C''est déjà mûr.'; end if;
  if p_waterer = any (p.watered_by) then raise exception 'Tu as déjà arrosé cette parcelle.'; end if;
  update farm_plots set ready_at = now() + (ready_at - now()) * (1 - 0.2), watered_by = watered_by || p_waterer where member_id = p_owner and slot = p_slot;
  insert into member_stats (member_id, farm_waters) values (p_waterer, 1)
    on conflict (member_id) do update set farm_waters = member_stats.farm_waters + 1;
  select count(*) into v_n from chip_ledger where member_id = p_waterer and reason = 'ferme:arrose'
    and (created_at at time zone 'Indian/Reunion')::date = (now() at time zone 'Indian/Reunion')::date;
  if v_n < 4 then
    insert into chip_ledger (member_id, amount, reason) values (p_waterer, 5, 'ferme:arrose'); v_reward := 5;
  end if;
  return json_build_object('reward', v_reward);
end $$;

create or replace function farm_unlock(p_member int) returns void
language plpgsql security definer set search_path = public as $$
declare v_slots int; v_cost int;
begin
  if not exists (select 1 from members where id = p_member and kind = 'coloc') then raise exception 'Seuls les colocataires ont une ferme.'; end if;
  perform pg_advisory_xact_lock(hashtext('farm:' || p_member));
  v_slots := farm_slots_of(p_member);
  if v_slots >= 6 then raise exception 'Toutes les parcelles sont débloquées.'; end if;
  v_cost := (array[0, 100, 200, 400, 700, 1000])[v_slots + 1];
  if chips_of(p_member) < v_cost then raise exception 'Il te faut % colocoins pour cette parcelle.', v_cost; end if;
  if v_cost > 0 then insert into chip_ledger (member_id, amount, reason) values (p_member, -v_cost, 'ferme:parcelle'); end if;
  insert into farm_state (member_id, slots) values (p_member, v_slots + 1) on conflict (member_id) do update set slots = excluded.slots;
  insert into member_stats (member_id, farm_slots) values (p_member, v_slots + 1)
    on conflict (member_id) do update set farm_slots = excluded.farm_slots;
end $$;
grant execute on function farm_plant(int, int, text)  to anon, authenticated;
grant execute on function farm_harvest(int, int)      to anon, authenticated;
grant execute on function farm_water(int, int, int)   to anon, authenticated;
grant execute on function farm_unlock(int)            to anon, authenticated;

-- Une tâche ménagère validée accélère les cultures de celui qui l'a faite
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
    update farm_plots set ready_at = now() + (ready_at - now()) * (1 - 0.5) where member_id = l.doer_id and ready_at > now();
  else
    update task_logs set status = 'rejected', validator_id = p_member, answered_at = now() where id = p_log returning * into l;
  end if;
  return l;
end $$;
grant execute on function answer_task(bigint, int, boolean) to anon, authenticated;

-- ---------- Nouvelles tâches ménagères (par catégorie) ----------
insert into task_kinds (kind, soap, cooldown_h) values
  ('net_cuisine', 2, 24),
  ('net_salon', 2, 48),
  ('net_sdb', 2, 72),
  ('net_wc', 2, 72),
  ('net_maison', 10, 168),
  ('asp_cuisine', 2, 24),
  ('asp_salon', 2, 24),
  ('asp_sdb', 2, 48),
  ('asp_wc', 2, 48),
  ('asp_maison', 10, 72),
  ('ser_cuisine', 2, 48),
  ('ser_salon', 2, 48),
  ('ser_sdb', 2, 72),
  ('ser_wc', 2, 72),
  ('ser_maison', 10, 168),
  ('poub_verte', 1, 12),
  ('poub_jaune', 1, 12),
  ('poub_portail', 1, 12),
  ('poub_remplace', 1, 12),
  ('cuis_patisserie', 4, 24),
  ('cuis_repas', 8, 24)
on conflict (kind) do update set soap = excluded.soap, cooldown_h = excluded.cooldown_h;
