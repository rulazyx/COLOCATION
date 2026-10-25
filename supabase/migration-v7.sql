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
