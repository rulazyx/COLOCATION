// Fonction Supabase "suggest" : ajoute les suggestions non envoyées dans SUGGESTIONS.md sur GitHub.
// Appelée par l'appli juste après l'envoi d'une suggestion ({}), sans paramètre utile : elle traite
// toutes les suggestions en attente (synced_at is null), donc rien n'est perdu si un appel échoue.
//
// Secrets à définir (Edge Functions > Secrets) :
//   GITHUB_TOKEN  : token "fine-grained" limité à CE dépôt, permission Contents = Read and write
//   GITHUB_REPO   : ex. "monpseudo/coloc"
//   (facultatif) GITHUB_BRANCH (défaut "main"), SUGGESTIONS_PATH (défaut "SUGGESTIONS.md"), TZ_NAME
import { createClient } from "npm:@supabase/supabase-js@2";

const TZ = Deno.env.get("TZ_NAME") ?? "Indian/Reunion";
const REPO = Deno.env.get("GITHUB_REPO")!;
const TOKEN = Deno.env.get("GITHUB_TOKEN")!;
const BRANCH = Deno.env.get("GITHUB_BRANCH") ?? "main";
const PATH = Deno.env.get("SUGGESTIONS_PATH") ?? "SUGGESTIONS.md";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const gh = (path: string, init: RequestInit = {}) =>
  fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "coloc-suggest", ...(init.headers ?? {}) },
  });
const b64enc = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64dec = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), (c) => c.charCodeAt(0)));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { data: rows, error } = await db.from("suggestions").select("id, body, created_at, members(name)")
    .is("synced_at", null).order("id").limit(50);
  if (error) return json({ error: error.message }, 500);
  if (!rows?.length) return json({ added: 0 });

  const fmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" });
  const block = rows.map((r) => {
    // deno-lint-ignore no-explicit-any
    const who = (r as any).members?.name ?? "?";
    const text = r.body.replace(/\r/g, "").split("\n").map((l: string) => "> " + l).join("\n");
    return `### ${fmt.format(new Date(r.created_at))} — ${who}\n${text}\n`;
  }).join("\n");

  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await gh(`${PATH}?ref=${BRANCH}`);
    let sha: string | undefined, old = "# Suggestions de la coloc\n\n";
    if (cur.ok) { const j = await cur.json(); sha = j.sha; old = b64dec(j.content); }
    else if (cur.status !== 404) return json({ error: "github " + cur.status }, 502);
    const put = await gh(PATH, {
      method: "PUT",
      body: JSON.stringify({ message: `Suggestions (+${rows.length})`, content: b64enc(old.replace(/\s*$/, "\n\n") + block), branch: BRANCH, sha }),
    });
    if (put.ok) {
      await db.from("suggestions").update({ synced_at: new Date().toISOString() }).in("id", rows.map((r) => r.id));
      return json({ added: rows.length });
    }
    if (put.status !== 409 && put.status !== 422) return json({ error: "github " + put.status }, 502);
  }
  return json({ error: "conflit github" }, 502);
});
