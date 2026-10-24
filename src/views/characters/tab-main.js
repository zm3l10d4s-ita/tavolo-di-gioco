// Tab "Principale": caratteristiche, tiri salvezza, abilità, passive, identità, classi, competenze e linguaggi.
import { html, useState } from '../../vendor/preact-htm.js';
import { useCollection } from '../../lib/hooks.js';
import { Panel, Select, ConfirmButton } from '../../components/ui.js';
import * as R from '../../lib/rules.js';
import { signed, norm } from '../../lib/util.js';
import { ABILITIES, cycleProf, ALIGNMENTS, subclassLevel } from './logic.js';
import { ProfDot, RollBtn, rollCheck, Inline, InlineNum } from './widgets.js';

const AB = R.ABILITY_LABELS_IT;

function Abilities({ c, mutate }) {
  return html`<${Panel} title="Caratteristiche" className="cs-abilities" actions=${html`<span class="faint cs-small">TS</span>`}>
    ${ABILITIES.map((a) => {
      const score = c.abilities[a].score;
      const mod = R.abilityModOf(c, a);
      const save = R.saveBonus(c, a);
      return html`<div class="cs-ab" data-testid=${'ability-' + a}>
        <div class="cs-ab-name"><b>${AB[a].abbr}</b><span>${AB[a].name}</span></div>
        <${RollBtn} className="cs-ab-mod" bonus=${mod} testid=${'ability-mod-' + a} onRoll=${(e) => rollCheck(c, `Prova di ${AB[a].name}`, mod, e)} />
        <${InlineNum} className="cs-ab-score" value=${score} min=${1} max=${30} testid=${'ability-score-' + a} title="Punteggio"
          onInput=${(v) => mutate((d) => { d.abilities[a].score = v; })} />
        <div class="cs-ab-save">
          <${ProfDot} value=${c.abilities[a].saveProf ? 1 : 0} testid=${'save-prof-' + a} title=${'TS ' + AB[a].name}
            onClick=${() => mutate((d) => { d.abilities[a].saveProf = !d.abilities[a].saveProf; })} />
          <${RollBtn} bonus=${save} testid=${'save-' + a} onRoll=${(e) => rollCheck(c, `TS ${AB[a].name}`, save, e, 'save')} />
        </div>
      </div>`;
    })}
  </${Panel}>`;
}

function Skills({ c, mutate, data }) {
  const [edit, setEdit] = useState(false);
  const name = (id) => data.skills.find((x) => x.id === id)?.name_it || R.SKILLS[id]?.name_it || id;
  const ids = Object.keys(R.SKILLS).sort((a, b) => name(a).localeCompare(name(b), 'it'));
  return html`<${Panel} title="Abilità" className="cs-skills"
    actions=${html`<button class="btn ghost sm ${edit ? 'on' : ''}" onClick=${() => setEdit(!edit)} title="Bonus extra per abilità">${edit ? 'Fine' : '± bonus'}</button>`}>
    <div class="cs-skill-list">
      ${ids.map((id) => {
        const s = c.skills[id] || {};
        const b = R.skillBonus(c, id);
        return html`<div class="cs-skill ${s.prof ? 'prof' : ''}" data-testid=${'skill-' + id}>
          <${ProfDot} value=${s.prof || 0} testid=${'skill-prof-' + id} title=${name(id)}
            onClick=${() => mutate((d) => { d.skills[id] = { bonus: 0, ...(d.skills[id] || {}), prof: cycleProf(d.skills[id]?.prof || 0) }; })} />
          <${RollBtn} bonus=${b} testid=${'skill-bonus-' + id} onRoll=${(e) => rollCheck(c, name(id), b, e, 'skill')} />
          <span class="cs-skill-name" onClick=${(e) => rollCheck(c, name(id), b, e, 'skill')}>${name(id)}</span>
          <span class="cs-skill-ab faint">${AB[R.SKILLS[id].ability].abbr}</span>
          ${edit && html`<${InlineNum} className="cs-skill-extra" value=${s.bonus || 0} title="Bonus extra"
            onInput=${(v) => mutate((d) => { d.skills[id] = { prof: 0, ...(d.skills[id] || {}), bonus: v || 0 }; })} />`}
        </div>`;
      })}
    </div>
    <div class="cs-legend faint cs-small"><span class="cs-prof p0"></span> nessuna <span class="cs-prof ph"></span> mezza <span class="cs-prof p1"></span> competenza <span class="cs-prof p2"></span> maestria</div>
  </${Panel}>`;
}

