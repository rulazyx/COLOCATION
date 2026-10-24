// ============================================================
//  CONFIGURATION — le seul fichier que tu dois modifier
// ============================================================

export const CONFIG = {
  // Laisse vide pour tester en "mode démo" (données stockées sur ton téléphone uniquement).
  // Renseigne les 3 valeurs pour activer le partage entre colocataires + les notifications.
  SUPABASE_URL: '',        // ex : 'https://abcdefgh.supabase.co'
  SUPABASE_ANON_KEY: '',   // clé "anon" / "publishable" (publique, elle peut rester dans GitHub)
  VAPID_PUBLIC_KEY: '',    // clé publique générée avec tools/vapid.html
};

// Les tâches de la semaine. day : 0 = lundi … 6 = dimanche.
// ⚠️ Poubelles : mets le vrai jour de collecte (1 = mardi par défaut).
// Les tâches tournent d'un colocataire à l'autre chaque semaine :
// sur 5 semaines, chacun fait exactement les mêmes tâches que les autres.
// (Modifier cette liste n'affecte que les semaines pas encore créées.)
export const TASK_TEMPLATES = [
  { label: 'Nettoyage cuisine',            detail: 'Évier, plaques, micro-ondes (int./ext.), table et meubles', day: 0 },
  { label: 'Sortir les poubelles',         detail: 'Tri, compost, ménagère + sacs propres',                      day: 1 },
  { label: 'Nettoyage WC',                 detail: 'Cuvette, lunette, balayette, papier',                        day: 1 },
  { label: 'Aspi & serpillière (zone jour)', detail: 'Salon, salle à manger, cuisine, couloirs',                 day: 2 },
  { label: 'Nettoyage cuisine',            detail: 'Évier, plaques, micro-ondes (int./ext.), table et meubles', day: 3 },
  { label: 'Nettoyage WC',                 detail: 'Cuvette, lunette, balayette, papier',                        day: 4 },
  { label: 'Nettoyage salle de bain',      detail: 'Douche/baignoire, lavabo, miroir, désinfection',             day: 5 },
  { label: 'Aspi & serpillière (zone jour)', detail: 'Salon, salle à manger, cuisine, couloirs',                 day: 5 },
  { label: 'Aspi & serpillière (zone eau)', detail: 'Sols de la salle de bain et des WC',                        day: 6 },
];
