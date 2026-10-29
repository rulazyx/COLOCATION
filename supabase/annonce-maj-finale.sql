-- Annonce « mise à jour finale » : s'affiche une fois à l'ouverture de l'appli, pour tout le monde,
-- demain vendredi 30 octobre 2026 à 9 h (heure de La Réunion = 5 h UTC). À coller dans Supabase > SQL Editor > Run.
-- Pas besoin de rien relancer demain : la tâche programmée se lance toute seule puis se supprime.
create extension if not exists pg_cron;

select cron.schedule(
  'annonce-maj-finale',
  '0 5 30 10 *',
  $$
  insert into popups (key, to_id, title, body, theme)
  select 'maj-finale-' || id, id, 'La mise à jour finale est sortie',
         E'La version finale de La Kaz est disponible.\nFerme complètement l''appli puis rouvre-la pour en profiter.',
         'info'
  from members
  on conflict (key) do nothing;
  select cron.unschedule('annonce-maj-finale');
  $$
);

-- Pour annuler avant : select cron.unschedule('annonce-maj-finale');
-- Pour l'envoyer tout de suite (test) : exécute seulement le bloc « insert into popups … on conflict do nothing; »
