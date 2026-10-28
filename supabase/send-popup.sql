-- ============================================================
--  Envoie la notification "JOYEUX ANNIVERSAIRE EN RETARD" à Zakaria (une seule fois).
--  À lancer APRÈS migration-v8.sql et après avoir redéployé la fonction "notify".
--  Remplace VOTRE-PROJET et VOTRE_CODE_SECRET (les mêmes que dans cron.sql), puis Supabase > SQL Editor > Run.
-- ============================================================
select net.http_post(
  url     := 'https://VOTRE-PROJET.supabase.co/functions/v1/notify',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'VOTRE_CODE_SECRET'),
  body    := jsonb_build_object('type', 'popup', 'popupId', (select id from popups where key = 'zakaria-anniv-2026'))
);
