// Tab "Compagni": Forma selvatica, trasformazioni da incantesimi, compagni ed evocazioni presi dal bestiario.
// Più il banner della forma attiva, mostrato in cima alla scheda finché il personaggio è trasformato.
import { html, useState, useMemo } from '../../vendor/preact-htm.js';
import { Panel, Modal, Button, ConfirmButton, toast } from '../../components/ui.js';
import { StatBlock } from '../../components/statblock.js';
import * as R from '../../lib/rules.js';
import * as CP from '../../lib/companions.js';
import { norm } from '../../lib/util.js';
import { addCompanionToActiveCombat } from '../../lib/combat.js';
import { applyHp } from './logic.js';
import { useUnits } from './widgets.js';

const KIND_IT = { wildshape: 'Forma selvatica', polymorph: 'Metamorfosi', 'true-polymorph': 'Metamorfosi pura', shapechange: 'Cambiare forma', 'animal-shapes': 'Forme animali', other: 'Trasformazione' };
const monName = (m) => m?.name_it || m?.name || '';
const tags = (m) => [m.size_it || m.size, m.type_it || m.type, `GS ${m.cr}`, m.speed?.fly ? 'volo' : '', m.speed?.swim ? 'nuoto' : ''].filter(Boolean);

/** Selettore di creature dal bestiario (già filtrate). */
export function CreaturePicker({ open, title, hint, monsters, onPick, onClose, pickLabel = 'Scegli' }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const list = useMemo(() => {
    const nq = norm(q);
    return (monsters || []).filter((m) => !nq || norm(m.name).includes(nq) || norm(m.name_it).includes(nq)).slice(0, 300);
  }, [q, monsters]);
  if (!open) return null;
  const close = () => { setSel(null); setQ(''); onClose(); };
  return html`<${Modal} open=${open} title=${title} onClose=${close} wide>
    <div class="cp-picker" data-testid="creature-picker">
      ${hint && html`<p class="faint cs-small">${hint}</p>`}
      ${sel ? html`<div class="cp-pick-detail">
          <${StatBlock} monster=${sel} compact=${true} />
          <div class="row"><span class="spacer"></span>
            <${Button} variant="ghost" onClick=${() => setSel(null)}>← Elenco</${Button}>
            <${Button} variant="primary" onClick=${() => { onPick(sel); close(); }} data-testid="picker-confirm">${pickLabel}</${Button}></div>
        </div>`
      : html`<input class="input" placeholder="Cerca per nome…" value=${q} onInput=${(e) => setQ(e.currentTarget.value)} data-testid="picker-search" />
        <div class="faint cs-small">${list.length} creature${list.length === 300 ? ' (prime 300)' : ''}</div>
        <ul class="cp-list">${list.map((m) => html`<li><button class="cp-row" onClick=${() => setSel(m)} data-testid="picker-item" data-id=${m.id}>
            <b>${monName(m)}</b><span class="cp-tags">${tags(m).map((t) => html`<span class="tag">${t}</span>`)}${m.ruleset ? html`<span class="tag faint">${m.ruleset}</span>` : ''}</span>
            <span class="faint cs-small">CA ${m.ac} · PF ${m.hp}</span></button></li>`)}
          ${!list.length && html`<li class="faint">Nessuna creatura adatta. Puoi aggiungerla al bestiario con «Incolla testo» o creare un compagno personalizzato.</li>`}</ul>`}
    </div>
  </${Modal}>`;
}

