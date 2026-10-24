// Pannello di dettaglio del combattente selezionato: statistiche modificabili, condizioni, note, StatBlock del mostro.
import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { Button, ConfirmButton, Empty } from '../../components/ui.js';
import { Icon } from '../../components/icons.js';
import { StatBlock } from '../../components/statblock.js';
import { useDebouncedCommit } from '../../lib/hooks.js';
import * as store from '../../lib/store.js';
import { signed } from '../../lib/util.js';
import { statusOf, STATUS_LABEL, formatRoll } from '../../lib/session-core.js';
import * as A from './actions.js';

function StatInput({ label, value, onCommit, disabled, testid, title }) {
  return html`<label class="dstat" title=${title}>
    <span>${label}</span>
    <input class="input" type="number" value=${value} disabled=${disabled} onChange=${(e) => onCommit(e.currentTarget.value)}
      onKeyDown=${(e) => e.key === 'Enter' && e.currentTarget.blur()} data-testid=${testid} />
  </label>`;
}

function Conditions({ c, sid, eq, conditions, readonly }) {
  const [cid, setCid] = useState('');
  const [rounds, setRounds] = useState('');
  const label = (id) => { const x = conditions.find((k) => k.id === id); return x?.name_it || x?.name || id; };
  const add = () => { if (!cid) return; A.addCondition(sid, c.id, cid, rounds, label(cid), eq); setCid(''); setRounds(''); };
  return html`<div class="dsec">
    <div class="dsec-title">Condizioni</div>
    <div class="cond-list">
      ${c.conditions.length ? c.conditions.map((k) => html`<span class="cond-badge lg" data-testid="condition-badge">
          ${k.label || label(k.id)}${k.rounds ? html`<b title="Round rimanenti">${k.rounds}</b>` : ''}
          ${!readonly && html`<button title="Rimuovi" onClick=${() => A.removeCondition(sid, c.id, k.id, k.label || label(k.id), eq)}><${Icon} name="x" size=${12} /></button>`}
        </span>`) : html`<span class="faint">Nessuna</span>`}
    </div>
    ${!readonly && html`<div class="cond-add">
      <select class="input" value=${cid} onChange=${(e) => setCid(e.currentTarget.value)} data-testid="condition-select">
        <option value="">Aggiungi condizione…</option>
        ${conditions.map((k) => html`<option value=${k.id} disabled=${c.conditions.some((x) => x.id === k.id)}>${k.name_it || k.name}</option>`)}
      </select>
      <input class="input cond-rounds" type="number" min="1" placeholder="round" value=${rounds} title="Durata in round (vuoto = indefinita)"
        onInput=${(e) => setRounds(e.currentTarget.value)} data-testid="condition-rounds" />
      <${Button} size="sm" onClick=${add} disabled=${!cid} data-testid="condition-add">Aggiungi</${Button}>
    </div>`}
    ${c.conditions.length > 0 && html`<div class="cond-help">
      ${c.conditions.map((k) => { const d = conditions.find((x) => x.id === k.id); return d?.summary_it ? html`<p><b>${d.name_it}.</b> ${d.summary_it}</p>` : null; })}
    </div>`}
  </div>`;
}

