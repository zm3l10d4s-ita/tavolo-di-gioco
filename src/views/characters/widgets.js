// Componenti e hook della sezione personaggi (in aggiunta a src/components/ui.js).
import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import { useDoc, useDebouncedCommit } from '../../lib/hooks.js';
import { toast } from '../../components/ui.js';
import * as R from '../../lib/rules.js';
import { roll, signed } from '../../lib/util.js';
import { normalizeCharacter, rollD20, describeRoll, PROF_LABELS } from './logic.js';
import { emitRoll } from './api.js';

/** Unità di misura dalle impostazioni ('m' default, 'ft'). Reattivo. */
export function useUnits() {
  const [s] = useDoc('settings', 'app');
  return s?.units || 'm';
}

/** Personaggio normalizzato + mutate(fn(draft) → void|nuovo) che salva subito (autosave). */
export function useCharacter(id) {
  const [raw, patch] = useDoc('characters', id);
  const c = raw ? normalizeCharacter(raw) : null;
  const mutate = (fn) => patch((cur) => { const d = normalizeCharacter(cur); const r = fn(d); return r || d; });
  return [c, mutate, raw];
}

// ---------------------------------------------------------------- tiri
let rollMode = 'normal';
const modeListeners = new Set();
export function getRollMode() { return rollMode; }
export function setRollMode(m) { rollMode = m; modeListeners.forEach((f) => f(m)); }
export function useRollMode() {
  const [m, setM] = useState(rollMode);
  useEffect(() => { modeListeners.add(setM); return () => modeListeners.delete(setM); }, []);
  return [m, setRollMode];
}
let lastRoll = null;
const lastListeners = new Set();
export function useLastRoll() {
  const [r, setR] = useState(lastRoll);
  useEffect(() => { lastListeners.add(setR); return () => lastListeners.delete(setR); }, []);
  return r;
}
function publish(r) { lastRoll = r; lastListeners.forEach((f) => f(r)); }

/** Modalità dal clic: Shift = vantaggio, Alt/Ctrl = svantaggio, altrimenti il selettore "prossimo tiro" (che poi torna normale). */
function modeFrom(event) {
  if (event?.shiftKey) return 'adv';
  if (event?.altKey || event?.ctrlKey) return 'dis';
  const m = rollMode;
  if (m !== 'normal') setRollMode('normal');
  return m;
}

/** Tiro d20 + bonus per il personaggio: toast + evento 'dnd:roll'. */
export function rollCheck(character, label, bonus, event, kind = 'check') {
  const mode = modeFrom(event);
  const pen = R.exhaustionD20Penalty(character);
  const r = rollD20(Number(bonus || 0) + pen, mode);
  const text = describeRoll(label, r) + (pen ? ` (sfinimento ${pen})` : '');
  toast(text, r.crit ? 'good' : r.fumble ? 'bad' : '');
  const result = { ...r, text, kind };
  publish({ characterId: character.id, label, ...result });
  emitRoll(character.id, label, result);
  return result;
}
/** Tiro di danni/espressione libera. */
export function rollExpr(character, label, expr, kind = 'damage') {
  const clean = String(expr || '').trim();
  if (!/\d*d\d+|\d/.test(clean)) { toast(`${label}: espressione non valida`, 'bad'); return null; }
  const r = roll(clean.replace(/\s+/g, ''));
  const text = `${label}: ${r.total} [${r.rolls.map((x) => `${x.die}: ${x.results.join(', ')}`).join(' · ') || clean}]`;
  toast(text, 'magic');
  const result = { ...r, text, kind };
  publish({ characterId: character.id, label, ...result });
  emitRoll(character.id, label, result);
  return result;
}

// ---------------------------------------------------------------- componenti
/** Pallini per usi/slot: pieni = disponibili, vuoti = spesi. Clic su pieno = usa, clic su vuoto = recupera. */
export function Pips({ max, used, onUse, onRestore, tone = '', testid, label = '' }) {
  const m = Math.max(0, Number(max) || 0);
  const u = Math.min(m, Math.max(0, Number(used) || 0));
  if (m > 20) {
    return html`<span class="cs-pipcount ${tone}" data-testid=${testid} data-used=${u} data-max=${m}>
      <button class="btn ghost sm" onClick=${onRestore} disabled=${u <= 0} title="Recupera">−</button>
      <b>${m - u}</b><span class="faint">/${m}</span>
      <button class="btn ghost sm" onClick=${onUse} disabled=${u >= m} title="Usa">+</button></span>`;
  }
  return html`<span class="cs-pips ${tone}" data-testid=${testid} data-used=${u} data-max=${m} role="group" aria-label=${label}>
    ${Array.from({ length: m }, (_, i) => {
      const avail = i < m - u;
      return html`<button type="button" class="cs-pip ${avail ? 'on' : 'off'}" title=${avail ? 'Disponibile — clic per usare' : 'Speso — clic per recuperare'}
        onClick=${() => (avail ? onUse?.() : onRestore?.())}></button>`;
    })}
  </span>`;
}

