// Sezione "Sessione attiva": campagna/sessione, combat tracker, dettaglio combattente, log e tiradadi.
// Route: #/session
import { html, useState, useEffect, useMemo } from '../../vendor/preact-htm.js';
import { useCollection, useDoc, useSrd } from '../../lib/hooks.js';
import * as store from '../../lib/store.js';
import { activeSessionOf, createSession } from '../../lib/campaign.js';
import { Button, Empty } from '../../components/ui.js';
import { Icon } from '../../components/icons.js';
import { CampaignBar, FirstCampaign, useActiveCampaign } from './campaign.js';
import { Tracker } from './tracker.js';
import { CombatantDetail, statblockRollText } from './detail.js';
import { SessionLog } from './log.js';
import { syncPcs, next, prev, logRoll } from './actions.js';
import { apiReady } from './pc.js';

let memoView = null; // sessione visualizzata (anche chiusa), ricordata durante l'esecuzione

export default function SessionView({ navigate }) {
  const campaign = useActiveCampaign();
  useCollection('sessions');
  useCollection('characters');
  useDoc('settings', 'app');
  const [, force] = useState(0);
  useEffect(() => { apiReady.then(() => force((x) => x + 1)); }, []);
  const { items: monsters } = useSrd('monsters');
  const { items: equipment } = useSrd('equipment');
  const { items: conditions } = useSrd('conditions');
  const monstersById = useMemo(() => new Map(monsters.map((m) => [m.id, m])), [monsters]);
  const [viewId, setViewState] = useState(memoView);
  const setViewId = (id) => { memoView = id; setViewState(id); };
  const [selectedId, setSelectedId] = useState(null);

  let session = viewId ? store.get('sessions', viewId) : null;
  if (session && campaign && (session.campaignId || null) !== campaign.id) session = null;
  if (!session && campaign) session = activeSessionOf(campaign.id) || null;
  const readonly = !session || session.status !== 'active';
  const combat = session ? syncPcs(session.combat, equipment) : null;
  const current = combat?.active ? combat.combatants[combat.turnIndex] : null;

  // Il dettaglio segue il turno corrente quando avanza.
  useEffect(() => { if (current) setSelectedId(current.id); }, [current?.id, combat?.round]);

  // Scorciatoie: Alt+→ / Alt+← per i turni.
  useEffect(() => {
    const k = (e) => {
      if (!e.altKey || !session || readonly || !combat?.active) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); next(session.id, equipment); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(session.id, equipment); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [session?.id, readonly, combat?.active, equipment]);

  if (!campaign) return html`<div class="view ses-view"><div class="view-head"><h1>Sessione attiva</h1></div><${FirstCampaign} /></div>`;

  const selected = combat?.combatants.find((c) => c.id === selectedId) || null;
  const monster = selected?.kind === 'monster' ? monstersById.get(selected.refId) : null;
  const onRoll = (r) => { if (session && !readonly) logRoll(session.id, statblockRollText(r)); };

  return html`<div class="view ses-view" data-testid="session-view">
    <${CampaignBar} campaign=${campaign} session=${session} onViewSession=${setViewId} />
    ${!session ? html`<div class="ses-empty"><${Empty} title="Nessuna sessione in corso">
        <p>Inizia una nuova sessione di «${campaign.name}» per usare il combat tracker e il log.</p>
        <${Button} variant="primary" size="lg" onClick=${() => setViewId(createSession(campaign.id).id)} data-testid="session-start"><${Icon} name="plus" size=${17} /> Nuova sessione</${Button}>
      </${Empty}></div>`
    : html`<div class="ses-layout">
      <div class="ses-main">
        ${readonly && html`<div class="ses-closed-note"><${Icon} name="clock" size=${15} /> Sessione chiusa: sola lettura. Usa «Riapri» per modificarla.</div>`}
        <${Tracker} session=${session} combat=${combat} eq=${equipment} monsters=${monsters} monstersById=${monstersById}
          selectedId=${selectedId} onSelect=${setSelectedId} readonly=${readonly} campaign=${campaign} />
      </div>
      <div class="ses-side">
        <section class="panel ses-detail">
          <${CombatantDetail} key=${selected?.id || 'none'} c=${selected} sid=${session.id} eq=${equipment} monster=${monster} conditions=${conditions}
            readonly=${readonly} navigate=${navigate} onRoll=${onRoll} />
        </section>
        <${SessionLog} session=${session} readonly=${readonly} />
      </div>
    </div>`}
  </div>`;
}