/** Banner in cima alla scheda quando il personaggio è trasformato. */
export function ActiveFormBanner({ c, mutate, data }) {
  const units = useUnits();
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState('');
  const f = c.activeForm;
  if (!f) return null;
  const m = (data.monsters || []).find((x) => x.id === f.monsterId);
  const revert = () => { mutate((d) => CP.endForm(d)); toast(`${c.name} torna alla sua forma.`, 'good'); };
  const hit = (sign) => {
    const v = Math.abs(parseInt(amt, 10)); if (!v) return;
    let res;
    mutate((d) => { res = CP.formHp(d, sign * v, (cc, delta) => applyHp(cc, delta).character); return res.character; });
    setAmt('');
    if (res?.reverted) toast(`La forma si dissolve! ${res.excess ? `${res.excess} danni in eccesso passano a ${c.name}.` : ''}`, 'bad');
  };
  return html`<div class="cp-form-banner" data-testid="active-form">
    <div class="cp-form-head">
      <span class="cp-form-ico">🐾</span>
      <div class="cp-form-title"><b>In forma di ${monName(m) || f.name}</b><span class="muted cs-small">${KIND_IT[f.kind] || 'Trasformazione'}${f.hours ? ` · fino a ${f.hours} ${f.hours === 1 ? 'ora' : 'ore'}` : ''} · regole ${f.rules}</span></div>
      <span class="spacer"></span>
      <button class="btn sm" onClick=${() => setOpen(!open)} data-testid="form-toggle">${open ? 'Chiudi scheda' : 'Scheda'}</button>
      <button class="btn sm primary" onClick=${revert} data-testid="form-end">Torna normale</button>
    </div>
    <div class="row cp-form-stats">
      <span class="tag">CA ${f.ac}</span>
      ${f.hp ? html`<span class="tag ${f.hp.current <= f.hp.max / 4 ? 'bad' : ''}" data-testid="form-hp">PF forma ${f.hp.current}/${f.hp.max}</span>
          <input class="input cs-inline cp-amt" inputmode="numeric" placeholder="PF" value=${amt} onInput=${(e) => setAmt(e.currentTarget.value)} data-testid="form-hp-amt" />
          <button class="btn sm cs-dmg" onClick=${() => hit(-1)} data-testid="form-dmg">Danno</button>
          <button class="btn sm cs-heal" onClick=${() => hit(1)}>Cura</button>`
        : html`<span class="tag magic">Tieni i tuoi PF (+${c.hp.temp || 0} temporanei)</span>`}
      ${m?.speed && html`<span class="faint cs-small">Velocità ${['walk', 'fly', 'swim', 'climb', 'burrow'].filter((k) => m.speed[k]).map((k) => `${{ walk: '', fly: 'volo ', swim: 'nuoto ', climb: 'scalata ', burrow: 'scavo ' }[k]}${R.formatDistance(m.speed[k], units)}`).join(', ')}</span>`}
    </div>
    ${f.rules === '2014' && f.kind === 'wildshape' ? html`<p class="faint cs-small">Regole 2014: usi i PF della bestia; a 0 torni normale e il danno in eccesso passa a te. Tieni INT, SAG, CAR e i privilegi; non puoi lanciare incantesimi.</p>`
      : f.kind === 'wildshape' ? html`<p class="faint cs-small">Regole 2024: tieni PF, INT, SAG, CAR, competenze e privilegi; usi le altre statistiche della bestia. Non puoi lanciare incantesimi.</p>` : ''}
    ${open && (m ? html`<div class="cp-form-sb"><${StatBlock} monster=${m} compact=${true} /></div>` : html`<p class="faint">Creatura non trovata nel bestiario.</p>`)}
  </div>`;
}

