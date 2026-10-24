// Log di sessione: inserimento rapido di note, tiradadi, filtro per tipo.
import { html, useState } from '../../vendor/preact-htm.js';
import { toast } from '../../components/ui.js';
import { Icon } from '../../components/icons.js';
import { roll } from '../../lib/util.js';
import { LOG_TYPES, LOG_TYPE_LABEL, formatRoll, timeOf } from '../../lib/session-core.js';
import * as A from './actions.js';

let memoFilter = 'all';
const DICE = [4, 6, 8, 10, 12, 20, 100];

export function DiceRoller({ sid, readonly }) {
  const [expr, setExpr] = useState('');
  const [last, setLast] = useState(null);
  const doRoll = (e) => {
    const x = String(e || '').trim();
    if (!/^[\dd+\-\s khl]+$/i.test(x) || !/\d*d\d+|\d/.test(x)) { toast('Espressione non valida (es. 2d6+3)', 'bad'); return; }
    const r = roll(x);
    if (!r.rolls.length && !/\d/.test(x)) return;
    const text = formatRoll('Tiro', r);
    setLast({ expr: x, r });
    if (sid && !readonly) A.logRoll(sid, text);
    const d20 = r.rolls[0]?.die === '1d20' ? r.rolls[0].results[0] : null;
    toast(html`<div><b>${x}</b> → ${r.rolls.map((q) => `[${q.results.join(', ')}]`).join(' ')} = <b style="font-size:1.25em">${r.total}</b></div>`, d20 === 20 ? 'good' : d20 === 1 ? 'bad' : '');
  };
  return html`<div class="dice" data-testid="dice-roller">
    <form class="dice-expr" onSubmit=${(e) => { e.preventDefault(); doRoll(expr); }}>
      <input class="input" placeholder="2d6+3" value=${expr} onInput=${(e) => setExpr(e.currentTarget.value)} data-testid="dice-expr" />
      <button class="btn primary" type="submit" data-testid="dice-roll"><${Icon} name="d20" size=${16} /> Tira</button>
    </form>
    <div class="dice-btns">
      ${DICE.map((d) => html`<button class="btn sm dice-btn" onClick=${() => doRoll('1d' + d)} data-testid=${'die-d' + d}>d${d}</button>`)}
    </div>
    ${last && html`<div class="dice-last" data-testid="dice-last" title=${last.expr}><span class="faint">${last.expr}</span><b>${last.r.total}</b></div>`}
  </div>`;
}

export function SessionLog({ session, readonly }) {
  const [filter, setFilterState] = useState(memoFilter);
  const setFilter = (f) => { memoFilter = f; setFilterState(f); };
  const [note, setNote] = useState('');
  const log = session.log || [];
  const shown = log.filter((e) => filter === 'all' || e.type === filter).slice().reverse();
  const counts = log.reduce((m, e) => ((m[e.type] = (m[e.type] || 0) + 1), m), {});
  const submit = (e) => { e.preventDefault(); A.addNote(session.id, note); setNote(''); };
  return html`<section class="panel slog" data-testid="session-log">
    <header class="panel-head"><h3>Log di sessione</h3><span class="faint">${log.length} voci</span></header>
    ${!readonly && html`<form class="slog-note" onSubmit=${submit}>
      <input class="input" placeholder="Nota rapida… (Invio per salvare)" value=${note} onInput=${(e) => setNote(e.currentTarget.value)} data-testid="log-note-input" />
      <button class="btn" type="submit" disabled=${!note.trim()} data-testid="log-note-add"><${Icon} name="plus" size=${15} /> Nota</button>
    </form>`}
    <${DiceRoller} sid=${session.id} readonly=${readonly} />
    <div class="slog-filters" role="tablist">
      <button class="chip ${filter === 'all' ? 'on' : ''}" onClick=${() => setFilter('all')} data-testid="log-filter-all">Tutto</button>
      ${LOG_TYPES.map((t) => html`<button class="chip t-${t.id} ${filter === t.id ? 'on' : ''}" onClick=${() => setFilter(t.id)} data-testid=${'log-filter-' + t.id}>
        ${t.label}${counts[t.id] ? html` <span class="chip-n">${counts[t.id]}</span>` : ''}</button>`)}
    </div>
    <ol class="slog-list" data-testid="log-list">
      ${shown.map((e) => html`<li key=${e.id} class="slog-entry t-${e.type}" data-testid="log-entry" data-type=${e.type}>
        <time>${timeOf(e.t)}</time>
        <span class="slog-text"><span class="slog-type">${LOG_TYPE_LABEL[e.type] || e.type}</span>${e.text}</span>
        ${!readonly && html`<button class="icon-btn slog-del" title="Elimina voce" onClick=${() => A.removeLog(session.id, e.id)}><${Icon} name="x" size=${13} /></button>`}
      </li>`)}
      ${!shown.length && html`<li class="slog-empty faint">Nessuna voce${filter !== 'all' ? ' di questo tipo' : ''}.</li>`}
    </ol>
  </section>`;
}
