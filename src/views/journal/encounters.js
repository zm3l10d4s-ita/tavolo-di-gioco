// Incontri preparati (collezione encounters): mostri + quantità, budget PE 2024 rispetto al gruppo, avvio nel combat tracker.
import { html, useMemo, useEffect } from '../../vendor/preact-htm.js';
import { Button, ConfirmButton, Empty, toast } from '../../components/ui.js';
import { Icon } from '../../components/icons.js';
import { useCollection, useDoc, useSrd, useDebouncedCommit } from '../../lib/hooks.js';
import * as store from '../../lib/store.js';
import { totalLevel } from '../../lib/rules.js';
import { encounterBudget, encounterDifficulty, encounterXp, DIFFICULTY_LABEL } from '../../lib/session-core.js';
import { activeSessionOf, createSession, appendLog } from '../../lib/campaign.js';
import { MonsterQuickAdd } from '../session/tracker.js';
import * as A from '../session/actions.js';

const ENVIRONMENTS = ['Artico', 'Collina', 'Costa', 'Deserto', 'Foresta', 'Montagna', 'Palude', 'Prateria', 'Sottosuolo', 'Subacqueo', 'Urbano', 'Dungeon'];

function partyLevels(campaign) {
  return (campaign.partyIds || []).map((id) => store.get('characters', id)).filter(Boolean).map((c) => Math.max(1, totalLevel(c)));
}

function Budget({ xp, levels }) {
  const b = encounterBudget(levels);
  const d = encounterDifficulty(xp, b);
  const max = Math.max(b.high * 1.25, xp, 1);
  const pct = (v) => `${Math.min(100, (v / max) * 100)}%`;
  return html`<div class="enc-budget" data-testid="encounter-budget" data-difficulty=${d}>
    <div class="enc-budget-head">
      <div><span class="field-label">PE dell'incontro</span><b data-testid="encounter-xp">${xp.toLocaleString('it-IT')}</b></div>
      <div><span class="field-label">Difficoltà (SRD 5.2)</span><b class="diff diff-${d}" data-testid="encounter-difficulty">${DIFFICULTY_LABEL[d]}</b></div>
    </div>
    ${levels.length ? html`
      <div class="enc-bar"><span class="enc-fill diff-${d}" style=${`width:${pct(xp)}`}></span>
        ${['low', 'moderate', 'high'].map((k) => html`<i class="enc-mark" style=${`left:${pct(b[k])}`} title=${`${k}: ${b[k]}`}></i>`)}</div>
      <div class="enc-legend">
        <span>Bassa <b>${b.low.toLocaleString('it-IT')}</b></span><span>Moderata <b>${b.moderate.toLocaleString('it-IT')}</b></span><span>Alta <b>${b.high.toLocaleString('it-IT')}</b></span>
        <span class="faint">Gruppo: ${levels.length} PG (liv. ${levels.join(', ')})</span>
      </div>` : html`<div class="faint">Aggiungi personaggi al gruppo della campagna per calcolare il budget.</div>`}
  </div>`;
}

