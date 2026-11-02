-- Patch v126 : la caisse mystère de Cardinal coûte 100 colocoins (Supabase > SQL Editor > Run)
create or replace function open_bird_crate(p_member int) returns text
language plpgsql security definer set search_path = public as $$
declare v_key text; v_tot numeric; v_r numeric;
begin
  if not exists (select 1 from members where id = p_member) then raise exception 'Membre inconnu.'; end if;
  perform pg_advisory_xact_lock(hashtext('shop:' || p_member));
  select coalesce(sum(w), 0) into v_tot from bird_odds o where not exists (select 1 from purchases where member_id = p_member and item = 'bird:' || o.key);
  if v_tot = 0 then raise exception 'Tu as déjà tous les oiseaux !'; end if;
  if chips_of(p_member) < 100 then raise exception 'Il te faut 100 colocoins pour une caisse.'; end if;
  v_r := random() * v_tot;
  select key into v_key from (
    select o.key, sum(o.w) over (order by o.key) as cum from bird_odds o
    where not exists (select 1 from purchases where member_id = p_member and item = 'bird:' || o.key)
  ) t where cum >= v_r order by cum limit 1;
  insert into chip_ledger (member_id, amount, reason) values (p_member, -100, 'caisse');
  insert into purchases (member_id, item, price) values (p_member, 'bird:' || v_key, 0);
  return v_key;
end $$;
grant execute on function open_bird_crate(int) to anon, authenticated;