function Passives({ c }) {
  return html`<${Panel} title="Passive" className="cs-passives">
    <div class="cs-passive-grid">
      ${[['perception', 'Saggezza (Percezione)'], ['insight', 'Saggezza (Intuizione)'], ['investigation', 'Intelligenza (Indagare)']].map(([id, l]) => html`
        <div class="cs-passive" data-testid=${'passive-' + id}><b>${R.passive(c, id)}</b><span>${l}</span></div>`)}
    </div>
  </${Panel}>`;
}

/** Campo con suggerimenti SRD (datalist): scegliendo un nome SRD collega anche l'id. */
function LinkedName({ label, value, items, onPick, testid, placeholder }) {
  const listId = 'dl-' + label.replace(/\W/g, '');
  return html`<label class="field"><span class="field-label">${label}</span>
    <input class="input" list=${listId} value=${value || ''} placeholder=${placeholder} data-testid=${testid}
      onInput=${(e) => {
        const v = e.currentTarget.value;
        const hit = items.find((x) => norm(x.name_it || x.name) === norm(v) || norm(x.name) === norm(v));
        onPick({ id: hit ? hit.id : '', name: hit ? hit.name_it || hit.name : v, item: hit || null });
      }} />
    <datalist id=${listId}>${items.map((x) => html`<option value=${x.name_it || x.name}>${x.source === 'Homebrew' ? 'homebrew' : x.source}</option>`)}</datalist>
  </label>`;
}

function Identity({ c, mutate, data }) {
  const campaigns = useCollection('campaigns');
  const rs = (x) => !x.ruleset || x.ruleset === c.ruleset;
  const lvl = R.totalLevel(c);
  const xpLvl = R.levelForXp(c.xp);
  const next = R.xpForNextLevel(lvl);
  const set = (k) => (v) => mutate((d) => { d[k] = v; });
  return html`<${Panel} title="Personaggio" className="cs-identity">
    <div class="cs-form">
      <label class="field cs-span2"><span class="field-label">Nome</span><${Inline} value=${c.name} onInput=${set('name')} testid="field-name" /></label>
      <label class="field"><span class="field-label">Giocatore</span><${Inline} value=${c.player} onInput=${set('player')} /></label>
      <${LinkedName} label="Razza" value=${c.race.name} items=${data.races.filter(rs)} testid="field-race"
        onPick=${(p) => mutate((d) => { d.race = { id: p.id, name: p.name }; if (p.item?.speed) d.speed.walk = p.item.speed; })} />
      <${LinkedName} label="Sottorazza" value=${c.subrace?.name} items=${data.subraces.filter((x) => !c.race.id || x.raceId === c.race.id)}
        onPick=${(p) => mutate((d) => { d.subrace = p.name ? { id: p.id, name: p.name } : null; })} />
      <${LinkedName} label="Background" value=${c.background.name} items=${data.backgrounds.filter(rs)}
        onPick=${(p) => mutate((d) => { d.background = { id: p.id, name: p.name }; })} />
      <label class="field"><span class="field-label">Allineamento</span>
        <input class="input" list="dl-align" value=${c.alignment} onInput=${(e) => set('alignment')(e.currentTarget.value)} />
        <datalist id="dl-align">${ALIGNMENTS.map((a) => html`<option value=${a} />`)}</datalist></label>
      <label class="field"><span class="field-label">Sesso</span><${Inline} value=${c.gender} onInput=${set('gender')} /></label>
      <label class="field"><span class="field-label">Punti esperienza</span>
        <${InlineNum} value=${c.xp} min=${0} onInput=${(v) => set('xp')(v || 0)} title=${next ? `Prossimo livello a ${next} PE` : 'Livello massimo'} />
        ${c.xp > 0 && xpLvl > lvl && html`<span class="tag good cs-small">PE per il livello ${xpLvl}!</span>`}</label>
      <${Select} label="Regole" value=${c.ruleset} onChange=${set('ruleset')} options=${[{ value: '2014', label: '2014 (SRD 5.1)' }, { value: '2024', label: '2024 (SRD 5.2)' }]} />
      <${Select} label="Campagna" value=${c.campaignId || ''} onChange=${(v) => mutate((d) => { d.campaignId = v || null; })}
        options=${[{ value: '', label: 'Nessuna' }, ...campaigns.map((x) => ({ value: x.id, label: x.name || 'Campagna' }))]} />
    </div>
  </${Panel}>`;
}

