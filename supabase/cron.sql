-- ============================================================
--  Rappel automatique chaque soir à 20h (heure de La Réunion = UTC+4 → 16h UTC)
--  À lancer APRÈS avoir déployé la fonction "notify".
--  Remplace les 3 valeurs en MAJUSCULES, puis Supabase > SQL Editor > Run.
--  Ailleurs qu'à La Réunion : change '0 16 * * *' (heure en UTC) et la variable TZ_NAME de la fonction.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'rappel-20h',
  '0 16 * * *',
  $$
  select net.http_post(
    url     := 'https://VOTRE-PROJET.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', 'VOTRE_CODE_SECRET'
    ),
    body    := '{"type":"reminder"}'::jsonb
  );
  $$
);

-- Pour arrêter le rappel un jour :  select cron.unschedule('rappel-20h');
