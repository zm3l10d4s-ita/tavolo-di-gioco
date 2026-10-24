// Funzioni condivise per il combattimento (create dall'Agente 3, estendibili dall'Agente 5).
// Rispetta lo schema `sessions.combat` di CONTRACTS.md.
import * as store from './store.js';
import { uid, nowIso } from './util.js';

export const abilityMod = (score) => Math.floor(((Number(score) || 10) - 10) / 2);

const emptyCombat = () => ({ active: false, round: 1, turnIndex: 0, combatants: [] });

/** Sessione attiva: preferisce `settings.activeSessionId` se è ancora 'active', altrimenti la più recente con status 'active'. */
export function getActiveSession() {
  const preferred = store.getSetting('activeSessionId', null);
  const p = preferred ? store.get('sessions', preferred) : null;
  if (p && p.status === 'active') return p;
  const act = store.list('sessions', (s) => s.status === 'active')
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return act[0] || null;
}

/** Ritorna la sessione attiva o ne crea una nuova (e la imposta come attiva). */
export function ensureActiveSession() {
  const cur = getActiveSession();
  if (cur) {
    if (!cur.combat) return store.update('sessions', cur.id, { combat: emptyCombat() });
    return cur;
  }
  const campaignId = store.getSetting('activeCampaignId', null);
  const sameCampaign = store.list('sessions', (s) => (s.campaignId || null) === campaignId);
  const number = sameCampaign.reduce((mx, s) => Math.max(mx, Number(s.number) || 0), 0) + 1;
  const s = store.put('sessions', {
    campaignId, number, title: `Sessione ${number}`, date: nowIso().slice(0, 10), status: 'active',
    log: [{ id: uid(), t: nowIso(), type: 'system', text: 'Sessione creata dal bestiario.' }],
    combat: emptyCombat(),
  });
  store.setSetting('activeSessionId', s.id);
  return s;
}

/** Crea un combattente da un mostro (schema CONTRACTS). `name` già numerato. */
export function monsterToCombatant(monster, name) {
  const hp = Number(monster.hp) || 1;
  return {
    id: uid(), kind: 'monster', refId: monster.id, name: name || monster.name,
    initiative: null, initBonus: abilityMod(monster.abilities?.dex),
    hp, maxHp: hp, tempHp: 0, ac: Number(monster.ac) || 10,
    conditions: [], notes: '', hidden: false,
  };
}

/** Prossimo numero libero per "Nome N" tra i combattenti esistenti. */
function nextIndex(combatants, base) {
  const re = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' (\\d+)$');
  return combatants.reduce((mx, c) => { const m = String(c.name).match(re); return m ? Math.max(mx, Number(m[1])) : mx; }, 0) + 1;
}

/**
 * Aggiunge `count` copie del mostro al combattimento della sessione attiva (creandola se manca).
 * Nomi numerati ("Goblin 1", "Goblin 2"…), PF = PF medi, iniziativa da tirare (null).
 * Ritorna la sessione aggiornata.
 */
export function addMonsterToActiveCombat(monster, count = 1) {
  if (!monster) throw new Error('addMonsterToActiveCombat: mostro mancante');
  const n = Math.max(1, Math.min(50, Math.floor(Number(count) || 1)));
  const session = ensureActiveSession();
  return store.update('sessions', session.id, (s) => {
    const combat = { ...emptyCombat(), ...(s.combat || {}) };
    const list = [...(combat.combatants || [])];
    let i = nextIndex(list, monster.name);
    const added = [];
    for (let k = 0; k < n; k++) { const c = monsterToCombatant(monster, `${monster.name} ${i++}`); list.push(c); added.push(c.name); }
    combat.combatants = list;
    const log = [...(s.log || []), {
      id: uid(), t: nowIso(), type: 'combat',
      text: `Aggiunt${n > 1 ? 'i' : 'o'} al combattimento: ${added.join(', ')} (CA ${Number(monster.ac) || 10}, PF ${Number(monster.hp) || 1}).`,
    }];
    return { ...s, combat, log };
  });
}
