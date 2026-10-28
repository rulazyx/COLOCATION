// Fonction Supabase "notify" : envoie les notifications push (ruptures, défis chifoumi, confirmation de tâches, rappel du soir).
//  - {type:"stock", productId}  → prévient TOUS les colocs qu'un produit est en rupture
//  - {type:"task", event, logId} → tâche à confirmer / confirmée
//  - {type:"message", messageId} → prévient le destinataire d'un message court
//  - {type:"popup", popupId}   → notification d'une fenêtre surprise (code secret requis)
//  - {type:"reminder"}          → (appelée chaque soir par pg_cron) rappelle les tâches qui attendent une confirmation
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
      // Abonnement expiré (appli désinstallée…) ou créé avec une autre clé VAPID : on le supprime (l'appli le recrée à l'ouverture)
      if (code === 404 || code === 410 || String((e as { body?: string }).body ?? "").includes("VapidPkHashMismatch")) await db.from("push_subs").delete().eq("endpoint", s.endpoint);
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
  let body: { type?: string; productId?: number; duelId?: number; messageId?: number; popupId?: number; event?: string } = {};
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

  if (body.type === "message") {
    const { data: m } = await db.from("messages").select("*").eq("id", body.messageId).single();
    if (!m || Date.now() - new Date(m.created_at).getTime() > 2 * 60_000) return json({ sent: 0 });
    const from = (await db.from("members").select("name").eq("id", m.from_id).single()).data?.name ?? "?";
    const { data: subs } = await db.from("push_subs").select("endpoint,sub").eq("member_id", m.to_id);
    return json({ sent: await send((subs ?? []) as Sub[], { title: `Message de ${from}`, body: String(m.body).slice(0, 140), tag: `msg-${m.id}` }) });
  }

  if (body.type === "popup") {
    // {type:"popup", popupId} : prévient le destinataire qu'une fenêtre surprise l'attend (une seule fois, réservé au code secret)
    if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return json({ error: "forbidden" }, 403);
    const { data: p } = await db.from("popups").select("*").eq("id", body.popupId).single();
    if (!p || p.notified_at) return json({ sent: 0 });
    await db.from("popups").update({ notified_at: new Date().toISOString() }).eq("id", p.id);
    const { data: subs } = await db.from("push_subs").select("endpoint,sub").eq("member_id", p.to_id);
    return json({ sent: await send((subs ?? []) as Sub[], { title: "JOYEUX ANNIVERSAIRE EN RETARD", body: "Une surprise t'attend dans l'appli. Ouvre-la !", tag: `popup-${p.id}` }) });
  }

  if (body.type === "task") {
    // {type:"task", event:"submit"|"answer", logId}
    //  submit → prévient les AUTRES colocs qu'une tâche attend leur confirmation
    //  answer → prévient celui qui a fait la tâche de la réponse
    const { data: l } = await db.from("task_logs").select("*").eq("id", body.logId).single();
    if (!l) return json({ sent: 0 });
    const age = (iso: string | null) => (iso ? Date.now() - new Date(iso).getTime() : Infinity);
    const name = async (id: number) => (await db.from("members").select("name").eq("id", id).single()).data?.name ?? "?";
    const labels: Record<string, string> = {
      cuisine: "Nettoyage cuisine", poubelles: "Poubelles", wc: "Nettoyage WC",
      aspijour: "Aspi & serpillière (zone jour)", sdb: "Salle de bain", aspieau: "Aspi & serpillière (zone eau)",
    };
    const label = labels[l.kind] ?? l.kind;
    if (body.event === "submit") {
      if (l.status !== "pending" || age(l.created_at) > 2 * 60_000) return json({ sent: 0 });
      const { data: colocs } = await db.from("members").select("id").eq("kind", "coloc").neq("id", l.doer_id);
      const ids = (colocs ?? []).map((m: { id: number }) => m.id);
      const { data: subs } = await db.from("push_subs").select("endpoint,sub").in("member_id", ids);
      return json({ sent: await send((subs ?? []) as Sub[], {
        title: "🧼 Tâche à confirmer", body: `${await name(l.doer_id)} dit avoir fait : ${label}. Confirme si c'est vrai !`, tag: `task-${l.id}`,
      }) });
    }
    if (body.event === "answer") {
      if (!["validated", "rejected"].includes(l.status) || age(l.answered_at) > 2 * 60_000) return json({ sent: 0 });
      const { data: subs } = await db.from("push_subs").select("endpoint,sub").eq("member_id", l.doer_id);
      return json({ sent: await send((subs ?? []) as Sub[], {
        title: l.status === "validated" ? "✅ Tâche confirmée" : "↩️ Tâche refusée",
        body: `${await name(l.validator_id)} ${l.status === "validated" ? "a confirmé" : "a refusé"} : ${label}${l.status === "validated" ? ` (+${l.soap} 🧼)` : ""}`,
        tag: `task-${l.id}`,
      }) });
    }
    return json({ error: "unknown event" }, 400);
  }

  if (body.type === "reminder") {
    // Rappel du soir : prévient les colocs (sauf l'auteur) des tâches qui attendent encore une confirmation
    if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return json({ error: "forbidden" }, 403);
    const { data: pending } = await db.from("task_logs").select("id,doer_id").eq("status", "pending");
    if (!pending?.length) return json({ sent: 0 });
    const { data: colocs } = await db.from("members").select("id").eq("kind", "coloc");
    let sent = 0;
    for (const m of colocs ?? []) {
      const n = pending.filter((p: { doer_id: number }) => p.doer_id !== m.id).length;
      if (!n) continue;
      const { data: subs } = await db.from("push_subs").select("endpoint,sub").eq("member_id", m.id);
      sent += await send((subs ?? []) as Sub[], {
        title: "🧼 Tâches à confirmer", body: `${n} tâche${n > 1 ? "s attendent" : " attend"} ta confirmation`, tag: "rappel-du-soir",
      });
    }
    return json({ sent });
  }

  return json({ error: "unknown type" }, 400);
});
