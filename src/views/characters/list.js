// Elenco dei personaggi: card, filtro per campagna, crea/duplica/elimina.
import { html, useState } from '../../vendor/preact-htm.js';
import { useCollection, useSrd } from '../../lib/hooks.js';
import * as store from '../../lib/store.js';
import { Button, Select, Empty, ConfirmButton, toast } from '../../components/ui.js';
import * as R from '../../lib/rules.js';
import { normalizeCharacter, classLabel, raceLabel, duplicateCharacter, newCharacter } from './logic.js';
import { CreationWizard } from './wizard.js';

let memoCampaign = null; // filtro ricordato durante la sessione dell'app

function CharacterCard({ c, campaigns, equipment, onOpen }) {
  const ch = normalizeCharacter(c);
  const max = R.maxHp(ch);
  const cur = Number(ch.hp.current ?? max);
  const pct = max ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  const camp = campaigns.find((x) => x.id === ch.campaignId);
  const lvl = R.totalLevel(ch);
  return html`<article class="cs-card" data-testid="character-card" data-id=${c.id} onClick=${onOpen} tabIndex="0"
    onKeyDown=${(e) => e.key === 'Enter' && onOpen()}>
    <div class="cs-card-top">
      <div class="cs-card-lvl" title="Livello totale">${lvl || '–'}</div>
      <div class="cs-card-id">
        <h3 class="cs-card-name">${ch.name || 'Senza nome'}</h3>
        <div class="muted cs-card-sub">${[raceLabel(ch), classLabel(ch)].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
    <div class="cs-card-stats">
      <div><span class="faint">CA</span> <b>${R.armorClass(ch, equipment) + (Number(ch.acTemp) || 0)}</b></div>
      <div class="cs-card-hp">
        <span class="faint">PF</span> <b data-testid="card-hp">${cur}/${max}</b>${ch.hp.temp ? html` <span class="tag magic">+${ch.hp.temp}</span>` : ''}
        <div class="cs-hpbar sm"><i style=${`width:${pct}%`} class=${pct <= 25 ? 'low' : pct <= 50 ? 'mid' : ''}></i></div>
      </div>
      <div><span class="faint">Perc.</span> <b>${R.passive(ch, 'perception')}</b></div>
    </div>
    <div class="cs-card-foot" onClick=${(e) => e.stopPropagation()}>
      ${camp ? html`<span class="tag accent">${camp.name}</span>` : html`<span class="tag">Nessuna campagna</span>`}
      ${ch.player && html`<span class="faint cs-small">${ch.player}</span>`}
      <span class="spacer"></span>
      <button class="btn ghost sm" data-testid="duplicate-character" onClick=${() => {
        const d = store.put('characters', duplicateCharacter(c));
        toast(`Duplicato: ${d.name}`, 'good');
      }}>Duplica</button>
      <${ConfirmButton} onConfirm=${() => { store.remove('characters', c.id); toast(`Eliminato: ${ch.name}`); }} confirmText="Elimina?">Elimina</${ConfirmButton}>
    </div>
  </article>`;
}

export function CharacterList({ navigate, openWizard }) {
  const chars = useCollection('characters');
  const campaigns = useCollection('campaigns');
  const { items: equipment } = useSrd('equipment');
  const [camp, setCamp] = useState(memoCampaign ?? '__all');
  const [wizard, setWizard] = useState(!!openWizard);
  const setC = (v) => { memoCampaign = v; setCamp(v); };
  const shown = chars
    .filter((c) => camp === '__all' || (camp === '__none' ? !c.campaignId : c.campaignId === camp))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'it'));
  const options = [
    { value: '__all', label: 'Tutte le campagne' }, { value: '__none', label: 'Senza campagna' },
    ...campaigns.map((x) => ({ value: x.id, label: x.name || 'Campagna' })),
  ];
  const quick = () => {
    const c = store.put('characters', newCharacter({
      campaignId: camp.startsWith('__') ? store.getSetting('activeCampaignId', null) : camp,
      ruleset: store.getSetting('ruleset', '2014'),
    }));
    navigate('characters', c.id);
  };
  return html`<div class="view cs-list-view">
    <div class="view-head">
      <h1>Schede personaggi</h1>
      ${campaigns.length > 0 && html`<${Select} value=${camp} options=${options} onChange=${setC} data-testid="campaign-filter" />`}
      <${Button} onClick=${quick} data-testid="new-blank">Scheda vuota</${Button}>
      <${Button} variant="primary" onClick=${() => setWizard(true)} data-testid="new-character">+ Nuovo personaggio</${Button}>
    </div>
    ${shown.length
      ? html`<div class="cs-cards">${shown.map((c) => html`<${CharacterCard} key=${c.id} c=${c} campaigns=${campaigns} equipment=${equipment}
          onOpen=${() => navigate('characters', c.id)} />`)}</div>`
      : html`<${Empty} title=${chars.length ? 'Nessun personaggio in questa campagna' : 'Ancora nessun personaggio'}>
          Crea un personaggio con la creazione guidata (razza, classe, background, caratteristiche) oppure parti da una scheda vuota.
          ${!chars.length && html`<div class="faint" style="margin-top:8px">Hai già i personaggi su un altro dispositivo? Lì premi <b>Invia</b> in <a href="#/settings">Dati e backup</a>, qui <b>Ricevi e unisci</b>.</div>`}
          <div class="row" style="justify-content:center;margin-top:14px">
            <${Button} variant="primary" onClick=${() => setWizard(true)}>Creazione guidata</${Button}>
          </div>
        </${Empty}>`}
    <${CreationWizard} open=${wizard} onClose=${() => setWizard(false)}
      defaultCampaign=${camp.startsWith('__') ? store.getSetting('activeCampaignId', null) : camp}
      onCreated=${(c) => { setWizard(false); navigate('characters', c.id); }} />
  </div>`;
}
