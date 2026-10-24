// Sezione "Diario campagna": voci di diario, note fissate, incontri preparati, gestione campagna.
// Route: #/journal/<voceId> · #/journal/notes · #/journal/encounters/<id> · #/journal/campaign
import { html } from '../../vendor/preact-htm.js';
import { Tabs, Button } from '../../components/ui.js';
import { Icon } from '../../components/icons.js';
import { useCollection } from '../../lib/hooks.js';
import { selectCampaign, sessionsOf } from '../../lib/campaign.js';
import { useActiveCampaign, FirstCampaign, CampaignEditor, NewCampaignForm } from '../session/campaign.js';
import { JournalEntries } from './entries.js';
import { CampaignNotes } from './notes.js';
import { Encounters } from './encounters.js';

const TABS = [
  { id: 'entries', label: 'Diario' }, { id: 'notes', label: 'Note' }, { id: 'encounters', label: 'Incontri' }, { id: 'campaign', label: 'Campagna' },
];

function CampaignTab({ campaign, navigate }) {
  useCollection('sessions');
  const sessions = sessionsOf(campaign.id);
  return html`<div class="jr-campaign">
    <section class="panel"><header class="panel-head"><h3>Campagna e gruppo</h3></header><div class="panel-body"><${CampaignEditor} campaign=${campaign} /></div></section>
    <section class="panel"><header class="panel-head"><h3>Sessioni</h3></header><div class="panel-body">
      ${sessions.length ? html`<table class="table"><thead><tr><th>#</th><th>Titolo</th><th>Data</th><th>Stato</th><th>Log</th></tr></thead><tbody>
        ${sessions.map((s) => html`<tr><td>${s.number}</td><td>${s.title}</td><td>${s.date || '—'}</td>
          <td>${s.status === 'active' ? html`<span class="tag accent">in corso</span>` : html`<span class="tag">chiusa</span>`}</td><td>${(s.log || []).length}</td></tr>`)}
      </tbody></table>` : html`<div class="faint">Nessuna sessione.</div>`}
      <div class="row" style="margin-top:10px"><${Button} size="sm" onClick=${() => navigate('session')}><${Icon} name="swords" size=${14} /> Vai alla sessione</${Button}></div>
    </div></section>
    <section class="panel"><header class="panel-head"><h3>Nuova campagna</h3></header><div class="panel-body"><${NewCampaignForm} compact /></div></section>
  </div>`;
}

export default function JournalView({ params = [], navigate }) {
  const campaign = useActiveCampaign();
  const campaigns = useCollection('campaigns').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const p0 = params[0];
  const tab = p0 === 'notes' ? 'notes' : p0 === 'encounters' ? 'encounters' : p0 === 'campaign' ? 'campaign' : 'entries';
  if (!campaign) return html`<div class="view"><div class="view-head"><h1>Diario campagna</h1></div><${FirstCampaign} /></div>`;
  return html`<div class="view jr-view" data-testid="journal-view">
    <div class="view-head">
      <h1>Diario</h1>
      <select class="input jr-campaign-select" value=${campaign.id} onChange=${(e) => { selectCampaign(e.currentTarget.value); navigate('journal', tab === 'entries' ? '' : tab); }} data-testid="journal-campaign">
        ${campaigns.map((c) => html`<option value=${c.id}>${c.name}</option>`)}
      </select>
    </div>
    <${Tabs} tabs=${TABS} active=${tab} onChange=${(t) => (t === 'entries' ? navigate('journal') : navigate('journal', t))} />
    ${tab === 'entries' && html`<${JournalEntries} campaign=${campaign} entryId=${p0 || null} navigate=${navigate} />`}
    ${tab === 'notes' && html`<${CampaignNotes} campaign=${campaign} />`}
    ${tab === 'encounters' && html`<${Encounters} campaign=${campaign} encounterId=${params[1] || null} navigate=${navigate} />`}
    ${tab === 'campaign' && html`<${CampaignTab} campaign=${campaign} navigate=${navigate} />`}
  </div>`;
}
