-- Patch v103 (à coller dans Supabase > SQL Editor) : nouveaux défis et colocoins gagnés au cumul
insert into challenges (key, coins, skin, xp) values
  ('perso_5', 0, null, 300), ('perso_10', 0, null, 700), ('perso_15', 0, null, 1200),
  ('oiseaux_2', 0, null, 200), ('oiseaux_5', 0, null, 600), ('oiseaux_tous', 0, null, 1500),
  ('sudoku_semaine', 0, null, 300), ('sudoku_niv3', 0, null, 300), ('sudoku_niv5', 0, null, 600), ('sudoku_niv10', 0, null, 1500),
  ('bj_10', 0, null, 200), ('bj_50', 0, null, 600), ('bj_200', 0, null, 1500),
  ('cumul_100', 0, null, 100), ('cumul_1000', 0, null, 400), ('cumul_10000', 0, null, 1500), ('cumul_100000', 0, null, 5000)
on conflict (key) do update set xp = excluded.xp, skin = excluded.skin;

-- Solde + colocoins gagnés au cumul (somme des entrées, dépenses non déduites)
create or replace view chip_balances as
  select m.id as member_id, coalesce(sum(c.amount), 0)::int as chips,
         coalesce(sum(c.amount) filter (where c.amount > 0), 0)::int as earned
  from members m left join chip_ledger c on c.member_id = m.id group by m.id;
grant select on chip_balances to anon, authenticated;