function Classes({ c, mutate, data }) {
  const rs = (x) => !x.ruleset || x.ruleset === c.ruleset;
  const setCls = (i, fn) => mutate((d) => { const e = { ...d.classes[i] }; fn(e); d.classes[i] = e; });
  return html`<${Panel} title="Classi e livelli" className="cs-classes"
    actions=${html`<button class="btn ghost sm" data-testid="add-class" onClick=${() => mutate((d) => { d.classes.push({ classId: '', name: 'Nuova classe', subclassId: '', subclassName: '', level: 1, hitDie: 8 }); })}>+ Classe</button>`}>
    ${!c.classes.length && html`<p class="faint">Nessuna classe: aggiungine una o usa «▲ Livello».</p>`}
    ${c.classes.map((e, i) => {
      const subs = data.subclasses.filter((s) => s.classId === e.classId);
      const subLvl = e.classId ? subclassLevel(e.classId, data.subclasses) : 1;
      return html`<div class="cs-class-row" data-testid="class-row">
        <${LinkedName} label="Classe" value=${e.name} items=${data.classes.filter(rs)}
          onPick=${(p) => setCls(i, (x) => { x.name = p.name; x.classId = p.id; if (p.item) x.hitDie = p.item.hitDie; if (p.id !== e.classId) { x.subclassId = ''; } })} />
        <label class="field cs-w-num"><span class="field-label">Livello</span>
          <${InlineNum} value=${e.level} min=${1} max=${20} testid="class-level" onInput=${(v) => setCls(i, (x) => { x.level = v || 1; })} /></label>
        <label class="field cs-w-num"><span class="field-label">Dado vita</span>
          <select class="input cs-inline" value=${String(e.hitDie || 8)} onChange=${(ev) => setCls(i, (x) => { x.hitDie = Number(ev.currentTarget.value); })}>
            ${[4, 6, 8, 10, 12].map((dd) => html`<option value=${String(dd)}>d${dd}</option>`)}</select></label>
        ${subs.length > 0 && e.level >= subLvl
          ? html`<label class="field"><span class="field-label">Sottoclasse</span>
              <select class="input cs-inline" value=${e.subclassId || ''} onChange=${(ev) => setCls(i, (x) => { const s = subs.find((q) => q.id === ev.currentTarget.value); x.subclassId = s?.id || ''; x.subclassName = s ? s.name_it || s.name : x.subclassName; })}>
                <option value="">— libera —</option>${subs.map((s) => html`<option value=${s.id}>${s.name_it || s.name}</option>`)}</select></label>`
          : ''}
        <label class="field"><span class="field-label">${subs.length && e.level >= subLvl ? 'Nome libero' : 'Sottoclasse'}</span>
          <${Inline} value=${e.subclassName} placeholder=${subs.length && e.level < subLvl ? `dal ${subLvl}° livello` : ''} onInput=${(v) => setCls(i, (x) => { x.subclassName = v; })} /></label>
        <${ConfirmButton} variant="ghost" onConfirm=${() => mutate((d) => { d.classes.splice(i, 1); })} confirmText="Rimuovi?">✕</${ConfirmButton}>
      </div>`;
    })}
  </${Panel}>`;
}