function CompanionCard({ comp, c, mutate, data }) {
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState('');
  const m = comp.monsterId ? (data.monsters || []).find((x) => x.id === comp.monsterId) : null;
  const ac = comp.custom?.ac ?? m?.ac ?? 10;
  const set = (patch) => mutate((d) => { d.companions = (d.companions || []).map((x) => (x.id === comp.id ? { ...x, ...patch } : x)); });
  const hit = (sign) => { const v = Math.abs(parseInt(amt, 10)); if (!v) return; mutate((d) => { d.companions = (d.companions || []).map((x) => (x.id === comp.id ? CP.companionHp(x, sign * v) : x)); }); setAmt(''); };
  const pct = Math.max(0, Math.min(100, (comp.hp.current / Math.max(1, comp.hp.max)) * 100));
  return html`<div class="cp-card ${comp.hp.current <= 0 ? 'down' : ''}" data-testid="companion-card">
    <div class="cp-card-head">
      <input class="input cs-inline cp-name" value=${comp.name} onChange=${(e) => set({ name: e.currentTarget.value })} />
      <span class="tag">${comp.source || (comp.temporary ? 'Evocazione' : 'Compagno')}</span>
    </div>
    <div class="faint cs-small">${m ? `${monName(m)} · ${tags(m).join(' · ')}` : 'Compagno personalizzato'}</div>
    <div class="row cp-card-stats">
      <span class="tag">CA ${ac}</span>
      <span class="tag ${comp.hp.current <= 0 ? 'bad' : ''}" data-testid="companion-hp">PF ${comp.hp.current}/${comp.hp.max}${comp.hp.temp ? ` +${comp.hp.temp}` : ''}</span>
      <input class="input cs-inline cp-amt" inputmode="numeric" placeholder="PF" value=${amt} onInput=${(e) => setAmt(e.currentTarget.value)} data-testid="companion-amt" />
      <button class="btn sm cs-dmg" onClick=${() => hit(-1)} data-testid="companion-dmg">Danno</button>
      <button class="btn sm cs-heal" onClick=${() => hit(1)}>Cura</button>
    </div>
    <div class="cs-hpbar"><i style=${`width:${pct}%`} class=${pct <= 25 ? 'low' : pct <= 50 ? 'mid' : ''}></i></div>
    <div class="row cp-card-actions">
      <button class="btn ghost sm" onClick=${() => setOpen(!open)}>${open ? 'Nascondi scheda' : 'Scheda'}</button>
      <button class="btn ghost sm" onClick=${() => { addCompanionToActiveCombat({ name: comp.name, ownerName: c.name, monster: m, hp: comp.hp.current, maxHp: comp.hp.max, ac }); toast(`${comp.name} aggiunto al combattimento`, 'good'); }} data-testid="companion-combat">Al combattimento</button>
      <button class="btn ghost sm" onClick=${() => set({ hp: { ...comp.hp, current: comp.hp.max, temp: 0 } })}>PF al massimo</button>
      <span class="spacer"></span>
      <${ConfirmButton} variant="ghost" onConfirm=${() => mutate((d) => { d.companions = (d.companions || []).filter((x) => x.id !== comp.id); })} confirmText="Congedare?">${comp.temporary ? 'Termina' : 'Congeda'}</${ConfirmButton}>
    </div>
    ${open && (m ? html`<div class="cp-form-sb"><${StatBlock} monster=${m} compact=${true} /></div>`
      : html`<div class="cp-custom"><p><b>Velocità:</b> ${comp.custom?.speed || '—'}</p><p><b>Attacchi:</b> ${comp.custom?.attacks || '—'}</p><p class="muted">${comp.custom?.text || ''}</p></div>`)}
    <textarea class="input cp-notes" rows="2" placeholder="Note (comandi, ordini, oggetti che porta…)" value=${comp.notes || ''} onChange=${(e) => set({ notes: e.currentTarget.value })}></textarea>
  </div>`;
}

function CustomCompanionModal({ open, onClose, onSave }) {
  const [f, setF] = useState({ name: '', ac: 12, hp: 10, speed: '9 m', attacks: '', text: '' });
  if (!open) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.currentTarget.value });
  return html`<${Modal} open=${open} title="Compagno personalizzato" onClose=${onClose}>
    <div class="cs-form cs-form-2" data-testid="custom-companion">
      <label class="field cs-span2"><span class="field-label">Nome</span><input class="input" value=${f.name} onInput=${set('name')} placeholder="es. Difensore d'acciaio" data-testid="custom-name" /></label>
      <label class="field"><span class="field-label">CA</span><input class="input" type="number" value=${f.ac} onInput=${set('ac')} /></label>
      <label class="field"><span class="field-label">PF</span><input class="input" type="number" value=${f.hp} onInput=${set('hp')} data-testid="custom-hp" /></label>
      <label class="field cs-span2"><span class="field-label">Velocità</span><input class="input" value=${f.speed} onInput=${set('speed')} /></label>
      <label class="field cs-span2"><span class="field-label">Attacchi</span><input class="input" value=${f.attacks} onInput=${set('attacks')} placeholder="es. Morso +5, 1d8+3 perforanti" /></label>
      <label class="field cs-span2"><span class="field-label">Altro (tratti, azioni)</span><textarea class="input" rows="3" value=${f.text} onInput=${set('text')}></textarea></label>
    </div>
    <div class="row"><span class="spacer"></span><${Button} variant="ghost" onClick=${onClose}>Annulla</${Button}>
      <${Button} variant="primary" disabled=${!f.name.trim()} onClick=${() => { onSave(f); onClose(); }} data-testid="custom-save">Aggiungi</${Button}></div>
  </${Modal}>`;
}

