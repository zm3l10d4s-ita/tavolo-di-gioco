// Finestra "Scegli personaggio" riusabile (incantesimi, equipaggiamento). Nessun dialog nativo.
//   <${PickCharacterModal} open title="Aggiungi a…" onPick=${(ch, extra) => …} onClose=${…} extra=${(ch)=>…} />
import { html, useState } from '../vendor/preact-htm.js';
import { Modal, Empty, SearchBox } from './ui.js';
import { useCollection } from '../lib/hooks.js';
import { norm } from '../lib/util.js';
import { activeCampaign } from '../lib/campaign.js';

function classLine(ch) {
  const cl = (ch.classes || []).map((c) => `${c.name || c.classId || ''} ${c.level || ''}`.trim()).filter(Boolean).join(' / ');
  return [ch.race?.name, cl || null].filter(Boolean).join(' · ') || 'Personaggio';
}

export function PickCharacterModal({ open, title, onPick, onClose, children, note, isDisabled }) {
  const chars = useCollection('characters');
  const [q, setQ] = useState('');
  if (!open) return null;
  const party = new Set(activeCampaign()?.partyIds || []);
  const list = chars.filter((c) => !q || norm(c.name).includes(norm(q)) || norm(c.player).includes(norm(q)))
    .sort((a, b) => (party.has(b.id) - party.has(a.id)) || String(a.name).localeCompare(String(b.name), 'it'));
  return html`<${Modal} open title=${title} onClose=${onClose}>
    ${children}
    ${chars.length > 6 && html`<div style="margin-bottom:10px"><${SearchBox} value=${q} onInput=${setQ} placeholder="Cerca personaggio…" autofocus /></div>`}
    ${!chars.length ? html`<${Empty} title="Nessun personaggio">Crea prima un personaggio in «Schede personaggi».</${Empty}>`
      : html`<div class="pick-list" data-testid="pick-character-list">
        ${list.map((ch) => {
          const dis = isDisabled?.(ch);
          return html`<button class="pick-item" data-testid="pick-character" data-id=${ch.id} disabled=${!!dis} onClick=${() => onPick(ch)}>
            <span class="pick-avatar">${String(ch.name || '?').trim().charAt(0).toUpperCase()}</span>
            <span class="pick-main"><b>${ch.name || 'Senza nome'}</b><small>${classLine(ch)}${ch.player ? ` · ${ch.player}` : ''}</small></span>
            ${party.has(ch.id) && html`<span class="tag accent">nel gruppo</span>`}
            ${dis && html`<span class="tag">${dis}</span>`}
          </button>`;
        })}
      </div>`}
    ${note && html`<p class="faint" style="margin:10px 0 0">${note}</p>`}
  </${Modal}>`;
}