function TagList({ items, onChange, placeholder, testid, suggestions = [] }) {
  const [v, setV] = useState('');
  const listId = testid ? 'dl-' + testid : undefined;
  const add = () => { const t = v.trim(); if (t && !items.includes(t)) onChange([...items, t]); setV(''); };
  return html`<div class="cs-taglist" data-testid=${testid}>
    ${items.map((t) => html`<span class="tag">${t}<button class="cs-x" title="Rimuovi" onClick=${() => onChange(items.filter((x) => x !== t))}>✕</button></span>`)}
    <input class="input cs-inline cs-tag-add" list=${listId} value=${v} placeholder=${placeholder} onInput=${(e) => setV(e.currentTarget.value)}
      onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur=${add} />
    ${suggestions.length > 0 && html`<datalist id=${listId}>${suggestions.map((s) => html`<option value=${s} />`)}</datalist>`}
  </div>`;
}

const ARMOR_STD = ['Armature leggere', 'Armature medie', 'Armature pesanti', 'Scudi'];
const WEAPON_STD = ['Armi semplici', 'Armi da guerra'];
function Proficiencies({ c, mutate, data }) {
  const p = c.proficiencies;
  const setList = (k) => (v) => mutate((d) => { d.proficiencies[k] = v; });
  const toggle = (k, name) => mutate((d) => { const l = d.proficiencies[k]; d.proficiencies[k] = l.includes(name) ? l.filter((x) => x !== name) : [...l, name]; });
  const langs = (data.languages || []).map((l) => l.name_it || l.name);
  return html`<${Panel} title="Competenze e linguaggi" className="cs-profs">
    <div class="cs-prof-group"><span class="field-label">Armature</span>
      <div class="row cs-checks">${ARMOR_STD.map((a) => html`<label class="check"><input type="checkbox" checked=${p.armor.includes(a)} onChange=${() => toggle('armor', a)} /><span>${a.replace('Armature ', '')}</span></label>`)}</div>
      <${TagList} items=${p.armor.filter((x) => !ARMOR_STD.includes(x))} placeholder="altro…" onChange=${(v) => setList('armor')([...p.armor.filter((x) => ARMOR_STD.includes(x)), ...v])} /></div>
    <div class="cs-prof-group"><span class="field-label">Armi</span>
      <div class="row cs-checks">${WEAPON_STD.map((a) => html`<label class="check"><input type="checkbox" checked=${p.weapons.includes(a)} onChange=${() => toggle('weapons', a)} /><span>${a.replace('Armi ', '')}</span></label>`)}</div>
      <${TagList} items=${p.weapons.filter((x) => !WEAPON_STD.includes(x))} placeholder="altre armi…" onChange=${(v) => setList('weapons')([...p.weapons.filter((x) => WEAPON_STD.includes(x)), ...v])} /></div>
    <div class="cs-prof-group"><span class="field-label">Strumenti</span><${TagList} items=${p.tools} placeholder="aggiungi…" onChange=${setList('tools')} /></div>
    <div class="cs-prof-group"><span class="field-label">Linguaggi</span><${TagList} items=${p.languages} placeholder="aggiungi…" onChange=${setList('languages')} testid="languages" suggestions=${langs} /></div>
    <label class="field"><span class="field-label">Sensi (visione)</span><${Inline} value=${c.senses} placeholder="es. Scurovisione 18 m" onInput=${(v) => mutate((d) => { d.senses = v; })} testid="field-senses" /></label>
    <label class="field"><span class="field-label">Altre competenze</span><${Inline} value=${p.other} onInput=${(v) => mutate((d) => { d.proficiencies.other = v; })} /></label>
  </${Panel}>`;
}

export function MainTab(ctx) {
  return html`<div class="cs-grid-main">
    <div class="cs-col-a"><${Abilities} ...${ctx} /><${Passives} ...${ctx} /></div>
    <div class="cs-col-b"><${Skills} ...${ctx} /></div>
    <div class="cs-col-c"><${Identity} ...${ctx} /><${Classes} ...${ctx} /><${Proficiencies} ...${ctx} /></div>
  </div>`;
}
