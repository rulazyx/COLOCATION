// Accès aux données du cloud (Supabase, partagé entre colocs, temps réel).
// Le mode démo (localStorage) est dans demo.js : il n'est chargé que si aucune clé Supabase n'est configurée.
import { CONFIG } from './config.js';
const reunionDay = () => new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 10);   // jour à La Réunion (UTC+4), comme la base

export const BUILD = 70;   // doit être égal à BUILD dans app.js (voir tools/bump.mjs)
export async function makeCloudApi() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  const check = ({ data, error }) => { if (error) throw error; return data; };
  const ping = (body) => sb.functions.invoke('notify', { body }).then((r) => { if (r.error) console.warn('notify:', r.error); });
  return {
    mode: 'cloud',
    async members() { return check(await sb.from('members').select('*').order('id')); },
    async updateProfile(id, patch) { check(await sb.from('members').update(patch).eq('id', id)); },
    async taskLogs() { return check(await sb.from('task_logs').select('*').order('id', { ascending: false }).limit(200)); },
    async submitTask(member, kind) {
      const id = check(await sb.rpc('submit_task', { p_member: member, p_kind: kind }));
      ping({ type: 'task', event: 'submit', logId: id });
      return id;
    },
    async answerTask(logId, member, ok) {
      let r = check(await sb.rpc('answer_task', { p_log: logId, p_member: member, p_ok: ok }));
      if (Array.isArray(r)) r = r[0];
      if (r?.status === 'validated' || r?.status === 'rejected') ping({ type: 'task', event: 'answer', logId });
      return r;
    },
    // Code secret à 4 chiffres (jamais stocké en clair : la base ne garde qu'une empreinte)
    async setPin(id, pin) { return check(await sb.rpc('set_pin', { p_member: id, p_pin: pin })); },
    async checkPin(id, pin) { return check(await sb.rpc('check_pin', { p_member: id, p_pin: pin })); },
    async scores() { return check(await sb.from('scores').select('*')); },
    async balances() { return check(await sb.from('balances').select('*')); },
    async products() { return check(await sb.from('products').select('*').order('id')); },
    async setProduct(id, out, memberId) {
      check(await sb.from('products').update({ out_of_stock: out, updated_by: memberId, updated_at: new Date().toISOString() }).eq('id', id));
      if (out) ping({ type: 'stock', productId: id }); // un échec ici ne doit pas annuler le signalement
    },
    async purchases() { return check(await sb.from('purchases').select('*')); },
    // --- v5 : XP, classement hebdomadaire, échange de tâches ---
    async xp() { return check(await sb.from('member_xp').select('*')); },
    async weekly() { return check(await sb.from('weekly_trophies').select('*')); },
    // --- v8 : plateau, messages, blackjack ---
    async soapSpent() { return check(await sb.from('soap_spent').select('*')); },
    async diceRolls() { return check(await sb.from('dice_rolls').select('*').order('id', { ascending: false }).limit(300)); },
    async rollDice(member) { return check(await sb.rpc('roll_dice', { p_member: member })); },
    async chips() { return check(await sb.from('chip_balances').select('*')); },
    async farm() { return check(await sb.from('farm_plots').select('*')); },
    async farmState() { return check(await sb.from('farm_state').select('*')); },
    async farmDay() { return check(await sb.from('farm_day').select('*')); },
    async farmStock() { return check(await sb.from('farm_stock').select('*')); },
    async farmBuilds() { return check(await sb.from('farm_builds').select('*')); },
    async farmSell(m, crop, qty) { return check(await sb.rpc('farm_sell', { p_member: m, p_crop: crop, p_qty: qty })); },
    async farmBuild(m, spot, item) { return check(await sb.rpc('farm_build', { p_member: m, p_spot: spot, p_item: item })); },
    async farmPlant(m, slot, crop) { return check(await sb.rpc('farm_plant', { p_member: m, p_slot: slot, p_crop: crop })); },
    async farmHarvest(m, slot) { return check(await sb.rpc('farm_harvest', { p_member: m, p_slot: slot })); },
    async farmWater(w, o, slot) { return check(await sb.rpc('farm_water', { p_waterer: w, p_owner: o, p_slot: slot })); },
    async farmUnlock(m) { return check(await sb.rpc('farm_unlock', { p_member: m })); },
    async plateauWeeks() { return check(await sb.from('plateau_weeks').select('*').order('week', { ascending: false }).limit(8)); },
    async settlePlateau() { const { error } = await sb.rpc('settle_plateau'); if (error) console.warn(error.message); },
    async exchangeSoap(member, soap) { return check(await sb.rpc('exchange_soap', { p_member: member, p_soap: soap })); },
    async buyShop(member, item) { return check(await sb.rpc('buy_shop', { p_member: member, p_item: item })); },
    async openBirdCrate(member) { return check(await sb.rpc('open_bird_crate', { p_member: member })); },
    async ledger(member) { return check(await sb.from('coin_ledger').select('*').eq('member_id', member).neq('amount', 0).order('id', { ascending: false }).limit(100)); },
    async perks() { return check(await sb.from('perks').select('*').order('id', { ascending: false }).limit(100)); },
    async perkConfirms() { return check(await sb.from('perk_confirms').select('*')); },
    async confirmPerk(perk, member) { check(await sb.rpc('confirm_perk', { p_perk: perk, p_member: member })); },
    async messages(member) { return check(await sb.from('messages').select('*').eq('to_id', member).order('id', { ascending: false }).limit(30)); },
    async sendMessage(from, to, body) {
      const id = check(await sb.rpc('send_message', { p_from: from, p_to: to, p_body: body }));
      ping({ type: 'message', messageId: id });
      return id;
    },
    async readMessages(member) { check(await sb.rpc('read_messages', { p_member: member })); },
    async events() { return check(await sb.from('events').select('*').order('starts_at').limit(200)); },
    async eventVotes() { return check(await sb.from('event_votes').select('*')); },
    async createEvent(m, title, place, startsAt, invitees = null) { return check(await sb.rpc('create_event', { p_member: m, p_title: title, p_place: place || null, p_starts: startsAt, ...(invitees ? { p_invitees: invitees } : {}) })); },
    async voteEvent(m, ev, vote) { check(await sb.rpc('vote_event', { p_member: m, p_event: ev, p_vote: vote })); },
    async deleteEvent(m, ev) { check(await sb.rpc('delete_event', { p_member: m, p_event: ev })); },
    async sendSuggestion(member, body) {
      const id = check(await sb.rpc('send_suggestion', { p_member: member, p_body: body }));
      sb.functions.invoke('suggest', { body: {} }).then((r) => { if (r.error) console.warn('suggest:', r.error); });
      return id;
    },
    async reportBlackjack(id, bet, net, hands, wins, blackjack) {
      let r = check(await sb.rpc('report_blackjack', { p_member: id, p_bet: bet, p_net: net, p_hands: hands, p_wins: wins, p_blackjack: !!blackjack }));
      if (Array.isArray(r)) r = r[0];
      return r;
    },
    async duels() { return check(await sb.from('duels').select('*').order('id', { ascending: false }).limit(300)); },
    async createDuel(challenger, opponent, wager, move) {
      const id = check(await sb.rpc('create_duel', { p_challenger: challenger, p_opponent: opponent, p_wager: wager, p_move: move }));
      ping({ type: 'duel', event: 'challenge', duelId: id });
      return id;
    },
    async playDuel(duelId, player, move) {
      let d = check(await sb.rpc('play_duel', { p_duel: duelId, p_player: player, p_move: move }));
      if (Array.isArray(d)) d = d[0];
      ping({ type: 'duel', event: 'result', duelId });
      return d;
    },
    async cancelDuel(duelId, player) { check(await sb.rpc('cancel_duel', { p_duel: duelId, p_player: player })); },
    // --- v4 : stats, classement, récompenses, défis ---
    async stats() { return check(await sb.from('member_stats').select('*')); },
    async duelStats() { return check(await sb.from('duel_stats').select('*')); },
    async unlocks() { return check(await sb.from('unlocks').select('*')); },
    async views() { return check(await sb.from('profile_views').select('*')); },
    async viewProfile(viewer, viewed) {
      const { error } = await sb.from('profile_views').insert({ viewer_id: viewer, viewed_id: viewed });
      if (error && error.code !== '23505') throw error; // 23505 = déjà consulté
    },
    async claimDaily(id, day) { return check(await sb.rpc('claim_daily', { p_member: id, p_day: day })); },
    async spinWheel(id) { return check(await sb.rpc('spin_wheel', { p_member: id })); },
    async reportGame(id, game, score) {
      let r = check(await sb.rpc('report_game', { p_member: id, p_game: game, p_score: Math.floor(score) }));
      if (Array.isArray(r)) r = r[0];
      return r;
    },
    async claimChallenge(id, key) { return check(await sb.rpc('claim_challenge', { p_member: id, p_key: key })); },
    async launchGame(id) { return check(await sb.rpc('launch_game', { p_member: id })); },
    async expenses() { return check(await sb.from('expenses').select('*').order('spent_on', { ascending: false }).order('id', { ascending: false }).limit(500)); },
    async expenseShares() { return check(await sb.from('expense_shares').select('*')); },
    async addExpense(m, title, cents, payer, day, parts) { return check(await sb.rpc('add_expense', { p_member: m, p_title: title, p_amount_cents: cents, p_payer: payer, p_day: day, p_parts: parts })); },
    async updateExpense(m, id, title, cents, payer, day, parts) { check(await sb.rpc('update_expense', { p_member: m, p_id: id, p_title: title, p_amount_cents: cents, p_payer: payer, p_day: day, p_parts: parts })); },
    async deleteExpense(m, id) { check(await sb.rpc('delete_expense', { p_member: m, p_id: id })); },
    async addTransfer(m, from, to, cents) { return check(await sb.rpc('add_transfer', { p_member: m, p_from: from, p_to: to, p_cents: cents })); },
    async shopRequests() { return check(await sb.from('shop_requests').select('*').order('id', { ascending: false }).limit(60)); },
    async addShopRequest(m, item) { return check(await sb.rpc('add_shop_request', { p_member: m, p_item: item })); },
    async shopRequestBought(m, id) { check(await sb.rpc('shop_request_bought', { p_member: m, p_id: id })); },
    async answerShopRequest(m, id, ok) { check(await sb.rpc('answer_shop_request', { p_member: m, p_id: id, p_ok: ok })); },
    async cancelShopRequest(m, id) { check(await sb.rpc('cancel_shop_request', { p_member: m, p_id: id })); },
    async runRecurring() { return check(await sb.rpc('run_recurring')); },
    async popups(id) { return id ? check(await sb.from('popups').select('*').eq('to_id', id).is('seen_at', null).order('id')) : []; },
    async popupSeen(id, popup) { check(await sb.rpc('popup_seen', { p_member: id, p_id: popup })); },
    async gameQuests(id) { return check(await sb.from('game_quests').select('quest,progress,done').eq('member_id', id).eq('day', reunionDay())); },
    async gameQuest(id, key, amount) { return check(await sb.rpc('game_quest', { p_member: id, p_quest: key, p_amount: Math.floor(amount) })); },
    async questStep(id, step) { return check(await sb.rpc('quest_step', { p_member: id, p_step: step })); },
    onChange(cb) {
      // un canal par table : si l'une pose problème (table absente de la publication…), les autres continuent de marcher
      for (const table of ['tasks', 'products', 'members', 'purchases', 'duels', 'member_stats', 'coin_ledger', 'unlocks', 'task_logs', 'shop_requests', 'xp_log', 'dice_rolls', 'messages', 'perks', 'perk_confirms', 'chip_ledger', 'soap_exchanges', 'farm_plots', 'farm_state', 'farm_stock', 'farm_builds', 'events', 'event_votes', 'expenses', 'expense_shares']) {
        sb.channel('coloc-' + table).on('postgres_changes', { event: '*', schema: 'public', table }, () => cb(table)).subscribe();
      }
    },
    async saveSub(memberId, sub) {
      const row = { endpoint: sub.endpoint, member_id: memberId, sub };
      const up = await sb.from('push_subs').update({ member_id: memberId, sub }).eq('endpoint', sub.endpoint).select('endpoint');
      if (up.error) throw up.error;
      if (!up.data.length) check(await sb.from('push_subs').insert(row));
    },
  };
}
