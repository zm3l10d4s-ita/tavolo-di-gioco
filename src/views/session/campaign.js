// Selettore di campagna e sessione + gestione gruppo. Riusato dal diario.
import { html, useState } from '../../vendor/preact-htm.js';
import { Button, Modal, TextField, Checkbox, ConfirmButton, Empty, toast } from '../../components/ui.js';
import { Icon } from '../../components/icons.js';
import { useCollection, useDoc, useDebouncedCommit } from '../../lib/hooks.js';
import * as store from '../../lib/store.js';
import { totalLevel } from '../../lib/rules.js';
import {
  activeCampaignId, selectCampaign, createCampaign, createSession, closeSession, reopenSession, sessionsOf, activeSessionOf,
} from '../../lib/campaign.js';

/** Hook: campagna selezionata (reattiva su settings e campaigns). */
export function useActiveCampaign() {
  useDoc('settings', 'app');
  useCollection('campaigns');
  const id = activeCampaignId();
  return id ? store.get('campaigns', id) : null;
}

export function NewCampaignForm({ onCreated, compact = false }) {
  const [name, setName] = useState('');
  const go = () => { const c = createCampaign(name.trim() || 'Nuova campagna'); setName(''); onCreated?.(c); toast(`Campagna «${c.name}» creata`, 'good'); };
  return html`<form class="row new-campaign ${compact ? 'compact' : ''}" onSubmit=${(e) => { e.preventDefault(); go(); }}>
    <input class="input" placeholder="Nome della campagna (es. La Miniera Perduta)" value=${name}
      onInput=${(e) => setName(e.currentTarget.value)} data-testid="campaign-name-new" />
    <${Button} type="submit" variant="primary" data-testid="campaign-create"><${Icon} name="plus" size=${16} /> Crea campagna</${Button}>
  </form>`;
}

export function FirstCampaign() {
  return html`<div class="first-campaign">
    <${Empty} title="Benvenuto al tavolo">
      <p>Crea una campagna per raccogliere sessioni, combattimenti, diario e gruppo dei personaggi.</p>
      <${NewCampaignForm} />
    </${Empty}>
  </div>`;
}

/** Modifica nome, descrizione e gruppo (party) della campagna. */
export function CampaignEditor({ campaign }) {
  const chars = useCollection('characters');
  const [, patch] = useDoc('campaigns', campaign.id);
  const [desc, setDesc] = useDebouncedCommit(campaign.description || '', (v) => patch({ description: v }), 300);
  const party = new Set(campaign.partyIds || []);
  const toggle = (id, on) => {
    const ids = (campaign.partyIds || []).filter((x) => x !== id);
    patch({ partyIds: on ? [...ids, id] : ids });
  };
  return html`<div class="col campaign-editor">
    <${TextField} label="Nome" value=${campaign.name} onInput=${(v) => patch({ name: v })} data-testid="campaign-name" />
    <${TextField} label="Descrizione" multiline rows=${4} value=${desc} onInput=${setDesc} placeholder="Ambientazione, premessa, obiettivi del gruppo…" />
    <div class="field">
      <span class="field-label">Gruppo (party)</span>
      ${chars.length ? html`<div class="party-list" data-testid="party-list">
        ${chars.sort((a, b) => String(a.name).localeCompare(String(b.name), 'it')).map((ch) => html`<label class="party-item ${party.has(ch.id) ? 'on' : ''}">
          <input type="checkbox" checked=${party.has(ch.id)} onChange=${(e) => toggle(ch.id, e.currentTarget.checked)} data-testid="party-toggle" data-id=${ch.id} />
          <span><b>${ch.name || 'Senza nome'}</b> <span class="faint">liv. ${totalLevel(ch) || 1}${ch.player ? ` · ${ch.player}` : ''}</span></span>
        </label>`)}
      </div>` : html`<div class="faint">Nessun personaggio: creane uno in «Schede personaggi».</div>`}
    </div>
  </div>`;
}

