-- v104 : la course aux pièces passe dans Jeux. Plus de savons : un dé toutes les 3 h, 3 en réserve au maximum.
-- Le plateau n'est plus remis à zéro chaque lundi : chacun garde sa position actuelle. Univers pirate avec malus (cases en fin de fichier).
create table if not exists dice_clock (member_id int primary key references members(id) on delete cascade, t timestamptz not null);
alter table dice_clock enable row level security;
drop policy if exists "dice_clock lecture" on dice_clock; create policy "dice_clock lecture" on dice_clock for select using (true);
grant select on dice_clock to anon, authenticated;
do $$ begin
  begin alter publication supabase_realtime add table dice_clock; exception when duplicate_object then null; end;
end $$;
create or replace function roll_dice(p_member int) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_t timestamptz;
  v_week  date := date_trunc('week', now() at time zone 'Indian/Reunion')::date;
  v_pos int; v_roll int; v_to int; v_note text := ''; v_laps int; v_cellno int;
  v_perk text; v_ch int := 0; v_cell goose_cells; v_depth int := 0; v_xp int := 0; v_tr int := 0; v_size int := 30;
begin
  if not exists (select 1 from members where id = p_member and kind = 'coloc') then raise exception 'Seuls les colocataires jouent à la course aux pièces.'; end if;
  perform pg_advisory_xact_lock(hashtext('dice:' || p_member));
  -- horloge des dés : un dé par tranche de 3 h écoulée depuis v_t, 3 au plus (au-delà de 9 h sans jouer, on n'en gagne plus)
  select t into v_t from dice_clock where member_id = p_member;
  v_t := greatest(coalesce(v_t, now() - interval '9 hours'), now() - interval '9 hours');
  if now() - v_t < interval '3 hours' then
    raise exception 'Pas encore de dé : le prochain arrive dans % min.', ceil(extract(epoch from (v_t + interval '3 hours' - now())) / 60)::int;
  end if;
  insert into dice_clock (member_id, t) values (p_member, v_t + interval '3 hours') on conflict (member_id) do update set t = excluded.t;
  select to_pos into v_pos from dice_rolls where member_id = p_member order by id desc limit 1;
  v_pos := coalesce(v_pos, 0);                                           -- position cumulée (les tours sont infinis)
  select coalesce(max(to_pos / v_size), 0) into v_laps from dice_rolls where member_id = p_member;
  v_roll := 1 + floor(random() * 6)::int;
  v_to := v_pos + v_roll;
  loop
    v_cellno := case when v_to <= 0 then 0 else ((v_to - 1) % v_size) + 1 end;
    select * into v_cell from goose_cells where cell = v_cellno;
    exit when not found or v_depth >= 3;
    v_depth := v_depth + 1;
    if v_cell.kind = 'xp' then v_xp := v_xp + v_cell.v; v_note := v_note || ' +' || v_cell.v || ' XP'; exit;
    elsif v_cell.kind = 'chips' and v_cell.v < 0 then   -- pirates : on ne vole jamais plus que le solde
      v_ch := v_ch - least(-v_cell.v, greatest(coalesce((select chips from chip_balances where member_id = p_member), 0), 0));
      v_note := v_note || ' ' || coalesce(v_cell.name, 'Pirates') || ' : ' || v_ch || ' colocoins'; exit;
    elsif v_cell.kind = 'chips' then v_ch := v_ch + v_cell.v; v_note := v_note || ' +' || v_cell.v || ' colocoins'; exit;
    elsif v_cell.kind = 'back' then v_to := greatest(v_to - v_cell.v, 0); v_note := v_note || ' ' || lower(coalesce(v_cell.name, 'piège')) || ' : recule de ' || v_cell.v;
    elsif v_cell.kind = 'goose' then v_to := v_to + v_roll; v_note := v_note || ' vent favorable : avance encore de ' || v_roll;
    else exit; end if;
  end loop;
  if v_to / v_size > v_laps then
    v_xp := v_xp + 200; v_tr := v_tr + 0; v_note := v_note || ' TOUR TERMINÉ ! +' || 200 || ' XP';
    -- (la récompense de la semaine va désormais au coloc qui a gagné le plus de savons : voir settle_plateau)
  end if;
  insert into dice_rolls (member_id, week, cost, roll, from_pos, to_pos, note) values (p_member, v_week, 0, v_roll, v_pos, v_to, nullif(trim(v_note), ''));   -- les dés ne consomment plus de savons
  if v_xp > 0 then perform add_xp(p_member, v_xp, 'plateau'); end if;
  if v_tr > 0 then insert into coin_ledger (member_id, amount, reason) values (p_member, v_tr, 'plateau'); end if;
  if v_ch <> 0 then insert into chip_ledger (member_id, amount, reason) values (p_member, v_ch, 'plateau'); end if;
  return json_build_object('perk', v_perk, 'roll', v_roll, 'from', v_pos, 'to', v_to, 'cost', 0, 'xp', v_xp, 'trophies', v_tr, 'chips', v_ch, 'note', trim(v_note));
end $$;
grant execute on function roll_dice(int) to anon, authenticated;
-- Plateau pirate : malus (récif, tempête, kraken = reculer ; pirates = vol de colocoins, jamais plus que le solde). Même liste que GOOSE dans config.js.
alter table goose_cells add column if not exists name text;
delete from goose_cells;
insert into goose_cells (cell, kind, v, name) values
  (2, 'chips', 20, 'Coffre'),
  (4, 'back', 2, 'Récif'),
  (5, 'xp', 30, 'Carte au trésor'),
  (7, 'chips', -20, 'Pirates'),
  (9, 'goose', 0, 'Vent favorable'),
  (10, 'xp', 40, 'Carte au trésor'),
  (12, 'back', 3, 'Tempête'),
  (13, 'chips', 30, 'Coffre'),
  (15, 'xp', 50, 'Carte au trésor'),
  (16, 'back', 5, 'Kraken'),
  (18, 'goose', 0, 'Vent favorable'),
  (20, 'xp', 60, 'Carte au trésor'),
  (21, 'chips', -30, 'Pirates'),
  (23, 'chips', 40, 'Coffre'),
  (25, 'xp', 80, 'Carte au trésor'),
  (26, 'back', 2, 'Récif'),
  (28, 'back', 3, 'Tempête');
