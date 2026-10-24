// Fonction Supabase "notify" : envoie les notifications push.
//  - {type:"stock", productId}  → prévient TOUS les colocs qu'un produit est en rupture
//  - {type:"reminder"}          → (appelée chaque soir par pg_cron) relance ceux dont la tâche du jour n'est pas cochée
//
// Secrets à définir (Edge Functions > Secrets) :
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex: mailto:toi@exemple.fr), CRON_SECRET
//   (facultatif) TZ_NAME, par défaut Indian/Reunion
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const TZ = Deno.env.get("TZ_NAME") ?? "Indian/Reunion";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Sub = { endpoint: string; sub: Record<string, unknown> };

async function send(subs: Sub[], payload: { title: string; body: string; tag?: string }) {
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      // deno-lint-ignore no-explicit-any
      await webpush.sendNotification(s.sub as any, JSON.stringify(payload));
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // Abonnement expiré (appli désinstallée…) : on le supprime
      if (code === 404 || code === 410) await db.from("push_subs").delete().eq("endpoint", s.endpoint);
      else console.error("push error", code, e);
    }
  }));
  return sent;
}

// Jour de la semaine (0 = lundi) et lundi de la semaine, dans le fuseau de la coloc
function today() {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date()); // AAAA-MM-JJ
  const d = new Date(ymd + "T00:00:00Z");
  const dayIndex = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayIndex);
  return { dayIndex, monday: d.toISOString().slice(0, 10) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: { type?: string; productId?: number; duelId?: number; event?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  if (body.type === "stock") {
    const { data: p } = await db.from("products")
      .select("name,out_of_stock,updated_by,updated_at").eq("id", body.productId).single();
    // Garde-fous : le produit doit être en rupture ET venir d'être signalé (évite le spam)
    if (!p?.out_of_stock || Date.now() - new Date(p.updated_at).getTime() > 2 * 60_000) return json({ sent: 0 });
    let who = "";
    if (p.updated_by) {
      const { data: m } = await db.from("members").select("name").eq("id", p.updated_by).single();
      if (m) who = ` (signalé par ${m.name})`;
    }
    const { data: subs } = await db.from("push_subs").select("endpoint,sub");
    const sent = await send((subs ?? []) as Sub[], {
      title: "🛒 Rupture de stock",
      body: `${p.name} est en rupture${who}`,
      tag: `stock-${body.productId}`,
    });
    return json({ sent });
  }

  if (body.type === "duel") {
    // {type:"duel", event:"challenge"|"result", duelId} → prévient l'adversaire d'un défi, ou le challenger du résultat
    const { data: d } = await db.from("duels").select("*").eq("id", body.duelId).single();
    if (!d) return json({ sent: 0 });
    const age = (iso: string | null) => (iso ? Date.now() - new Date(iso).getTime() : Infinity);
    const name = async (id: number) => (await db.from("members").select("name").eq("id", id).single()).data?.name ?? "?";
    const emoji: Record<string, string> = { pierre: "✊", feuille: "✋", ciseaux: "✌️" };
    let target: number, payload: { title: string; body: string; tag: string };
    if (body.event === "challenge") {
      if (d.status !== "pending" || age(d.created_at) > 2 * 60_000) return json({ sent: 0 });
      target = d.opponent_id;
      payload = { title: "⚔️ Défi chifoumi !", body: d.wager ? `${await name(d.challenger_id)} te défie. Mise : ${d.wager} 🪙` : `${await name(d.challenger_id)} te défie au chifoumi !`, tag: `duel-${d.id}` };
    } else if (body.event === "result") {
      if (d.status !== "done" || age(d.played_at) > 2 * 60_000) return json({ sent: 0 });
      target = d.challenger_id;
      const other = await name(d.opponent_id);
      const moves = `${emoji[d.challenger_move]} contre ${emoji[d.opponent_move]}`;
      payload = {
        title: "🎮 Résultat du duel",
        body: !d.winner_id ? `Égalité contre ${other} (${moves})`
          : d.winner_id === d.challenger_id ? (d.wager ? `Tu as gagné ${d.wager} 🪙 contre ${other} (${moves})` : `Tu as battu ${other} (${moves})`)
          : (d.wager ? `Tu as perdu ${d.wager} 🪙 contre ${other} (${moves})` : `${other} gagne cette fois (${moves})`),
        tag: `duel-${d.id}`,
      };
    } else return json({ error: "unknown event" }, 400);
    const { data: subs } = await db.from("push_subs").select("endpoint,sub").eq("member_id", target);
    return json({ sent: await send((subs ?? []) as Sub[], payload) });
  }

  if (body.type === "reminder") {
    if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return json({ error: "forbidden" }, 403);
    const { dayIndex, monday } = today();
    const { data: tasks } = await db.from("tasks").select("label,assignee_id")
      .eq("week", monday).eq("day_index", dayIndex).eq("status", "todo");
    const byMember = new Map<number, string[]>();
    for (const t of tasks ?? []) byMember.set(t.assignee_id, [...(byMember.get(t.assignee_id) ?? []), t.label]);
    let sent = 0;
    for (const [memberId, labels] of byMember) {
      const { data: subs } = await db.from("push_subs").select("endpoint,sub").eq("member_id", memberId);
      sent += await send((subs ?? []) as Sub[], {
        title: "🧹 Rappel ménage",
        body: `À faire aujourd'hui : ${labels.join(", ")}`,
        tag: "rappel-du-soir",
      });
    }
    return json({ sent, members: byMember.size });
  }

  return json({ error: "unknown type" }, 400);
});