/** Barra in alto: campagna ▸ sessione, con creazione/chiusura. `viewId`/`setViewId` = sessione visualizzata. */
export function CampaignBar({ campaign, session, onViewSession }) {
  const campaigns = useCollection('campaigns').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  useCollection('sessions');
  const [editOpen, setEditOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const sessions = campaign ? sessionsOf(campaign.id) : [];
  const active = campaign ? activeSessionOf(campaign.id) : null;
  const [, patchSession] = useDoc('sessions', session?.id);

  const onCampaign = (v) => {
    if (v === '__new') { setNewOpen(true); return; }
    selectCampaign(v); onViewSession?.(null);
  };
  const onSession = (v) => {
    if (v === '__new') { const s = createSession(campaign.id); onViewSession?.(s.id); toast(`${s.title} iniziata`, 'good'); return; }
    onViewSession?.(v);
    const s = store.get('sessions', v);
    if (s?.status === 'active') store.setSetting('activeSessionId', v);
  };

  return html`<div class="campaign-bar" data-testid="campaign-bar">
    <div class="cb-group">
      <span class="cb-label">Campagna</span>
      <select class="input cb-select" value=${campaign?.id || ''} onChange=${(e) => onCampaign(e.currentTarget.value)} data-testid="campaign-select">
        ${campaigns.map((c) => html`<option value=${c.id}>${c.name || 'Senza nome'}</option>`)}
        <option value="__new">+ Nuova campagna…</option>
      </select>
      <button class="btn ghost sm" title="Modifica campagna e gruppo" onClick=${() => setEditOpen(true)} data-testid="campaign-edit"><${Icon} name="edit" size=${15} /> Gruppo</button>
    </div>
    <span class="cb-sep"><${Icon} name="next" size=${16} /></span>
    <div class="cb-group">
      <span class="cb-label">Sessione</span>
      <select class="input cb-select" value=${session?.id || ''} onChange=${(e) => onSession(e.currentTarget.value)} data-testid="session-select">
        ${!sessions.length && html`<option value="">— nessuna —</option>`}
        ${sessions.map((s) => html`<option value=${s.id}>${s.title || `Sessione ${s.number}`}${s.status === 'active' ? ' • in corso' : ''}</option>`)}
        <option value="__new">+ Nuova sessione</option>
      </select>
      ${session && html`<input class="input cb-title" value=${session.title} title="Titolo della sessione"
          onInput=${(e) => patchSession({ title: e.currentTarget.value })} data-testid="session-title" />
        <input class="input cb-date" type="date" value=${session.date || ''} title="Data" onInput=${(e) => patchSession({ date: e.currentTarget.value })} data-testid="session-date" />`}
    </div>
    <span class="spacer"></span>
    ${session && session.status === 'active'
      ? html`<${ConfirmButton} variant="" size="sm" confirmText="Chiudere la sessione?" onConfirm=${() => { closeSession(session.id); toast('Sessione chiusa'); }}>Chiudi sessione</${ConfirmButton}>`
      : session ? html`<span class="tag">chiusa</span><${Button} size="sm" onClick=${() => reopenSession(session.id)} data-testid="session-reopen">Riapri</${Button}>` : null}
    ${!active && html`<${Button} variant="primary" size="sm" onClick=${() => { const s = createSession(campaign.id); onViewSession?.(s.id); }} data-testid="session-new"><${Icon} name="plus" size=${15} /> Nuova sessione</${Button}>`}

    <${Modal} open=${editOpen} title="Campagna e gruppo" onClose=${() => setEditOpen(false)}>
      ${campaign && html`<${CampaignEditor} campaign=${campaign} />`}
    </${Modal}>
    <${Modal} open=${newOpen} title="Nuova campagna" onClose=${() => setNewOpen(false)}>
      <${NewCampaignForm} onCreated=${() => { setNewOpen(false); onViewSession?.(null); }} />
    </${Modal}>
  </div>`;
}