export function CombatantDetail({ c, sid, eq, monster, conditions, readonly, navigate, onRoll }) {
  const [notes, setNotes] = useDebouncedCommit(c?.notes || '', (v) => A.patchCombatant(sid, c.id, { notes: v }, eq), 400);
  if (!c) return html`<div class="detail-empty"><${Empty} title="Nessuna selezione">Clicca un combattente per vederne la scheda, le condizioni e le note.</${Empty}></div>`;
  const st = statusOf(c);
  const ch = c.kind === 'pc' && c.refId ? store.get('characters', c.refId) : null;
  const ds = ch?.deathSaves;
  return html`<div class="cdetail" data-testid="combatant-detail" data-id=${c.id}>
    <div class="cdetail-head">
      <div>
        <h3>${c.name}</h3>
        <div class="faint">${c.kind === 'pc' ? 'Personaggio giocante' : c.kind === 'npc' ? 'PNG' : (monster ? `${monster.type_it || monster.type || ''} · GS ${monster.cr} · ${monster.xp ?? 0} PE` : 'Mostro')}
          · iniziativa ${c.initiative ?? '—'} (${signed(c.initBonus)})</div>
      </div>
      <span class="spacer"></span>
      ${st !== 'ok' && html`<span class="tag bad">${STATUS_LABEL[st]}</span>`}
    </div>
    <div class="dstats">
      <${StatInput} label="CA" value=${c.ac} disabled=${readonly} onCommit=${(v) => A.setStat(sid, c.id, 'ac', v, eq)} testid="detail-ac" />
      <${StatInput} label="PF" value=${c.hp} disabled=${readonly} onCommit=${(v) => A.setStat(sid, c.id, 'hp', v, eq)} testid="detail-hp" />
      <${StatInput} label="PF max" value=${c.maxHp} disabled=${readonly || c.kind === 'pc'} title=${c.kind === 'pc' ? 'Il massimo si modifica nella scheda' : ''} onCommit=${(v) => A.setStat(sid, c.id, 'maxHp', v, eq)} testid="detail-maxhp" />
      <${StatInput} label="PF temp" value=${c.tempHp} disabled=${readonly} onCommit=${(v) => A.setStat(sid, c.id, 'tempHp', v, eq)} testid="detail-temp" />
      <${StatInput} label="Bonus iniz." value=${c.initBonus} disabled=${readonly} onCommit=${(v) => A.patchCombatant(sid, c.id, { initBonus: Number(v) || 0 }, eq)} testid="detail-initbonus" />
    </div>
    ${c.kind === 'pc' && st !== 'ok' && ds && html`<div class="death-saves">Tiri salvezza contro morte:
      <span class="ds-ok">${'●'.repeat(ds.successes || 0)}${'○'.repeat(Math.max(0, 3 - (ds.successes || 0)))}</span> successi ·
      <span class="ds-ko">${'●'.repeat(ds.failures || 0)}${'○'.repeat(Math.max(0, 3 - (ds.failures || 0)))}</span> fallimenti</div>`}
    <${Conditions} c=${c} sid=${sid} eq=${eq} conditions=${conditions} readonly=${readonly} />
    <div class="dsec">
      <div class="dsec-title">Note</div>
      <textarea class="input" rows="2" value=${notes} disabled=${readonly} placeholder="Concentrazione, bersaglio, posizione…" onInput=${(e) => setNotes(e.currentTarget.value)} data-testid="detail-notes"></textarea>
    </div>
    ${!readonly && html`<div class="row dactions">
      ${c.kind === 'pc' && html`<${Button} size="sm" variant=${c.dead ? 'danger' : ''} onClick=${() => A.patchCombatant(sid, c.id, { dead: !c.dead }, eq)}>${c.dead ? 'Segna vivo' : 'Segna morto'}</${Button}>`}
      ${c.kind === 'pc' && ch && html`<${Button} size="sm" variant="ghost" onClick=${() => navigate('characters', ch.id)}><${Icon} name="users" size=${14} /> Apri scheda</${Button}>`}
      <${Button} size="sm" variant="ghost" onClick=${() => A.toggleHidden(sid, c.id, eq)} title="I combattenti nascosti vengono saltati nei turni" data-testid="toggle-hidden">
        <${Icon} name=${c.hidden ? 'eye' : 'eyeOff'} size=${14} /> ${c.hidden ? 'Mostra' : 'Nascondi'}</${Button}>
      <span class="spacer"></span>
      <${ConfirmButton} confirmText="Rimuovere?" onConfirm=${() => A.removeOne(sid, c.id, eq)}><${Icon} name="trash" size=${14} /> Rimuovi</${ConfirmButton}>
    </div>`}
    ${monster && html`<div class="dstatblock"><${StatBlock} monster=${monster} compact onRoll=${onRoll} /></div>`}
  </div>`;
}

/** onRoll dello StatBlock → testo per il log. */
export function statblockRollText({ label, result }) { return formatRoll(label, result); }
