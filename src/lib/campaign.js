// Campagne, sessioni e log di sessione (legati allo store). Usato da sessione, diario, sidebar e listener dei tiri.
// Regole: una sola sessione 'active' per campagna; settings.activeCampaignId / settings.activeSessionId puntano
// alla campagna e alla sessione in corso (compatibile con getActiveSession() di src/lib/combat.js).
import * as store from './store.js';
import { nowIso } from './util.js';
import { emptyCombat, logEntry, formatRoll } from './session-core.js';

export function activeCampaignId() {
  const id = store.getSetting('activeCampaignId', null);
  if (id && store.get('campaigns', id)) return id;
  const first = store.list('campaigns').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
  return first?.id || null;
}
export function activeCampaign() { const id = activeCampaignId(); return id ? store.get('campaigns', id) : null; }

export function sessionsOf(campaignId) {
  return store.list('sessions', (s) => (s.campaignId || null) === (campaignId || null))
    .sort((a, b) => (Number(b.number) || 0) - (Number(a.number) || 0));
}

/** Sessione 'active' della campagna (preferendo settings.activeSessionId). */
export function activeSessionOf(campaignId) {
  const pref = store.getSetting('activeSessionId', null);
  const p = pref ? store.get('sessions', pref) : null;
  if (p && p.status === 'active' && (p.campaignId || null) === (campaignId || null)) return p;
  const c = campaignId ? store.get('campaigns', campaignId) : null;
  const viaCampaign = c?.activeSessionId ? store.get('sessions', c.activeSessionId) : null;
  if (viaCampaign && viaCampaign.status === 'active') return viaCampaign;
  return sessionsOf(campaignId).find((s) => s.status === 'active') || null;
}

/** Sessione in corso per i listener globali (tiri dalla scheda personaggio, sidebar). */
export function currentSession() {
  const pref = store.getSetting('activeSessionId', null);
  const p = pref ? store.get('sessions', pref) : null;
  if (p && p.status === 'active') return p;
  return activeSessionOf(activeCampaignId());
}

export function selectCampaign(id) {
  store.setSetting('activeCampaignId', id);
  const s = id ? activeSessionOf(id) : null;
  store.setSetting('activeSessionId', s?.id || null);
}

export function createCampaign(name = 'Nuova campagna') {
  const c = store.put('campaigns', { name, description: '', partyIds: [], activeSessionId: null });
  // Adotta le sessioni orfane (create ad es. dal bestiario prima che esistesse una campagna).
  for (const s of store.list('sessions', (x) => !x.campaignId)) store.update('sessions', s.id, { campaignId: c.id });
  const orphanActive = sessionsOf(c.id).find((s) => s.status === 'active');
  if (orphanActive) store.update('campaigns', c.id, { activeSessionId: orphanActive.id });
  selectCampaign(c.id);
  return c;
}

/** Crea "Sessione N" (data odierna) come sessione attiva della campagna; chiude l'eventuale attiva precedente. */
export function createSession(campaignId, { title, date } = {}) {
  const prev = activeSessionOf(campaignId);
  if (prev) closeSession(prev.id, { silent: true });
  const number = sessionsOf(campaignId).reduce((mx, s) => Math.max(mx, Number(s.number) || 0), 0) + 1;
  const s = store.put('sessions', {
    campaignId, number, title: title || `Sessione ${number}`, date: date || nowIso().slice(0, 10), status: 'active',
    log: [logEntry('system', `Sessione ${number} iniziata.`)], combat: emptyCombat(),
  });
  if (campaignId) store.update('campaigns', campaignId, { activeSessionId: s.id });
  store.setSetting('activeSessionId', s.id);
  return s;
}

export function closeSession(id, { silent = false } = {}) {
  const s = store.get('sessions', id);
  if (!s) return;
  store.update('sessions', id, (x) => ({ ...x, status: 'closed', closedAt: nowIso(), log: [...(x.log || []), logEntry('system', 'Sessione chiusa.')] }));
  if (s.campaignId) {
    const c = store.get('campaigns', s.campaignId);
    if (c?.activeSessionId === id) store.update('campaigns', c.id, { activeSessionId: null });
  }
  if (!silent && store.getSetting('activeSessionId', null) === id) store.setSetting('activeSessionId', null);
}

/** Riapre una sessione chiusa (chiudendo l'altra eventualmente attiva nella stessa campagna). */
export function reopenSession(id) {
  const s = store.get('sessions', id);
  if (!s) return;
  const prev = activeSessionOf(s.campaignId);
  if (prev && prev.id !== id) closeSession(prev.id, { silent: true });
  store.update('sessions', id, (x) => ({ ...x, status: 'active', log: [...(x.log || []), logEntry('system', 'Sessione riaperta.')] }));
  if (s.campaignId) store.update('campaigns', s.campaignId, { activeSessionId: id });
  store.setSetting('activeSessionId', id);
}

/** Aggiunge una voce al log della sessione. */
export function appendLog(sessionId, type, text, extra) {
  if (!sessionId || !store.get('sessions', sessionId)) return null;
  const e = logEntry(type, text, extra);
  store.update('sessions', sessionId, (s) => ({ ...s, log: [...(s.log || []), e] }));
  return e;
}
export function logToCurrent(type, text, extra) {
  const s = currentSession();
  return s ? appendLog(s.id, type, text, extra) : null;
}

/**
 * Ascolta i tiri emessi dalla scheda personaggio (`window.dispatchEvent(new CustomEvent('dnd:roll', { detail: { characterId, label, result } }))`)
 * e li registra nel log della sessione in corso. Ritorna la funzione di rimozione.
 */
export function installRollListener() {
  const on = (e) => {
    const d = e?.detail || {};
    const ch = d.characterId ? store.get('characters', d.characterId) : null;
    const label = [ch?.name, d.label].filter(Boolean).join(' — ');
    logToCurrent('roll', formatRoll(label, d.result), d.characterId ? { characterId: d.characterId } : undefined);
  };
  window.addEventListener('dnd:roll', on);
  return () => window.removeEventListener('dnd:roll', on);
}
