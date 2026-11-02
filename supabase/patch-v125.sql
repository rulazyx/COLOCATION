-- ============================================================
--  Patch v125 : notifications réparées + cadeau de 100 colocoins pour tous
--  Supabase > SQL Editor > coller tout > Run (peut être relancé sans risque)
-- ============================================================
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 1) Chaque alerte (activité proposée, nouvelle semaine, cadeau…) part aussi en notification push
create or replace function popup_push() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url     := 'https://eycnuihgitlqvittyppj.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('type', 'popup', 'popupId', new.id)
  );
  return new;
exception when others then
  return new; -- une panne de notification ne doit jamais bloquer l'alerte elle-même
end $$;
drop trigger if exists popups_push on popups;
create trigger popups_push after insert on popups for each row execute function popup_push();

-- 2) Rappel de 20h (heure de La Réunion = 16h UTC) : tâches à confirmer
do $$ begin perform cron.unschedule('rappel-20h'); exception when others then null; end $$;
select cron.schedule('rappel-20h', '0 16 * * *', $c$
  select net.http_post(
    url     := 'https://eycnuihgitlqvittyppj.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{"type":"reminder"}'::jsonb
  );
$c$);

-- 3) Cadeau : 100 colocoins pour chaque membre, une seule fois (+ alerte avec notification)
insert into chip_ledger (member_id, amount, reason)
select m.id, 100, 'cadeau:maj-v125' from members m
where not exists (select 1 from chip_ledger l where l.member_id = m.id and l.reason = 'cadeau:maj-v125');

insert into popups (key, to_id, title, body, theme)
select 'cadeau-maj-125-' || id, id, '+100 colocoins offerts',
       E'Merci pour ta patience pendant les mises à jour !\nOn t''a ajouté 100 colocoins.',
       'info'
from members
on conflict (key) do nothing;