/** Pallino di competenza ciclabile (0 / ½ / 1 / maestria). */
export function ProfDot({ value, onClick, testid, title }) {
  const v = Number(value) || 0;
  const cls = v === 2 ? 'p2' : v === 1 ? 'p1' : v === 0.5 ? 'ph' : 'p0';
  return html`<button type="button" class="cs-prof ${cls}" onClick=${onClick} data-testid=${testid} data-prof=${v}
    title=${(title ? title + ' — ' : '') + PROF_LABELS[v] + ' (clic per cambiare)'} aria-label=${PROF_LABELS[v]}></button>`;
}

/** Textarea/input con commit ritardato verso lo store (per testi lunghi). */
export function LazyText({ label, value, onCommit, multiline = true, rows = 4, placeholder = '', className = '', testid }) {
  const [local, setLocal] = useDebouncedCommit(value ?? '', onCommit, 300);
  const Tag = multiline ? 'textarea' : 'input';
  return html`<label class="field ${className}">
    ${label && html`<span class="field-label">${label}</span>`}
    <${Tag} class="input" value=${local} rows=${multiline ? rows : undefined} placeholder=${placeholder} data-testid=${testid}
      onInput=${(e) => setLocal(e.currentTarget.value)} />
  </label>`;
}

/** Input testo compatto senza etichetta (commit immediato). */
export function Inline({ value, onInput, placeholder = '', className = '', testid, title, ...rest }) {
  return html`<input class="input cs-inline ${className}" value=${value ?? ''} placeholder=${placeholder} title=${title}
    data-testid=${testid} onInput=${(e) => onInput(e.currentTarget.value)} ...${rest} />`;
}

/** Input numerico compatto; accetta vuoto (→ null) se nullable. */
export function InlineNum({ value, onInput, min, max, step = 1, nullable = false, className = '', testid, placeholder = '', title }) {
  return html`<input class="input cs-inline cs-num ${className}" type="number" value=${value ?? ''} min=${min} max=${max} step=${step}
    placeholder=${placeholder} title=${title} data-testid=${testid}
    onInput=${(e) => {
      const t = e.currentTarget.value;
      if (t === '') { if (nullable) onInput(null); return; }
      let v = Number(t); if (!Number.isFinite(v)) return;
      if (min != null) v = Math.max(min, v); if (max != null) v = Math.min(max, v);
      onInput(v);
    }} />`;
}

/** Contatore −/valore/+ compatto. */
export function Stepper({ value, onChange, min = 0, max = 9999, testid, title }) {
  const v = Number(value) || 0;
  return html`<span class="cs-stepper" data-testid=${testid} title=${title}>
    <button type="button" class="btn ghost sm" disabled=${v <= min} onClick=${() => onChange(Math.max(min, v - 1))} aria-label="Diminuisci">−</button>
    <input class="input cs-inline cs-num" type="number" value=${v} min=${min} max=${max}
      onInput=${(e) => { const t = e.currentTarget.value; if (t !== '' && Number.isFinite(Number(t))) onChange(Math.max(min, Math.min(max, Number(t)))); }} />
    <button type="button" class="btn ghost sm" disabled=${v >= max} onClick=${() => onChange(Math.min(max, v + 1))} aria-label="Aumenta">+</button>
  </span>`;
}

/** Valore calcolato con override opzionale: mostra il calcolato come placeholder. */
export function OverrideField({ label, computed, value, onInput, testid, hint = 'vuoto = automatico' }) {
  const has = value !== null && value !== undefined && value !== '';
  return html`<label class="field cs-override ${has ? 'set' : ''}" title=${hint}>
    <span class="field-label">${label}</span>
    <span class="row" style="gap:6px;flex-wrap:nowrap">
      <${InlineNum} value=${has ? value : ''} nullable placeholder=${String(computed ?? '')} onInput=${onInput} testid=${testid} />
      ${has ? html`<button type="button" class="btn ghost sm" title="Torna al valore calcolato" onClick=${() => onInput(null)}>auto</button>`
        : html`<span class="faint cs-small">auto</span>`}
    </span>
  </label>`;
}

/** Pulsante di tiro con il bonus mostrato. */
export function RollBtn({ bonus, onRoll, className = '', testid, title = 'Tira (Shift = vantaggio, Alt = svantaggio)', children }) {
  return html`<button type="button" class="cs-roll ${className}" onClick=${onRoll} data-testid=${testid} title=${title}>${children ?? signed(bonus)}</button>`;
}

/** Menu a comparsa ancorato (chiude al clic fuori / Esc). */
export function Popover({ open, onClose, children, className = '' }) {
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.(); };
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey); };
  }, [open]);
  if (!open) return null;
  return html`<div class="cs-popover ${className}" ref=${ref}>${children}</div>`;
}

/** Converte un valore in piedi verso l'unità visualizzata (numero) e viceversa. */
export const ftToUnit = (ft, units) => (units === 'ft' ? Number(ft) || 0 : R.feetToMeters(ft));
export const unitToFt = (v, units) => (units === 'ft' ? Number(v) || 0 : Math.round((Number(v) || 0) / 0.3));
export const lbToUnit = (lb, units) => (units === 'ft' ? Number(lb) || 0 : R.lbToKg(lb));
export const unitToLb = (v, units) => (units === 'ft' ? Number(v) || 0 : Math.round(((Number(v) || 0) / 0.5) * 1000) / 1000);
export const distUnit = (units) => (units === 'ft' ? 'ft' : 'm');
export const weightUnit = (units) => (units === 'ft' ? 'lb' : 'kg');
