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
  ('noob', 0, null),
  ('mathematicien', 0, null),
  ('inspecteur', 0, 'detective')
on conflict (key) do update set coins = excluded.coins, skin = excluded.skin;
