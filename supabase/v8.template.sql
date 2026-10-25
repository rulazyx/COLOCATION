-- ============================================================
--  Version 8 : introduction (5 onglets), plateau (jeu de l'oie), messages courts,
--              chifoumi +5/−4 trophées, blackjack avec mises, niveaux plus durs
--  Ne remet RIEN à zéro. Sans risque si relancé.
-- ============================================================

-- ---------- Niveaux : courbe __LEVEL_K__ × L × (L − 1) ----------
create or replace function level_of(p_xp int) returns int
language sql immutable as $$
  select floor((1 + sqrt(1 + greatest(p_xp, 0)::numeric * 4 / __LEVEL_K__)) / 2)::int
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

-- ---------- Dollars (monnaie du blackjack) ----------
alter table members add column if not exists badge text;   -- badge mis en avant sur le profil

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

-- Récompense du jour : __DAILY_CHIPS__ dollars + __DAILY_XP__ XP (plus de série ni de roue)
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
  if coalesce(p_wager, 0) <> 0 then raise exception 'Le chifoumi se joue sans mise.'; end if;
  if p_challenger = p_opponent then raise exception 'Tu ne peux pas te défier toi-même.'; end if;
  perform pg_advisory_xact_lock(hashtext('duel:' || least(p_challenger, p_opponent) || '-' || greatest(p_challenger, p_opponent)));
  if exists (select 1 from duels where status = 'pending'
             and ((challenger_id = p_challenger and opponent_id = p_opponent) or (challenger_id = p_opponent and opponent_id = p_challenger))) then
    raise exception 'Un défi est déjà en attente avec ce joueur.';
  end if;
  insert into duels (challenger_id, opponent_id, wager) values (p_challenger, p_opponent, 0) returning id into v_id;
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
  if v_p.kind not in (__PERK_CONFIRM__) then raise exception 'Rien à confirmer ici.'; end if;
  if p_member = v_p.member_id or not exists (select 1 from members where id = p_member and kind = 'coloc') then raise exception 'Seuls les autres colocs confirment.'; end if;
  insert into perk_confirms (perk_id, member_id) values (p_perk, p_member) on conflict do nothing;
end $$;
grant execute on function confirm_perk(bigint, int) to anon, authenticated;

-- Lancer un dé : coûte 1 savon, puis +1 à chaque achat de la journée (repart à 1 à minuit, heure de La Réunion)
create or replace function roll_dice(p_member int) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Indian/Reunion')::date;
  v_week  date := date_trunc('week', now() at time zone 'Indian/Reunion')::date;
  v_n int; v_cost int; v_pos int; v_roll int; v_to int; v_note text := ''; v_finished boolean;
  v_perk text; v_ch int := 0; v_cell goose_cells; v_depth int := 0; v_xp int := 0; v_tr int := 0; v_size int := __GOOSE_SIZE__;
begin
  if not exists (select 1 from members where id = p_member and kind = 'coloc') then raise exception 'Seuls les colocataires jouent au plateau.'; end if;
  perform pg_advisory_xact_lock(hashtext('dice:' || p_member));
  select count(*) into v_n from dice_rolls where member_id = p_member and (created_at at time zone 'Indian/Reunion')::date = v_today;
  v_cost := (array[__DICE_PRICES__])[least(v_n + 1, __DICE_N__)];
  if soap_of(p_member) < v_cost then raise exception 'Il te faut % savon% pour ce dé.', v_cost, case when v_cost > 1 then 's' else '' end; end if;
  select coalesce(max(to_pos), 0) into v_pos from dice_rolls where member_id = p_member and week = v_week;
  v_finished := exists (select 1 from dice_rolls where member_id = p_member and week = v_week and to_pos >= v_size);
  if v_pos >= v_size then raise exception 'Tu es déjà arrivé cette semaine ! Reviens lundi.'; end if;
  v_roll := 1 + floor(random() * 6)::int;
  v_to := v_pos + v_roll;
  if v_to > v_size then v_to := v_size - (v_to - v_size); end if;       -- on rebondit après l'arrivée
  loop
    select * into v_cell from goose_cells where cell = v_to;
    exit when not found or v_depth >= 3;
    v_depth := v_depth + 1;
    if v_cell.kind = 'xp' then v_xp := v_xp + v_cell.v; v_note := v_note || ' +' || v_cell.v || ' XP'; exit;
    elsif v_cell.kind = 'chips' then v_ch := v_ch + v_cell.v; v_note := v_note || ' +' || v_cell.v || ' dollars'; exit;
    elsif v_cell.kind = 'back' then v_to := greatest(v_to - v_cell.v, 0); v_note := v_note || ' piège : recule de ' || v_cell.v;
    elsif v_cell.kind = 'goose' then v_to := least(v_to + v_roll, v_size); v_note := v_note || ' oie : avance encore de ' || v_roll;
    else exit; end if;
  end loop;
  if v_to >= v_size and not v_finished then
    v_xp := v_xp + __GOOSE_FIN_XP__; v_tr := v_tr + __GOOSE_FIN_TR__; v_note := v_note || ' ARRIVÉE ! +' || __GOOSE_FIN_XP__ || ' XP, +' || __GOOSE_FIN_TR__ || ' trophées';
    v_perk := (array[__PERK_KINDS__])[1 + ((v_week - date '2024-01-01') / 7) % __PERK_N__];
    insert into perks (member_id, week, kind) values (p_member, v_week, v_perk) on conflict do nothing;
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

-- ---------- Chifoumi : +5 trophées au gagnant, −4 au perdant (sans passer sous 0) ----------
create or replace function play_duel(p_duel bigint, p_player int, p_move text) returns duels
language plpgsql security definer set search_path = public as $$
declare d duels; cm text; w int; l int; v_today int; v_gain int; v_loss int;
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
    v_loss := least(__DUEL_L__, greatest(balance_of(l), 0));
    if v_loss > 0 then insert into coin_ledger (member_id, amount, reason) values (l, -v_loss, 'duel-loss'); end if;
  end if;
  return d;
end $$;

-- ---------- Blackjack : on mise des dollars (10-20-30-50, puis 100-200-300-500 au-delà de 500 dollars) ----------
-- p_net = gain (+) ou perte (−) de dollars de la main, p_hands = 1 (ou 2 après un split), p_wins = mains gagnées
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

-- ---------- REMISE À ZÉRO COMPLÈTE (une seule fois) : XP, records, trophées, dollars, savons, défis, apparences ----------
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