export function CompanionsTab({ c, mutate, data }) {
  const [picker, setPicker] = useState(null); // { title, hint, monsters, onPick, pickLabel }
  const [custom, setCustom] = useState(false);
  const monsters = data.monsters || [];
  const lim = CP.wildShapeLimits(c, data.levels);
  const sources = CP.companionSources(c);
  const companions = c.companions || [];
  const known = c.wildShape?.known || [];
  const byId = (id) => monsters.find((m) => m.id === id);
  const wsRes = (c.resources || []).find((r) => r.autoKey === 'wild-shape' || /wild shape|forma selvatica/i.test(r.name || ''));
  const eligible = useMemo(() => (lim ? CP.eligibleWildShapes(monsters, lim) : []), [monsters.length, lim?.maxCr, lim?.fly, lim?.swim, lim?.rules]);

  const transform = (m, kind, source, rules) => {
    let warn = '';
    mutate((d) => { const r = CP.startForm(d, m, { kind, source, rules, lim: kind === 'wildshape' ? lim : null }); warn = r.warning; return r.character; });
    toast(`${c.name} si trasforma: ${monName(m)}${warn ? ' — ' + warn : ''}`, warn ? 'bad' : 'good');
  };
  const addComp = (m, src) => {
    mutate((d) => { d.companions = [...(d.companions || []), CP.makeCompanion(m, { kind: src.kind, source: src.label, temporary: src.kind === 'summon' })]; });
    toast(`${src.label}: ${monName(m)} aggiunto`, 'good');
  };
  const pick = (title, hint, list, onPick, pickLabel) => setPicker({ title, hint, monsters: list, onPick, pickLabel });
  const companionSrc = sources.filter((s) => s.kind !== 'form');
  const formSrc = sources.filter((s) => s.kind === 'form');

  return html`<div class="cs-grid-2 cp-tab" data-testid="companions-tab">
    <div class="cs-col">
      ${lim && html`<${Panel} title="Forma selvatica" className="cp-ws">
        <div class="row cp-ws-limits">
          <span class="tag accent">GS max ${CP.crLabel(lim.maxCr)}</span>
          <span class="tag">${lim.swim ? 'nuoto sì' : 'niente nuoto'}</span><span class="tag">${lim.fly ? 'volo sì' : 'niente volo'}</span>
          <span class="tag">fino a ${lim.hours} ${lim.hours === 1 ? 'ora' : 'ore'}</span>
          ${lim.rules === '2024' && html`<span class="tag magic">+${lim.tempHp} PF temporanei</span>`}
          ${lim.moon && html`<span class="tag magic">Circolo della Luna</span>`}
          ${wsRes && html`<span class="tag ${wsRes.used >= wsRes.max ? 'bad' : 'good'}" data-testid="ws-uses">Usi ${Math.max(0, wsRes.max - (wsRes.used || 0))}/${wsRes.max}</span>`}
        </div>
        ${lim.rules === '2024'
          ? html`<p class="faint cs-small">Forme conosciute: <b data-testid="ws-known-count">${known.length}/${lim.known}</b>. Dopo un riposo lungo puoi sostituirne una.</p>`
          : html`<p class="faint cs-small">Puoi trasformarti in qualsiasi bestia vista che rispetti i limiti. Le preferite restano qui sotto.</p>`}
        <ul class="cp-known">${known.map((id) => { const m = byId(id); if (!m) return null; const ok = eligible.some((x) => x.id === id);
          return html`<li class=${ok ? '' : 'off'}><b>${monName(m)}</b> <span class="faint cs-small">GS ${m.cr} · CA ${m.ac} · PF ${m.hp}${ok ? '' : ' · fuori limite'}</span>
            <span class="spacer"></span>
            <button class="btn sm primary" disabled=${!ok} onClick=${() => transform(m, 'wildshape', 'Forma selvatica', lim.rules)} data-testid="ws-transform">Trasformati</button>
            <button class="btn ghost sm" title="Togli" onClick=${() => mutate((d) => { d.wildShape = { ...(d.wildShape || {}), known: (d.wildShape?.known || []).filter((x) => x !== id) }; })}>✕</button></li>`; })}</ul>
        <div class="row">
          <${Button} size="sm" disabled=${lim.known != null && known.length >= lim.known} data-testid="ws-learn"
            onClick=${() => pick(lim.rules === '2024' ? 'Impara una forma' : 'Aggiungi una forma preferita', `Bestie di GS ≤ ${CP.crLabel(lim.maxCr)}${lim.fly ? '' : ', senza volo'}${lim.swim ? '' : ', senza nuoto'} (regole ${lim.rules}).`,
              eligible.filter((m) => !known.includes(m.id)), (m) => mutate((d) => { d.wildShape = { ...(d.wildShape || {}), known: [...(d.wildShape?.known || []), m.id] }; }), lim.rules === '2024' ? 'Impara' : 'Aggiungi')}>
            ${lim.rules === '2024' ? '+ Impara forma' : '+ Forma preferita'}</${Button}>
          ${lim.rules !== '2024' && html`<${Button} size="sm" variant="primary" onClick=${() => pick('Trasformati con la Forma selvatica', `Bestie di GS ≤ ${CP.crLabel(lim.maxCr)}.`, eligible, (m) => transform(m, 'wildshape', 'Forma selvatica', lim.rules), 'Trasformati')} data-testid="ws-any">Trasformati in…</${Button}>`}
        </div>
      </${Panel}>`}

      <${Panel} title="Trasformazioni">
        ${formSrc.length ? html`<div class="cp-sources">${formSrc.map((s) => html`<button class="btn sm" onClick=${() => pick(s.label, s.hint, monsters.filter(s.filter).sort((a, b) => CP.crValue(a) - CP.crValue(b)), (m) => transform(m, s.key, s.label, s.ruleset), 'Trasformati')}>${s.label}</button>`)}</div>`
          : html`<p class="faint cs-small">Nessun incantesimo di trasformazione conosciuto (Metamorfosi, Cambiare forma…).</p>`}
        <button class="btn ghost sm" onClick=${() => pick('Altra trasformazione', 'Qualsiasi creatura del bestiario (es. effetto di un oggetto, maledizione, decisione del master).', [...monsters].sort((a, b) => a.name.localeCompare(b.name)), (m) => transform(m, 'other', 'Trasformazione', c.ruleset === '2014' ? '2014' : '2024'), 'Trasformati')} data-testid="form-other">Altra trasformazione…</button>
      </${Panel}>
    </div>

    <div class="cs-col">
      <${Panel} title="Compagni ed evocazioni">
        ${companionSrc.length ? html`<div class="cp-sources">${companionSrc.map((s) => html`<button class="btn sm ${s.kind === 'summon' ? '' : 'primary'}" data-testid=${'source-' + s.key}
            onClick=${() => pick(s.label, s.hint, monsters.filter(s.filter).sort((a, b) => CP.crValue(a) - CP.crValue(b) || a.name.localeCompare(b.name)), (m) => addComp(m, s), 'Aggiungi')}>+ ${s.label}</button>`)}</div>`
          : html`<p class="faint cs-small">Nessun privilegio o incantesimo che dia un compagno (Trova famiglio, Trova destriero, Signore delle bestie, Animare morti…). Puoi comunque aggiungerne uno.</p>`}
        <div class="row cp-sources">
          <button class="btn ghost sm" onClick=${() => pick('Compagno dal bestiario', 'Qualsiasi creatura: cavalcatura, gregario, animale domestico…', [...monsters].sort((a, b) => a.name.localeCompare(b.name)), (m) => addComp(m, { label: 'Compagno', kind: 'companion' }), 'Aggiungi')} data-testid="companion-any">+ Dal bestiario</button>
          <button class="btn ghost sm" onClick=${() => setCustom(true)} data-testid="companion-custom">+ Personalizzato</button>
        </div>
        ${!companions.length ? html`<p class="faint cs-small">Nessun compagno.</p>` : companions.map((comp) => html`<${CompanionCard} key=${comp.id} comp=${comp} c=${c} mutate=${mutate} data=${data} />`)}
      </${Panel}>
    </div>
    ${picker && html`<${CreaturePicker} open=${true} ...${picker} onClose=${() => setPicker(null)} />`}
    <${CustomCompanionModal} open=${custom} onClose=${() => setCustom(false)}
      onSave=${(f) => mutate((d) => { d.companions = [...(d.companions || []), CP.makeCompanion(null, { kind: 'companion', source: 'Personalizzato', name: f.name, custom: f })]; })} />
  </div>`;
}
