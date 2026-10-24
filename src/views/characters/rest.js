// Modali dei riposi: breve (spesa dei dadi vita + risorse rb + slot del patto) e lungo (riepilogo prima/dopo).
import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { Modal, Button, toast } from '../../components/ui.js';
import * as R from '../../lib/rules.js';
import { signed } from '../../lib/util.js';
import { hitDiceState, spendHitDie, shortRest, longRest } from './logic.js';
import { emitRoll } from './api.js';

function Summary({ items }) {
  return html`<ul class="cs-rest-summary" data-testid="rest-summary">${items.map((s) => html`<li>✓ ${s}</li>`)}</ul>`;
}

export function ShortRestModal({ open, onClose, c, mutate, data }) {
  const [log, setLog] = useState([]);
  const [done, setDone] = useState(null);
  useEffect(() => { if (open) { setLog([]); setDone(null); } }, [open]);
  if (!open) return null;
  const hd = hitDiceState(c);
  const con = R.abilityModOf(c, 'con');
  const max = R.maxHp(c);
  const spend = (die) => {
    let r;
    mutate((d) => { r = spendHitDie(d, die); return r.character; });
    if (!r.ok) return;
    const text = `${die}: ${r.rolled} ${signed(con)} = +${r.healed} PF`;
    setLog((l) => [...l, text]);
    emitRoll(c.id, `Dado vita ${die}`, { kind: 'hitdie', total: r.rolled + con, text: `${c.name} spende un dado vita: ${text}` });
  };
  const finish = () => {
    let s;
    mutate((d) => { const r = shortRest(d, data.classes); s = r.summary; return r.character; });
    const all = [...(log.length ? [`Dadi vita spesi: ${log.length}`] : []), ...s];
    setDone(all);
    toast('Riposo breve — ' + all.join(' · '), 'good');
  };
  return html`<${Modal} open=${open} title="Riposo breve" onClose=${onClose}>
    <div class="cs-rest" data-testid="short-rest-modal">
      ${done ? html`<${Summary} items=${done} /><div class="row"><span class="spacer"></span><${Button} variant="primary" onClick=${onClose} data-testid="rest-close">Chiudi</${Button}></div>` : html`
        <p class="muted">Almeno 1 ora di riposo. Spendi dadi vita per recuperare PF (dado + COS ${signed(con)}), poi concludi per ripristinare le risorse a riposo breve e gli slot del patto.</p>
        <div class="cs-rest-hp">PF <b data-testid="rest-hp">${c.hp.current}</b> / ${max}</div>
        <div class="cs-rest-dice">
          ${Object.entries(hd).map(([die, s]) => html`<div class="row">
            <b>${die}</b><span class="muted">${s.left}/${s.total} disponibili</span>
            <${Button} size="sm" disabled=${s.left <= 0 || c.hp.current >= max} onClick=${() => spend(die)} data-testid=${'spend-' + die}>Spendi 1${die}</${Button}>
          </div>`)}
          ${!Object.keys(hd).length && html`<span class="faint">Nessun dado vita (nessuna classe).</span>`}
        </div>
        ${log.length > 0 && html`<ul class="cs-rest-log">${log.map((l) => html`<li>🎲 ${l}</li>`)}</ul>`}
        <div class="cs-rest-list faint cs-small">Si ripristinano: ${[...c.resources.filter((r) => r.recovery === 'short' && r.used).map((r) => r.name), c.spellcasting.pact.used ? 'slot del patto' : null].filter(Boolean).join(', ') || 'nessuna risorsa spesa'}</div>
        <div class="row"><span class="spacer"></span>
          <${Button} variant="ghost" onClick=${onClose}>Annulla</${Button}>
          <${Button} variant="primary" onClick=${finish} data-testid="short-rest-confirm">Concludi riposo breve</${Button}></div>`}
    </div>
  </${Modal}>`;
}

export function LongRestModal({ open, onClose, c, mutate, data }) {
  const [done, setDone] = useState(null);
  useEffect(() => { if (open) setDone(null); }, [open]);
  if (!open) return null;
  const preview = longRest(c, data.classes).summary;
  const confirm = () => {
    let s;
    mutate((d) => { const r = longRest(d, data.classes); s = r.summary; return r.character; });
    setDone(s);
    toast('Riposo lungo — ' + s.join(' · '), 'good');
  };
  return html`<${Modal} open=${open} title="Riposo lungo" onClose=${onClose}>
    <div class="cs-rest" data-testid="long-rest-modal">
      ${done ? html`<${Summary} items=${done} /><div class="row"><span class="spacer"></span><${Button} variant="primary" onClick=${onClose} data-testid="rest-close">Chiudi</${Button}></div>` : html`
        <p class="muted">Almeno 8 ore. Verrà applicato:</p>
        <ul class="cs-rest-summary">${preview.map((s) => html`<li>${s}</li>`)}</ul>
        <p class="faint cs-small">Le risorse «alba» si ripristinano con il pulsante ☀ Alba.</p>
        <div class="row"><span class="spacer"></span>
          <${Button} variant="ghost" onClick=${onClose}>Annulla</${Button}>
          <${Button} variant="primary" onClick=${confirm} data-testid="long-rest-confirm">Conferma riposo lungo</${Button}></div>`}
    </div>
  </${Modal}>`;
}
