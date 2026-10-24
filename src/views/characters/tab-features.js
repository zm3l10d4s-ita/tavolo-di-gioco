// Tab "Privilegi": privilegi (classe/razza/background/talento/altro) e talenti, con pre-compilazione dai dati SRD.
import { html, useState, useMemo } from '../../vendor/preact-htm.js';
import { Panel, Select, ConfirmButton, toast } from '../../components/ui.js';
import * as R from '../../lib/rules.js';
import { uid, norm } from '../../lib/util.js';
import { missingClassFeatures, raceFeatures } from './logic.js';
import { Inline, LazyText } from './widgets.js';

const SOURCES = [
  { value: 'class', label: 'Privilegi di classe' }, { value: 'race', label: 'Tratti razziali' },
  { value: 'background', label: 'Background' }, { value: 'feat', label: 'Da talento' }, { value: 'other', label: 'Altro' },
];

function FeatureCard({ f, onChange, onRemove, testid = 'feature-row' }) {
  const [open, setOpen] = useState(false);
  const first = String(f.text || '').split('\n')[0];
  return html`<div class="cs-feat ${open ? 'open' : ''}" data-testid=${testid}>
    <div class="cs-feat-head" onClick=${() => setOpen(!open)}>
      <span class="cs-feat-tw">${open ? '▾' : '▸'}</span>
      <b class="cs-feat-name">${f.name || html`<i class="faint">senza nome</i>`}</b>
      ${f.origin && html`<span class="tag">${f.origin}</span>`}
      ${!open && first && html`<span class="faint cs-small cs-ellipsis">${first}</span>`}
    </div>
    ${open && html`<div class="cs-feat-body">
      <div class="cs-form cs-form-3">
        <label class="field cs-span2"><span class="field-label">Nome</span><${Inline} value=${f.name} onInput=${(v) => onChange({ name: v })} /></label>
        ${f.source !== undefined && html`<${Select} label="Fonte" value=${f.source || 'other'} options=${SOURCES} onChange=${(v) => onChange({ source: v })} />`}
      </div>
      <${LazyText} label="Descrizione" value=${f.text} rows=${Math.min(14, Math.max(3, Math.ceil(String(f.text || '').length / 110)))} onCommit=${(v) => onChange({ text: v })} />
      <div class="row"><span class="spacer"></span><${ConfirmButton} onConfirm=${onRemove} confirmText="Eliminare?">Elimina</${ConfirmButton}></div>
    </div>`}
  </div>`;
}

export function FeaturesTab({ c, mutate, data }) {
  const lvl = Math.max(1, R.totalLevel(c));
  const raceD = data.races.find((x) => x.id === c.race.id);
  const subD = c.subrace?.id ? data.subraces.find((x) => x.id === c.subrace.id) : null;
  const bgD = data.backgrounds.find((x) => x.id === c.background.id);
  const missing = missingClassFeatures(c, data.classes, data.subclasses);
  const raceMissing = raceFeatures(raceD, subD).filter((f) => !c.features.some((x) => norm(x.name) === norm(f.name)));
  const [featQ, setFeatQ] = useState('');
  const setF = (i, p) => mutate((d) => { d.features[i] = { ...d.features[i], ...p }; });
  const featOptions = data.feats.filter((x) => x._homebrew || R.matchesRuleset(x, c.ruleset));

  const addClass = () => { mutate((d) => { d.features.push(...missingClassFeatures(d, data.classes, data.subclasses)); }); toast(`Aggiunti ${missing.length} privilegi di classe`, 'good'); };
  const addRace = () => { mutate((d) => { d.features.push(...raceMissing); }); toast(`Aggiunti ${raceMissing.length} tratti razziali`, 'good'); };
  const addBg = () => mutate((d) => { d.features.push({ id: uid(), name: bgD.feature.name, source: 'background', origin: bgD.name, text: bgD.feature.desc }); });
  const addFeat = (v) => {
    const f = featOptions.find((x) => norm(x.name) === norm(v) || norm(x.name_it) === norm(v));
    mutate((d) => { d.feats.push({ id: uid(), featId: f?.id || null, name: f ? f.name : v, text: f?.desc || '' }); });
    setFeatQ('');
  };
  return html`<div class="cs-grid-2 cs-features">
    <div class="cs-col">
      <${Panel} title="Privilegi e tratti" actions=${html`<button class="btn ghost sm" data-testid="add-feature" onClick=${() => mutate((d) => { d.features.push({ id: uid(), name: 'Nuovo privilegio', source: 'other', text: '' }); })}>+ Privilegio</button>`}>
        <div class="cs-prefill row">
          <button class="btn sm" disabled=${!missing.length} onClick=${addClass} data-testid="prefill-class"
            title=${missing.map((f) => f.name).join(', ')}>Aggiungi privilegi di classe fino al livello ${c.classes.length === 1 ? c.classes[0].level : lvl}${missing.length ? ` (${missing.length})` : ''}</button>
          <button class="btn sm" disabled=${!raceMissing.length} onClick=${addRace} data-testid="prefill-race" title=${raceMissing.map((f) => f.name).join(', ')}>
            Aggiungi tratti razziali${raceMissing.length ? ` (${raceMissing.length})` : ''}</button>
          ${bgD?.feature && !c.features.some((x) => norm(x.name) === norm(bgD.feature.name)) && html`<button class="btn sm" onClick=${addBg}>Privilegio del background</button>`}
          ${!c.classes.some((e) => e.classId) && html`<span class="faint cs-small">Classe senza dati SRD: inserisci i privilegi a mano.</span>`}
        </div>
        ${SOURCES.map((s) => {
          const list = c.features.map((f, i) => ({ f, i })).filter(({ f }) => (f.source || 'other') === s.value);
          if (!list.length) return null;
          return html`<div class="cs-feat-group"><h4 class="cs-group-title">${s.label} <span class="faint">${list.length}</span></h4>
            ${list.map(({ f, i }) => html`<${FeatureCard} key=${f.id || i} f=${f} onChange=${(p) => setF(i, p)} onRemove=${() => mutate((d) => { d.features.splice(i, 1); })} />`)}</div>`;
        })}
        ${!c.features.length && html`<p class="faint">Nessun privilegio. Usa i pulsanti sopra per importare quelli SRD, o aggiungili a mano.</p>`}
      </${Panel}>
    </div>
    <div class="cs-col">
      <${Panel} title="Talenti">
        <div class="row" style="flex-wrap:nowrap">
          <input class="input" list="dl-feats" value=${featQ} placeholder="Nome talento (SRD o libero)…" data-testid="feat-input"
            onInput=${(e) => setFeatQ(e.currentTarget.value)} onKeyDown=${(e) => e.key === 'Enter' && featQ.trim() && addFeat(featQ.trim())} />
          <datalist id="dl-feats">${featOptions.map((f) => html`<option value=${f.name}>${[f.type_it, c.ruleset === 'mix' && f.ruleset].filter(Boolean).join(' · ')}</option>`)}</datalist>
          <button class="btn sm" disabled=${!featQ.trim()} onClick=${() => addFeat(featQ.trim())} data-testid="feat-add">Aggiungi</button>
        </div>
        ${c.feats.map((f, i) => html`<${FeatureCard} key=${f.id || i} testid="feat-row" f=${{ ...f, source: undefined }}
          onChange=${(p) => mutate((d) => { d.feats[i] = { ...d.feats[i], ...p }; })} onRemove=${() => mutate((d) => { d.feats.splice(i, 1); })} />`)}
        ${!c.feats.length && html`<p class="faint cs-small">Nessun talento.</p>`}
      </${Panel}>
    </div>
  </div>`;
}