function EncounterEditor({ enc, campaign, monsters, byId, navigate }) {
  const [, patch] = useDoc('encounters', enc.id);
  const [notes, setNotes] = useDebouncedCommit(enc.notes || '', (v) => patch({ notes: v }), 400);
  useCollection('characters');
  const list = enc.monsters || [];
  const xp = encounterXp(list, byId);
  const levels = partyLevels(campaign);
  const add = (m, n) => {
    const ex = list.find((x) => x.monsterId === m.id);
    patch({ monsters: ex ? list.map((x) => (x.monsterId === m.id ? { ...x, count: x.count + n } : x)) : [...list, { monsterId: m.id, count: n }] });
  };
  const setCount = (id, c) => patch({ monsters: c <= 0 ? list.filter((x) => x.monsterId !== id) : list.map((x) => (x.monsterId === id ? { ...x, count: c } : x)) });
  const launch = () => {
    let s = activeSessionOf(campaign.id);
    if (!s) s = createSession(campaign.id);
    const party = (campaign.partyIds || []).map((id) => store.get('characters', id)).filter(Boolean);
    if (party.length) A.addPcs(s.id, party);
    for (const x of list) { const m = byId(x.monsterId); if (m && x.count > 0) A.addMonsters(s.id, m, x.count); }
    appendLog(s.id, 'combat', `Incontro preparato caricato: ${enc.name}.`);
    toast(`«${enc.name}» caricato nel combat tracker`, 'good');
    navigate('session');
  };
  return html`<div class="enc-editor" data-testid="encounter-editor" data-id=${enc.id}>
    <div class="enc-head">
      <input class="jr-title" value=${enc.name} onInput=${(e) => patch({ name: e.currentTarget.value })} placeholder="Nome dell'incontro" data-testid="encounter-name" />
      <label class="field enc-env"><span class="field-label">Ambiente</span>
        <input class="input" list="enc-envs" value=${enc.environment || ''} onInput=${(e) => patch({ environment: e.currentTarget.value })} placeholder="es. Foresta" />
        <datalist id="enc-envs">${ENVIRONMENTS.map((e) => html`<option value=${e} />`)}</datalist></label>
    </div>
    <${Budget} xp=${xp} levels=${levels} />
    <div class="enc-monsters">
      <div class="row"><span class="field-label">Mostri</span><span class="spacer"></span></div>
      <${MonsterQuickAdd} monsters=${monsters} onAdd=${add} />
      ${list.length ? html`<table class="table enc-table"><thead><tr><th>Creatura</th><th>GS</th><th>PE</th><th>Quantità</th><th>Totale</th></tr></thead><tbody>
        ${list.map((x) => { const m = byId(x.monsterId); return html`<tr data-testid="encounter-monster" data-id=${x.monsterId}>
          <td><a href=${'#/bestiary/' + encodeURIComponent(x.monsterId)}>${m?.name || x.monsterId}</a></td><td>${m?.cr ?? '—'}</td><td>${m?.xp ?? 0}</td>
          <td><span class="num-wrap"><button class="btn ghost sm" onClick=${() => setCount(x.monsterId, x.count - 1)}>−</button><b class="enc-count">${x.count}</b><button class="btn ghost sm" onClick=${() => setCount(x.monsterId, x.count + 1)}>+</button></span></td>
          <td>${((m?.xp || 0) * x.count).toLocaleString('it-IT')}</td></tr>`; })}
      </tbody></table>` : html`<div class="faint enc-none">Nessun mostro: cercane uno qui sopra.</div>`}
    </div>
    <label class="field"><span class="field-label">Note (tattiche, terreno, tesoro)</span>
      <textarea class="input" rows="4" value=${notes} onInput=${(e) => setNotes(e.currentTarget.value)}></textarea></label>
    <div class="row">
      <${ConfirmButton} confirmText="Eliminare l'incontro?" onConfirm=${() => { store.remove('encounters', enc.id); navigate('journal', 'encounters'); }}><${Icon} name="trash" size=${14} /> Elimina</${ConfirmButton}>
      <span class="spacer"></span>
      <${Button} variant="primary" size="lg" disabled=${!list.length} onClick=${launch} data-testid="encounter-launch"><${Icon} name="swords" size=${17} /> Avvia nel combat tracker</${Button}>
    </div>
  </div>`;
}

export function Encounters({ campaign, encounterId, navigate }) {
  const encs = useCollection('encounters', (e) => e.campaignId === campaign.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const { items: monsters } = useSrd('monsters');
  const byIdMap = useMemo(() => new Map(monsters.map((m) => [m.id, m])), [monsters]);
  const byId = (id) => byIdMap.get(id);
  const levels = partyLevels(campaign);
  const selected = encounterId ? encs.find((e) => e.id === encounterId) : null;
  useEffect(() => { if (!encounterId && encs.length) location.replace('#/journal/encounters/' + encodeURIComponent(encs[0].id)); }, [encounterId, encs.length > 0]);
  const create = () => { const e = store.put('encounters', { campaignId: campaign.id, name: 'Nuovo incontro', environment: '', monsters: [], notes: '' }); navigate('journal', 'encounters', e.id); };
  return html`<div class="jr-layout">
    <section class="panel jr-side">
      <div class="row jr-actions"><${Button} variant="primary" size="sm" onClick=${create} data-testid="encounter-new"><${Icon} name="plus" size=${15} /> Nuovo incontro</${Button}></div>
      <div class="jr-list">
        ${encs.map((e) => { const xp = encounterXp(e.monsters, byId); const d = encounterDifficulty(xp, encounterBudget(levels));
          return html`<button class="jr-item ${e.id === encounterId ? 'selected' : ''}" onClick=${() => navigate('journal', 'encounters', e.id)} data-testid="encounter-item">
            <b>${e.name || 'Senza nome'}</b>
            <span class="jr-snip">${(e.monsters || []).map((x) => `${x.count}× ${byId(x.monsterId)?.name || x.monsterId}`).join(', ') || 'nessun mostro'}</span>
            <span class="jr-tagrow">${e.environment && html`<span class="tag">${e.environment}</span>`}<span class="tag diff-${d}">${DIFFICULTY_LABEL[d]} · ${xp} PE</span></span>
          </button>`; })}
        ${!encs.length && html`<div class="jr-empty faint">Nessun incontro preparato.</div>`}
      </div>
    </section>
    <section class="jr-main">
      ${selected ? html`<${EncounterEditor} key=${selected.id} enc=${selected} campaign=${campaign} monsters=${monsters} byId=${byId} navigate=${navigate} />`
        : html`<${Empty} title="Incontri preparati">Prepara gli incontri in anticipo: il budget PE (SRD 5.2) si calcola sul gruppo della campagna.</${Empty}>`}
    </section>
  </div>`;
}
