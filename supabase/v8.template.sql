-- ============================================================
--  Version 8 : introduction (5 onglets), plateau (jeu de l'oie), messages courts,
--              chifoumi +5/−4 trophées, blackjack avec mises, niveaux plus durs
--  Ne remet RIEN à zéro. Sans risque si relancé.
-- ============================================================

-- ---------- Niveaux : courbe __LEVEL_K__ × L × (L − 1) ----------
create or replace function level_of(p_xp int) returns int
language sql immutable as $$
  select floor((1 + sqrt(1 + greatest(p_xp - __LEVEL_BASE__, 0)::numeric * 4 / __LEVEL_K__)) / 2)::int
$$;

-- ---------- EXP + palier : tous les __LB_EVERY__ niveaux, __LB_CHIPS__ colocoins (une seule fois par palier) ----------
create or replace function add_xp(p_member int, p_amount int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_lvl int; n int;
begin
  if p_amount is null or p_amount = 0 then return; end if;
  insert into xp_log (member_id, amount, reason) values (p_member, p_amount, p_reason);
  select level_of(coalesce(sum(amount), 0)::int) into v_lvl from xp_log where member_id = p_member;
  n := __LB_EVERY__;
  while n <= v_lvl loop
    if not exists (select 1 from chip_ledger where member_id = p_member and reason = 'level:' || n) then
      insert into chip_ledger (member_id, amount, reason) values (p_member, __LB_CHIPS__, 'level:' || n);
    end if;
    n := n + __LB_EVERY__;
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
    perform add_xp(p_member, __INTRO_XP__, 'intro');                  -- fin de l'introduction : 1re étape vers le niveau 2
  end if;
  return v;
end $$;

-- Premier lancement d'un jeu (une seule fois) : dernière étape vers le niveau 2
create or replace function launch_game(p_member int) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from xp_log where member_id = p_member and reason = 'first_game') then
    perform add_xp(p_member, __FIRST_GAME_XP__, 'first_game');
    return __FIRST_GAME_XP__;
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

-- ---------- Plus aucune apparence ne se débloque au niveau : tout s'achète à la boutique ----------
delete from skin_levels;

-- ---------- Boutique : cadres, effets de pseudo, looks de l'oiseau (payés en colocoins) ----------
create table if not exists shop_items (item text primary key, slot text not null, price int not null check (price >= 0));
delete from shop_items;
insert into shop_items (item, slot, price) values
  __SHOP_VALUES__;
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

-- Récompense du jour : __DAILY_CHIPS__ colocoins + __DAILY_XP__ XP (plus de série ni de roue)
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
  perform add_xp(p_member, __DAILY_XP__, 'daily');
  insert into chip_ledger (member_id, amount, reason) values (p_member, __DAILY_CHIPS__, 'daily');
  return json_build_object('streak', v_streak, 'xp', __DAILY_XP__, 'chips', __DAILY_CHIPS__, 'wheel', false);
end $$;
grant execute on function claim_daily(int, date) to anon, authenticated;

-- ---------- Chifoumi : un seul défi en attente à la fois avec un même joueur (dans un sens ou dans l'autre) ----------
create or replace function create_duel(p_challenger int, p_opponent int, p_wager int, p_move text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_move not in ('pierre', 'feuille', 'ciseaux') then raise exception 'Coup invalide.'; end if;
  if coalesce(p_wager, 0) <> __DUEL_STAKE__ then raise exception 'La mise du chifoumi est de __DUEL_STAKE__ colocoins.'; end if;
  if chips_of(p_challenger) < __DUEL_STAKE__ then raise exception 'Il te faut au moins __DUEL_STAKE__ colocoins pour défier.'; end if;
  if p_challenger = p_opponent then raise exception 'Tu ne peux pas te défier toi-même.'; end if;
  perform pg_advisory_xact_lock(hashtext('duel:' || least(p_challenger, p_opponent) || '-' || greatest(p_challenger, p_opponent)));
  if exists (select 1 from duels where status = 'pending'
             and ((challenger_id = p_challenger and opponent_id = p_opponent) or (challenger_id = p_opponent and opponent_id = p_challenger))) then
    raise exception 'Un défi est déjà en attente avec ce joueur.';
  end if;
  insert into duels (challenger_id, opponent_id, wager) values (p_challenger, p_opponent, __DUEL_STAKE__) returning id into v_id;
  insert into duel_secrets (duel_id, move) values (v_id, p_move);
  return v_id;
end $$;
grant execute on function create_duel(int, int, int, text) to anon, authenticated;

-- ---------- Savons dépensés (dés du plateau) ----------
create table if not exists goose_cells (cell int primary key, kind text not null, v int not null default 0);
delete from goose_cells;
insert into goose_cells (cell, kind, v) values
__GOOSE_CELLS__;

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
  v_coins := case p_soap __EXCHANGE_CASE__ end;
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
  if v_p.kind not in (__PERK_CONFIRM__) then raise exception 'Rien à confirmer ici.'; end if;
  if p_member = v_p.member_id or not exists (select 1 from members where id = p_member and kind = 'coloc') then raise exception 'Seuls les autres colocs confirment.'; end if;
  insert into perk_confirms (perk_id, member_id) values (p_perk, p_member) on conflict do nothing;
end $$;
grant execute on function confirm_perk(bigint, int) to anon, authenticated;

-- Lancer un dé : le 1er du jour est gratuit, puis 1, 3, 5, 10, 20 savons (repart à minuit, heure de La Réunion). Tours infinis.
-- Savons gagnés (tâches validées) depuis lundi
create or replace function week_soap_of(p_member int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(soap), 0)::int from task_logs
  where doer_id = p_member and status = 'validated'
    and (answered_at at time zone 'Indian/Reunion')::date >= date_trunc('week', now() at time zone 'Indian/Reunion')::date
$$;
create or replace function roll_dice(p_member int) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Indian/Reunion')::date;
  v_week  date := date_trunc('week', now() at time zone 'Indian/Reunion')::date;
  v_n int; v_cost int; v_pos int; v_roll int; v_to int; v_note text := ''; v_laps int; v_cellno int;
  v_perk text; v_ch int := 0; v_cell goose_cells; v_depth int := 0; v_xp int := 0; v_tr int := 0; v_size int := __GOOSE_SIZE__;
begin
  if not exists (select 1 from members where id = p_member and kind = 'coloc') then raise exception 'Seuls les colocataires jouent au plateau.'; end if;
  perform pg_advisory_xact_lock(hashtext('dice:' || p_member));
  select count(*) into v_n from dice_rolls where member_id = p_member and (created_at at time zone 'Indian/Reunion')::date = v_today;
  v_cost := (array[__DICE_PRICES__])[least(v_n + 1, __DICE_N__)];
  if v_n >= __DICE_MAX__ then raise exception 'Tu as lancé tous tes dés du jour (maximum __DICE_MAX__).'; end if;
  if week_soap_of(p_member) < v_cost then raise exception 'Il te faut % savon% gagnés cette semaine pour ce dé.', v_cost, case when v_cost > 1 then 's' else '' end; end if;
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
    v_xp := v_xp + __GOOSE_FIN_XP__; v_tr := v_tr + __GOOSE_FIN_TR__; v_note := v_note || ' TOUR TERMINÉ ! +' || __GOOSE_FIN_XP__ || ' XP';
    if v_laps = 0 then
      v_perk := (array[__PERK_KINDS__])[1 + ((v_week - date '2024-01-01') / 7) % __PERK_N__];
      insert into perks (member_id, week, kind) values (p_member, v_week, v_perk) on conflict do nothing;
    end if;
  end if;
  insert into dice_rolls (member_id, week, cost, roll, from_pos, to_pos, note) values (p_member, v_week, 0, v_roll, v_pos, v_to, nullif(trim(v_note), ''));   -- les dés ne consomment plus de savons
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
  body       text not null check (char_length(body) between 1 and __MESSAGE_MAX__),
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
  if char_length(v_body) > __MESSAGE_MAX__ then raise exception 'Message trop long (__MESSAGE_MAX__ caractères maximum).'; end if;
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
  perform add_xp(d.challenger_id, __XP_DUEL_PLAY__, 'duel');
  perform add_xp(d.opponent_id, __XP_DUEL_PLAY__, 'duel');
  if w is not null then
    l := case when w = d.challenger_id then d.opponent_id else d.challenger_id end;
    perform add_xp(w, __XP_DUEL_WIN__, 'duel-win');
    select coalesce(sum(amount), 0) into v_today from coin_ledger
      where member_id = w and reason = 'duel-win'
        and (created_at at time zone 'Indian/Reunion')::date = (now() at time zone 'Indian/Reunion')::date;
    v_gain := greatest(0, least(__DUEL_T__, __DUEL_T_CAP__ - v_today));
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
  if p_bet not in (__BJ_BETS__) then raise exception 'Mise invalide.'; end if;
  if p_hands not between 1 and 2 or p_wins not between 0 and p_hands then raise exception 'Résultat invalide.'; end if;
  if abs(p_net) > 4 * p_bet then raise exception 'Résultat invalide.'; end if;
  insert into member_stats (member_id) values (p_member) on conflict do nothing;
  v_bal := chips_of(p_member);
  v_net := case when p_net < 0 then -least(-p_net, greatest(v_bal, 0)) else p_net end;   -- on ne descend jamais sous 0
  if v_net <> 0 then insert into chip_ledger (member_id, amount, reason) values (p_member, v_net, 'blackjack'); end if;
  v_xp := p_hands * __XP_BJ_PLAY__ + p_wins * __XP_BJ_WIN__ + case when p_blackjack then __XP_BJ_BLACKJACK__ else 0 end;
  perform add_xp(p_member, v_xp, 'game:blackjack');
  update member_stats set blackjack_played = blackjack_played + p_hands, blackjack_wins = blackjack_wins + p_wins where member_id = p_member;
  select * into s from member_stats where member_id = p_member;
  return s;
end $$;
grant execute on function report_blackjack(int, int, int, int, int, boolean) to anon, authenticated;

-- ---------- Défis (textes et XP) ----------
delete from challenges;
insert into challenges (key, coins, skin, xp) values
__CHALLENGES__;

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

-- ---------- Plateau : le joueur qui a fait le plus de tours la semaine passée gagne __WEEK_WIN__ colocoins ----------
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
  select coalesce(max(l), 0) into v_max from (select max(to_pos / __GOOSE_SIZE__) as l from dice_rolls where week = v_prev group by member_id) t;
  if v_max >= 1 then
    select array_agg(member_id) into v_win from (select member_id from dice_rolls where week = v_prev group by member_id having max(to_pos / __GOOSE_SIZE__) = v_max) t;
    insert into chip_ledger (member_id, amount, reason) select unnest(v_win), __WEEK_WIN__, 'plateau-week:' || v_prev;
  end if;
  insert into plateau_weeks (week, winners, laps) values (v_prev, coalesce(v_win, '{}'), v_max);
end $$;
grant execute on function settle_plateau() to anon, authenticated;

-- ---------- Colo-Ferme ----------
create table if not exists farm_crops (key text primary key, hours int not null, cost int not null, gain int not null);
alter table farm_crops add column if not exists level int not null default 1;
alter table farm_crops add column if not exists sell int not null default 1;
insert into farm_crops (key, hours, cost, gain, level, sell) values
__FARM_CROPS__
on conflict (key) do update set hours = excluded.hours, cost = excluded.cost, gain = excluded.gain, level = excluded.level, sell = excluded.sell;
alter table member_stats add column if not exists farm_harvests int not null default 0;
alter table member_stats add column if not exists farm_coins    int not null default 0;
alter table member_stats add column if not exists farm_waters   int not null default 0;
alter table member_stats add column if not exists farm_builds   int not null default 0;
alter table member_stats add column if not exists farm_slots    int not null default __FARM_BASE__;
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
create table if not exists farm_state (member_id int primary key references members(id) on delete cascade, slots int not null default __FARM_BASE__);
create or replace view farm_day as
  select member_id, sum(amount)::int as got from chip_ledger
  where reason = 'ferme:vente' and (created_at at time zone 'Indian/Reunion')::date = (now() at time zone 'Indian/Reunion')::date
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

create table if not exists farm_stock (member_id int not null references members(id) on delete cascade, crop text not null references farm_crops(key), qty int not null default 0 check (qty >= 0), primary key (member_id, crop));
-- v24 : les décorations n'existent plus
do $$ begin
  if to_regclass('farm_items') is not null then
    delete from farm_builds where item in (select key from farm_items where kind = 'd');
    delete from farm_items where kind = 'd';
  end if;
end $$;
create table if not exists farm_items (key text primary key, kind text not null, cost jsonb not null);
insert into farm_items (key, kind, cost) values
__FARM_ITEMS__
on conflict (key) do update set kind = excluded.kind, cost = excluded.cost;
create table if not exists farm_builds (member_id int not null references members(id) on delete cascade, spot text not null, item text not null references farm_items(key), built_at timestamptz not null default now(), primary key (member_id, spot));
alter table farm_stock enable row level security; alter table farm_items enable row level security; alter table farm_builds enable row level security;
drop policy if exists "farm_stock lecture" on farm_stock; create policy "farm_stock lecture" on farm_stock for select using (true);
drop policy if exists "farm_items lecture" on farm_items; create policy "farm_items lecture" on farm_items for select using (true);
drop policy if exists "farm_builds lecture" on farm_builds; create policy "farm_builds lecture" on farm_builds for select using (true);
grant select on farm_stock, farm_items, farm_builds to anon, authenticated;
do $$ begin
  begin alter publication supabase_realtime add table farm_stock; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table farm_builds; exception when duplicate_object then null; end;
end $$;

create or replace function farm_slots_of(p_member int) returns int
language sql stable as $$ select coalesce((select slots from farm_state where member_id = p_member), __FARM_BASE__) $$;

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
    if o.ready_at + make_interval(hours => __FARM_WITHER__) < now() then delete from farm_plots where member_id = p_member and slot = p_slot;
    else raise exception 'Cette parcelle est occupée.'; end if;
  end if;
  insert into farm_plots (member_id, slot, crop, ready_at) values (p_member, p_slot, p_crop,
    now() + make_interval(secs => (c.hours * 3600 * (case when exists (select 1 from farm_builds where member_id = p_member and item = 'puits') then 1 - __FARM_WELL__ else 1 end))::int));
end $$;

create or replace function farm_harvest(p_member int, p_slot int) returns json
language plpgsql security definer set search_path = public as $$
declare p farm_plots; v_qty int;
begin
  perform pg_advisory_xact_lock(hashtext('farm:' || p_member));
  select * into p from farm_plots where member_id = p_member and slot = p_slot for update;
  if not found then raise exception 'Rien à récolter ici.'; end if;
  if p.ready_at > now() then raise exception 'Ce n''est pas encore mûr.'; end if;
  delete from farm_plots where member_id = p_member and slot = p_slot;
  if p.ready_at + make_interval(hours => __FARM_WITHER__) < now() then
    return json_build_object('crop', p.crop, 'qty', 0, 'withered', true);
  end if;
  v_qty := __FARM_YIELD__ + (case when exists (select 1 from farm_builds where member_id = p_member and item = 'serre') then __FARM_GH__ else 0 end);
  insert into farm_stock (member_id, crop, qty) values (p_member, p.crop, v_qty)
    on conflict (member_id, crop) do update set qty = farm_stock.qty + v_qty;
  insert into member_stats (member_id, farm_harvests) values (p_member, 1)
    on conflict (member_id) do update set farm_harvests = member_stats.farm_harvests + 1;
  return json_build_object('crop', p.crop, 'qty', v_qty, 'withered', false);
end $$;

-- Vente à la grange : unités → colocoins (plafond quotidien, +silo ; prix +étal)
create or replace function farm_sell(p_member int, p_crop text, p_qty int) returns json
language plpgsql security definer set search_path = public as $$
declare c farm_crops; v_have int; v_unit int; v_cap int; v_got int; v_n int;
begin
  perform pg_advisory_xact_lock(hashtext('farm:' || p_member));
  select * into c from farm_crops where key = p_crop;
  if not found then raise exception 'Culture inconnue.'; end if;
  select coalesce(qty, 0) into v_have from farm_stock where member_id = p_member and crop = p_crop;
  v_have := coalesce(v_have, 0);
  if v_have <= 0 or p_qty <= 0 then raise exception 'Tu n''as rien à vendre.'; end if;
  v_unit := round(c.sell * (case when exists (select 1 from farm_builds where member_id = p_member and item = 'etal') then 1 + __FARM_STALL__ else 1 end))::int;
  v_cap := __FARM_CAP__ + (case when exists (select 1 from farm_builds where member_id = p_member and item = 'silo') then __FARM_SILO__ else 0 end);
  select coalesce(got, 0) into v_got from farm_day where member_id = p_member; v_got := coalesce(v_got, 0);
  v_n := least(p_qty, v_have, floor(greatest(v_cap - v_got, 0)::numeric / v_unit)::int);
  if v_n <= 0 then raise exception 'Plafond de vente du jour atteint (% 🪙). Reviens demain !', v_cap; end if;
  update farm_stock set qty = qty - v_n where member_id = p_member and crop = p_crop;
  insert into chip_ledger (member_id, amount, reason) values (p_member, v_n * v_unit, 'ferme:vente');
  insert into member_stats (member_id, farm_coins) values (p_member, v_n * v_unit)
    on conflict (member_id) do update set farm_coins = member_stats.farm_coins + v_n * v_unit;
  return json_build_object('sold', v_n, 'coins', v_n * v_unit, 'cap', v_cap);
end $$;

-- Construction : bâtiments (emplacements b0…) et décorations (d0…) payés en fruits et légumes
create or replace function farm_build(p_member int, p_spot text, p_item text) returns void
language plpgsql security definer set search_path = public as $$
declare it farm_items; k text; v int; v_idx int;
begin
  if not exists (select 1 from members where id = p_member and kind = 'coloc') then raise exception 'Seuls les colocataires ont une ferme.'; end if;
  select * into it from farm_items where key = p_item;
  if not found then raise exception 'Construction inconnue.'; end if;
  if left(p_spot, 1) <> it.kind or p_spot !~ '^[bd][0-9]+$' then raise exception 'Mauvais emplacement.'; end if;
  v_idx := substr(p_spot, 2)::int;
  if v_idx >= (case when it.kind = 'b' then __FARM_SB__ else __FARM_SD__ end) then raise exception 'Emplacement inconnu.'; end if;
  perform pg_advisory_xact_lock(hashtext('farm:' || p_member));
  if exists (select 1 from farm_builds where member_id = p_member and (spot = p_spot or item = p_item)) then raise exception 'Déjà construit.'; end if;
  for k, v in select key, value::int from jsonb_each_text(it.cost) loop
    if coalesce((select qty from farm_stock where member_id = p_member and crop = k), 0) < v then raise exception 'Il te manque des fruits et légumes (%).', k; end if;
  end loop;
  for k, v in select key, value::int from jsonb_each_text(it.cost) loop
    update farm_stock set qty = qty - v where member_id = p_member and crop = k;
  end loop;
  insert into farm_builds (member_id, spot, item) values (p_member, p_spot, p_item);
  insert into member_stats (member_id, farm_builds) values (p_member, 1)
    on conflict (member_id) do update set farm_builds = member_stats.farm_builds + 1;
end $$;
grant execute on function farm_sell(int, text, int)  to anon, authenticated;
grant execute on function farm_build(int, text, text) to anon, authenticated;

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
  update farm_plots set ready_at = now() + (ready_at - now()) * (1 - __FARM_CUT__), watered_by = watered_by || p_waterer where member_id = p_owner and slot = p_slot;
  insert into member_stats (member_id, farm_waters) values (p_waterer, 1)
    on conflict (member_id) do update set farm_waters = member_stats.farm_waters + 1;
  select count(*) into v_n from chip_ledger where member_id = p_waterer and reason = 'ferme:arrose'
    and (created_at at time zone 'Indian/Reunion')::date = (now() at time zone 'Indian/Reunion')::date;
  if v_n < __FARM_WRMAX__ then
    insert into chip_ledger (member_id, amount, reason) values (p_waterer, __FARM_WR__, 'ferme:arrose'); v_reward := __FARM_WR__;
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
  if v_slots >= __FARM_MAX__ then raise exception 'Toutes les parcelles sont débloquées.'; end if;
  v_cost := (array[__FARM_SLOT_COSTS__])[v_slots + 1];
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
    update farm_plots set ready_at = now() + (ready_at - now()) * (1 - __FARM_BOOST__) where member_id = l.doer_id and ready_at > now();
  else
    update task_logs set status = 'rejected', validator_id = p_member, answered_at = now() where id = p_log returning * into l;
  end if;
  return l;
end $$;
grant execute on function answer_task(bigint, int, boolean) to anon, authenticated;

-- ---------- Nouvelles tâches ménagères (par catégorie) ----------
insert into task_kinds (kind, soap, cooldown_h) values
__TASK_KINDS__
on conflict (kind) do update set soap = excluded.soap, cooldown_h = excluded.cooldown_h;

-- ---------- RÉINITIALISATION GÉNÉRALE (une seule fois) : niveaux, pièces, savons, tâches, cultures, achats… ----------
do $$ begin
  if not exists (select 1 from app_meta where key = 'reset_v20') then
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
    delete from farm_plots;
    delete from farm_state;
    delete from farm_stock;
    delete from farm_builds;
    delete from plateau_weeks;
    delete from member_stats;
    insert into member_stats (member_id) select id from members;
    update members set outfit = 'none', title = null, badge = null, frame = null, namefx = null, bird = null;
    insert into app_meta (key, value) values ('reset_v20', 'done');
  end if;
end $$;

-- ===== v24 : suggestions (envoyées vers SUGGESTIONS.md sur GitHub par la fonction "suggest") =====
create table if not exists suggestions (
  id         bigserial primary key,
  member_id  int not null references members(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  synced_at  timestamptz
);
create or replace function send_suggestion(p_member int, p_body text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_body text := trim(p_body);
begin
  if v_body is null or char_length(v_body) < 3 then raise exception 'Écris ta suggestion.'; end if;
  if char_length(v_body) > 1000 then raise exception 'Suggestion trop longue (1000 caractères maximum).'; end if;
  if not exists (select 1 from members where id = p_member) then raise exception 'Membre inconnu.'; end if;
  if (select count(*) from suggestions where member_id = p_member and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Déjà 10 suggestions aujourd''hui, reviens demain !';
  end if;
  insert into suggestions (member_id, body) values (p_member, v_body) returning id into v_id;
  return v_id;
end $$;
grant execute on function send_suggestion(int, text) to anon, authenticated;
alter table suggestions enable row level security; -- aucune policy : lecture réservée à la fonction (service role)


-- ===== v24 : calendrier d'activités + sondage de présence =====
create table if not exists events (
  id         bigserial primary key,
  creator_id int not null references members(id) on delete cascade,
  title      text not null,
  place      text,
  starts_at  timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists event_votes (
  event_id   bigint not null references events(id) on delete cascade,
  member_id  int not null references members(id) on delete cascade,
  vote       text not null check (vote in ('yes', 'no', 'maybe')),
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id)
);
create index if not exists events_start on events (starts_at);
create or replace function create_event(p_member int, p_title text, p_place text, p_starts timestamptz) returns bigint
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
  insert into events (creator_id, title, place, starts_at) values (p_member, v_title, v_place, p_starts) returning id into v_id;
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
grant execute on function create_event(int, text, text, timestamptz) to anon, authenticated;
grant execute on function vote_event(int, bigint, text)              to anon, authenticated;
grant execute on function delete_event(int, bigint)                  to anon, authenticated;
alter table events enable row level security; alter table event_votes enable row level security;
drop policy if exists "events lecture" on events; create policy "events lecture" on events for select using (true);
drop policy if exists "event_votes lecture" on event_votes; create policy "event_votes lecture" on event_votes for select using (true);
grant select on events, event_votes to anon, authenticated;
do $$ begin
  begin alter publication supabase_realtime add table events; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table event_votes; exception when duplicate_object then null; end;
end $$;


-- ===== v26 : caisses d'oiseaux (les oiseaux ne s'achètent plus à l'unité) =====
create table if not exists bird_odds (key text primary key, w numeric not null check (w > 0));
delete from bird_odds;
insert into bird_odds (key, w) values
__BIRD_ODDS__;
alter table bird_odds enable row level security;
drop policy if exists "bird_odds lecture" on bird_odds; create policy "bird_odds lecture" on bird_odds for select using (true);
create or replace function open_bird_crate(p_member int) returns text
language plpgsql security definer set search_path = public as $$
declare v_key text; v_tot numeric; v_r numeric;
begin
  if not exists (select 1 from members where id = p_member) then raise exception 'Membre inconnu.'; end if;
  perform pg_advisory_xact_lock(hashtext('shop:' || p_member));
  select coalesce(sum(w), 0) into v_tot from bird_odds o where not exists (select 1 from purchases where member_id = p_member and item = 'bird:' || o.key);
  if v_tot = 0 then raise exception 'Tu as déjà tous les oiseaux !'; end if;
  if chips_of(p_member) < __CRATE_PRICE__ then raise exception 'Il te faut __CRATE_PRICE__ colocoins pour une caisse.'; end if;
  v_r := random() * v_tot;
  select key into v_key from (
    select o.key, sum(o.w) over (order by o.key) as cum from bird_odds o
    where not exists (select 1 from purchases where member_id = p_member and item = 'bird:' || o.key)
  ) t where cum >= v_r order by cum limit 1;
  insert into chip_ledger (member_id, amount, reason) values (p_member, -__CRATE_PRICE__, 'caisse');
  insert into purchases (member_id, item, price) values (p_member, 'bird:' || v_key, 0);
  return v_key;
end $$;
grant execute on function open_bird_crate(int) to anon, authenticated;


-- ===== v33 : quêtes journalières par jeu (récompense en colocoins) =====
create table if not exists game_quest_defs (key text primary key, game text not null, target int not null, reward int not null, mode text not null check (mode in ('add', 'max')));
insert into game_quest_defs (key, game, target, reward, mode) values
__GAME_QUESTS__
on conflict (key) do update set game = excluded.game, target = excluded.target, reward = excluded.reward, mode = excluded.mode;
create table if not exists game_quests (
  member_id int not null references members(id) on delete cascade,
  day date not null,
  quest text not null references game_quest_defs(key),
  progress int not null default 0,
  done boolean not null default false,
  primary key (member_id, day, quest)
);
alter table game_quest_defs enable row level security;
alter table game_quests enable row level security;
drop policy if exists "game_quest_defs lecture" on game_quest_defs; create policy "game_quest_defs lecture" on game_quest_defs for select using (true);
drop policy if exists "game_quests lecture" on game_quests; create policy "game_quests lecture" on game_quests for select using (true);
create or replace function game_quest(p_member int, p_quest text, p_amount int) returns json
language plpgsql security definer set search_path = public as $$
declare d game_quest_defs; v_day date := (now() at time zone 'Indian/Reunion')::date; v_new int; v_old game_quests; v_just boolean := false;
begin
  if not exists (select 1 from members where id = p_member) then raise exception 'Membre inconnu.'; end if;
  select * into d from game_quest_defs where key = p_quest;
  if not found then raise exception 'Quête inconnue.'; end if;
  p_amount := least(greatest(coalesce(p_amount, 0), 0), d.target);          -- un appel ne peut jamais dépasser l'objectif
  perform pg_advisory_xact_lock(hashtext('gq:' || p_member));
  insert into game_quests (member_id, day, quest) values (p_member, v_day, p_quest) on conflict do nothing;
  select * into v_old from game_quests where member_id = p_member and day = v_day and quest = p_quest for update;
  if v_old.done then return json_build_object('progress', d.target, 'target', d.target, 'done', true, 'just', false, 'reward', d.reward); end if;
  v_new := least(d.target, case when d.mode = 'max' then greatest(v_old.progress, p_amount) else v_old.progress + p_amount end);
  if v_new >= d.target then
    v_just := true;
    insert into chip_ledger (member_id, amount, reason) values (p_member, d.reward, 'quete:' || p_quest);
  end if;
  update game_quests set progress = v_new, done = v_just where member_id = p_member and day = v_day and quest = p_quest;
  return json_build_object('progress', v_new, 'target', d.target, 'done', v_just, 'just', v_just, 'reward', d.reward);
end $$;
grant execute on function game_quest(int, text, int) to anon, authenticated;


-- ===== v34 : fenêtres surprise (affichées une fois à l'ouverture de l'appli) =====
create table if not exists popups (
  id          bigint generated always as identity primary key,
  key         text unique,
  to_id       int  not null references members(id) on delete cascade,
  title       text not null,
  body        text not null,
  theme       text not null default 'gamer',
  created_at  timestamptz not null default now(),
  seen_at     timestamptz,
  notified_at timestamptz
);
alter table popups enable row level security;
drop policy if exists "popups lecture" on popups; create policy "popups lecture" on popups for select using (true);
create or replace function popup_seen(p_member int, p_id bigint) returns void
language sql security definer set search_path = public as $$
  update popups set seen_at = now() where id = p_id and to_id = p_member and seen_at is null;
$$;
grant execute on function popup_seen(int, bigint) to anon, authenticated;
do $$ begin
  begin alter publication supabase_realtime add table popups; exception when duplicate_object then null; end;
end $$;
-- Zakaria s'appelle maintenant Zak ; la surprise d'anniversaire est supprimée
update members set name = 'Zak' where name = 'Zakaria';
delete from popups where key = 'zakaria-anniv-2026';


-- ===== v35 : Budget (comme Tricount) : dépenses partagées entre colocs, parts égales =====
create table if not exists expenses (
  id           bigserial primary key,
  creator_id   int  not null references members(id) on delete cascade,
  payer_id     int  not null references members(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 60),
  amount_cents int  not null check (amount_cents between 1 and 10000000),
  spent_on     date not null default current_date,
  kind         text not null default 'expense' check (kind in ('expense', 'transfer')),
  created_at   timestamptz not null default now()
);
create table if not exists expense_shares (
  expense_id bigint not null references expenses(id) on delete cascade,
  member_id  int    not null references members(id) on delete cascade,
  primary key (expense_id, member_id)
);
create index if not exists expenses_day on expenses (spent_on desc, id desc);
alter table expenses enable row level security; alter table expense_shares enable row level security;
drop policy if exists "expenses lecture" on expenses; create policy "expenses lecture" on expenses for select using (true);
drop policy if exists "expense_shares lecture" on expense_shares; create policy "expense_shares lecture" on expense_shares for select using (true);
grant select on expenses, expense_shares to anon, authenticated;
do $$ begin
  begin alter publication supabase_realtime add table expenses; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table expense_shares; exception when duplicate_object then null; end;
end $$;

-- Vérifie que tous les noms donnés sont des colocs
create or replace function _budget_check(p_member int, p_payer int, p_parts int[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from members where id = p_member and kind = 'coloc') then raise exception 'Le budget est réservé aux colocs.'; end if;
  if not exists (select 1 from members where id = p_payer and kind = 'coloc') then raise exception 'Payeur invalide.'; end if;
  if p_parts is null or coalesce(array_length(p_parts, 1), 0) = 0 then raise exception 'Choisis au moins une personne concernée.'; end if;
  if (select count(*) from members where id = any(p_parts) and kind = 'coloc') <> (select count(distinct x) from unnest(p_parts) x) then raise exception 'Participants invalides.'; end if;
end $$;

create or replace function add_expense(p_member int, p_title text, p_amount_cents int, p_payer int, p_day date, p_parts int[]) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_title text := trim(p_title);
begin
  perform _budget_check(p_member, p_payer, p_parts);
  if v_title is null or char_length(v_title) = 0 then raise exception 'Donne un nom à la dépense.'; end if;
  if char_length(v_title) > 60 then raise exception 'Nom trop long (60 caractères maximum).'; end if;
  if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 10000000 then raise exception 'Montant invalide.'; end if;
  insert into expenses (creator_id, payer_id, title, amount_cents, spent_on) values (p_member, p_payer, v_title, p_amount_cents, coalesce(p_day, current_date)) returning id into v_id;
  insert into expense_shares (expense_id, member_id) select v_id, x from (select distinct unnest(p_parts) x) t;
  return v_id;
end $$;

create or replace function update_expense(p_member int, p_id bigint, p_title text, p_amount_cents int, p_payer int, p_day date, p_parts int[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_title text := trim(p_title);
begin
  perform _budget_check(p_member, p_payer, p_parts);
  if not exists (select 1 from expenses where id = p_id and kind = 'expense') then raise exception 'Dépense introuvable.'; end if;
  if v_title is null or char_length(v_title) = 0 or char_length(v_title) > 60 then raise exception 'Nom invalide.'; end if;
  if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 10000000 then raise exception 'Montant invalide.'; end if;
  update expenses set title = v_title, amount_cents = p_amount_cents, payer_id = p_payer, spent_on = coalesce(p_day, spent_on) where id = p_id;
  delete from expense_shares where expense_id = p_id;
  insert into expense_shares (expense_id, member_id) select p_id, x from (select distinct unnest(p_parts) x) t;
end $$;

create or replace function delete_expense(p_member int, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from members where id = p_member and kind = 'coloc') then raise exception 'Le budget est réservé aux colocs.'; end if;
  delete from expenses where id = p_id;
end $$;

-- Remboursement : p_from a donné p_cents à p_to (enregistré comme une dépense « Remboursement » qui ne concerne que p_to)
create or replace function add_transfer(p_member int, p_from int, p_to int, p_cents int) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform _budget_check(p_member, p_from, array[p_to]);
  if p_from = p_to then raise exception 'Choisis deux personnes différentes.'; end if;
  if p_cents is null or p_cents < 1 or p_cents > 10000000 then raise exception 'Montant invalide.'; end if;
  insert into expenses (creator_id, payer_id, title, amount_cents, kind) values (p_member, p_from, 'Remboursement', p_cents, 'transfer') returning id into v_id;
  insert into expense_shares (expense_id, member_id) values (v_id, p_to);
  return v_id;
end $$;
grant execute on function add_expense(int, text, int, int, date, int[]) to anon, authenticated;
grant execute on function update_expense(int, bigint, text, int, int, date, int[]) to anon, authenticated;
grant execute on function delete_expense(int, bigint) to anon, authenticated;
grant execute on function add_transfer(int, int, int, int) to anon, authenticated;


-- ===== v36 : dépenses automatiques (chaque 1er du mois, pour tous les colocs) =====
create table if not exists recurring_expenses (
  id           bigserial primary key,
  key          text unique,
  title        text not null,
  amount_cents int  not null check (amount_cents between 1 and 10000000),
  payer_id     int  not null references members(id) on delete cascade,
  start_on     date not null,
  active       boolean not null default true
);
create table if not exists recurring_runs (
  rec_id bigint not null references recurring_expenses(id) on delete cascade,
  month  date   not null,
  primary key (rec_id, month)
);
alter table expenses add column if not exists recurring_id bigint references recurring_expenses(id) on delete set null;
alter table recurring_expenses enable row level security; alter table recurring_runs enable row level security;
drop policy if exists "recurring lecture" on recurring_expenses; create policy "recurring lecture" on recurring_expenses for select using (true);
grant select on recurring_expenses to anon, authenticated;
create or replace function run_recurring() returns int
language plpgsql security definer set search_path = public as $$
declare r recurring_expenses; m date; v_id bigint; n int := 0; v_today date := (now() at time zone 'Indian/Reunion')::date;
begin
  perform pg_advisory_xact_lock(hashtext('recurring'));
  for r in select * from recurring_expenses where active loop
    m := date_trunc('month', r.start_on)::date;
    while m <= v_today loop
      insert into recurring_runs (rec_id, month) values (r.id, m) on conflict do nothing;
      if found then
        insert into expenses (creator_id, payer_id, title, amount_cents, spent_on, recurring_id) values (r.payer_id, r.payer_id, r.title, r.amount_cents, m, r.id) returning id into v_id;
        insert into expense_shares (expense_id, member_id) select v_id, id from members where kind = 'coloc';
        n := n + 1;
      end if;
      m := (m + interval '1 month')::date;
    end loop;
  end loop;
  return n;
end $$;
grant execute on function run_recurring() to anon, authenticated;
-- Internet : 29,99 € payés par Zak, pour tout le monde, à partir du 1er novembre 2026
insert into recurring_expenses (key, title, amount_cents, payer_id, start_on)
select 'internet', 'Internet', 2999, id, date '2026-11-01' from members where name in ('Zak', 'Zakaria') limit 1
on conflict (key) do nothing;
