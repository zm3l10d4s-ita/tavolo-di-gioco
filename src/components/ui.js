// Componenti UI condivisi. Usare questi per coerenza visiva tra le sezioni.
import { html, useState, useEffect, useRef } from '../vendor/preact-htm.js';
import { signed } from '../lib/util.js';

/** Campo testo con etichetta. onCommit chiamato ad ogni modifica (lo store fa debounce del disco). */
export function TextField({ label, value, onInput, placeholder = '', className = '', multiline = false, rows = 3, ...rest }) {
  const Tag = multiline ? 'textarea' : 'input';
  return html`<label class="field ${className}">
    ${label && html`<span class="field-label">${label}</span>`}
    <${Tag} class="input" value=${value ?? ''} placeholder=${placeholder} rows=${multiline ? rows : undefined}
      onInput=${(e) => onInput?.(e.currentTarget.value)} ...${rest} />
  </label>`;
}

/** Input numerico con pulsanti -/+ opzionali. */
export function NumberField({ label, value, onInput, min, max, step = 1, steppers = false, className = '', ...rest }) {
  const set = (v) => {
    let n = Number(v);
    if (Number.isNaN(n)) n = 0;
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    onInput?.(n);
  };
  return html`<label class="field num ${className}">
    ${label && html`<span class="field-label">${label}</span>`}
    <span class="num-wrap">
      ${steppers && html`<button type="button" class="btn ghost sm" onClick=${() => set((Number(value) || 0) - step)}>−</button>`}
      <input class="input" type="number" value=${value ?? 0} min=${min} max=${max} step=${step}
        onInput=${(e) => e.currentTarget.value !== '' && set(e.currentTarget.value)} ...${rest} />
      ${steppers && html`<button type="button" class="btn ghost sm" onClick=${() => set((Number(value) || 0) + step)}>+</button>`}
    </span>
  </label>`;
}

export function Select({ label, value, options, onChange, className = '', ...rest }) {
  return html`<label class="field ${className}">
    ${label && html`<span class="field-label">${label}</span>`}
    <select class="input" value=${value ?? ''} onChange=${(e) => onChange?.(e.currentTarget.value)} ...${rest}>
      ${options.map((o) => typeof o === 'string'
        ? html`<option value=${o}>${o}</option>`
        : html`<option value=${o.value}>${o.label}</option>`)}
    </select>
  </label>`;
}

export function Checkbox({ label, checked, onChange, title }) {
  return html`<label class="check" title=${title}>
    <input type="checkbox" checked=${!!checked} onChange=${(e) => onChange?.(e.currentTarget.checked)} />
    <span>${label}</span>
  </label>`;
}

export function Button({ children, onClick, variant = '', size = '', title, disabled, type = 'button', ...rest }) {
  return html`<button type=${type} class="btn ${variant} ${size}" onClick=${onClick} title=${title} disabled=${disabled} ...${rest}>${children}</button>`;
}

export function Tabs({ tabs, active, onChange }) {
  return html`<div class="tabs" role="tablist">
    ${tabs.map((t) => html`<button role="tab" class="tab ${active === t.id ? 'active' : ''}" aria-selected=${active === t.id}
      onClick=${() => onChange(t.id)}>${t.label}</button>`)}
  </div>`;
}

export function Panel({ title, actions, children, className = '' }) {
  return html`<section class="panel ${className}">
    ${(title || actions) && html`<header class="panel-head"><h3>${title}</h3><div class="panel-actions">${actions}</div></header>`}
    <div class="panel-body">${children}</div>
  </section>`;
}

export function Modal({ open, title, onClose, children, wide = false }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  if (!open) return null;
  return html`<div class="modal-backdrop" onClick=${(e) => e.target === e.currentTarget && onClose?.()}>
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-label=${title}>
      <header class="modal-head"><h3>${title}</h3><button class="btn ghost sm" onClick=${onClose} aria-label="Chiudi">✕</button></header>
      <div class="modal-body">${children}</div>
    </div>
  </div>`;
}

export function SearchBox({ value, onInput, placeholder = 'Cerca…', autofocus }) {
  const ref = useRef();
  useEffect(() => { if (autofocus) ref.current?.focus(); }, []);
  return html`<input ref=${ref} class="input search" type="search" value=${value} placeholder=${placeholder}
    onInput=${(e) => onInput(e.currentTarget.value)} />`;
}

export function Tag({ children, tone = '' }) { return html`<span class="tag ${tone}">${children}</span>`; }

export function Empty({ title, children }) {
  return html`<div class="empty"><div class="empty-title">${title}</div><div class="empty-body">${children}</div></div>`;
}

/** Riquadro caratteristica stile scheda: valore grande + modificatore. */
export function StatBox({ label, value, sub }) {
  return html`<div class="statbox"><div class="statbox-label">${label}</div><div class="statbox-value">${value}</div>${sub != null && html`<div class="statbox-sub">${sub}</div>`}</div>`;
}

export function Mod({ value }) { return html`<span class="mod">${signed(value)}</span>`; }

/** Conferma inline senza dialog nativi (che bloccano l'automazione). */
export function ConfirmButton({ children, onConfirm, variant = 'danger', size = 'sm', confirmText = 'Confermi?' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t); }, [armed]);
  return html`<button type="button" class="btn ${armed ? 'danger' : variant} ${size}"
    onClick=${() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>${armed ? confirmText : children}</button>`;
}

/** Notifiche brevi (es. risultati tiri). */
let toastFn = null;
export function toast(msg, tone = '') { toastFn?.(msg, tone); }
export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    toastFn = (msg, tone) => {
      const id = Math.random();
      setItems((x) => [...x, { id, msg, tone }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4000);
    };
    return () => { toastFn = null; };
  }, []);
  return html`<div class="toasts" aria-live="polite">${items.map((t) => html`<div class="toast ${t.tone}">${t.msg}</div>`)}</div>`;
}
