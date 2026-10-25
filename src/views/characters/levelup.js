// Modale "Livello su": classe esistente o multiclasse, PF (media o tiro), sottoclasse, nuovi privilegi SRD, slot e risorse aggiornati.
import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { Modal, Button, Select, toast } from '../../components/ui.js';
import * as R from '../../lib/rules.js';
import { roll, signed, uid } from '../../lib/util.js';
import { levelUp, featuresAtLevel, subclassLevel, hpGainForLevel, applySuggestedResources, syncSlots, effectiveSlots, levelUpReminders } from './logic.js';
import { Inline } from './widgets.js';

const NEW = '__new';
const AB_OPTS = R.ABILITIES.map((a) => ({ value: a, label: R.ABILITY_LABELS_IT[a].name }));
const FEAT_TYPES = { asi: null, boon: 'epic-boon', style: 'fighting-style' };

/** Scelta di aumento dei punteggi / talento / dono epico / stile di combattimento direttamente nel passaggio di livello. */
function Chooser({ r, value = {}, onChange, c, data, totalLevel }) {
  const v = { mode: 'later', ...value };
  const set = (p) => onChange({ ...v, ...p });
  const type = FEAT_TYPES[r.chooser];
  const feats = (data.feats || []).filter((f) => (f._homebrew || R.matchesRuleset(f, c.ruleset))
      && (type ? f.type === type || (r.chooser === 'boon' && f.type === 'general') : !['epic-boon', 'fighting-style', 'origin'].includes(f.type))
      && !(f.prerequisites || []).some((p) => p.minLevel && p.minLevel > totalLevel))
    .sort((a, b) => (b.type === type) - (a.type === type) || a.name.localeCompare(b.name));
  const modes = r.chooser === 'asi'
    ? [{ value: 'later', label: 'Scelgo più tardi' }, { value: 'plus2', label: '+2 a una caratteristica' }, { value: 'plus11', label: '+1 a due caratteristiche' }, { value: 'feat', label: 'Un talento' }]
    : [{ value: 'later', label: 'Scelgo più tardi' }, { value: 'feat', label: r.chooser === 'style' ? 'Scegli lo stile' : 'Scegli il talento' }];
  const sc = (a) => c.abilities?.[a]?.score || 10;
  return html`<div class="cs-lu-chooser" data-testid=${'lu-chooser-' + r.chooser}>
    <${Select} value=${v.mode} options=${modes} onChange=${(m) => set({ mode: m })} data-testid=${'lu-mode-' + r.chooser} />
    ${(v.mode === 'plus2' || v.mode === 'plus11') && html`<${Select} value=${v.a1 || ''} onChange=${(a) => set({ a1: a })} data-testid="lu-a1"
      options=${[{ value: '', label: v.mode === 'plus2' ? '+2 a…' : '+1 a…' }, ...AB_OPTS.map((o) => ({ ...o, label: `${o.label} (${sc(o.value)})` }))]} />`}
    ${v.mode === 'plus11' && html`<${Select} value=${v.a2 || ''} onChange=${(a) => set({ a2: a })} data-testid="lu-a2"
      options=${[{ value: '', label: '+1 a…' }, ...AB_OPTS.filter((o) => o.value !== v.a1).map((o) => ({ ...o, label: `${o.label} (${sc(o.value)})` }))]} />`}
    ${v.mode === 'feat' && html`<${Select} value=${v.featId || ''} onChange=${(id) => set({ featId: id })} data-testid="lu-feat"
      options=${[{ value: '', label: `— ${feats.length} disponibili —` }, ...feats.map((f) => ({ value: f.id, label: `${f.name}${R.versionTag(f, c.ruleset)}${f._catalog ? ` (${f.sourceKey})` : ''}${f.prerequisiteText ? ' · ' + f.prerequisiteText : ''}` }))]} />`}
    ${(v.mode === 'plus2' && v.a1 && sc(v.a1) + 2 > 20) || (v.mode === 'plus11' && [v.a1, v.a2].some((a) => a && sc(a) + 1 > 20)) ? html`<span class="tag bad">Massimo 20</span>` : ''}
  </div>`;
}
const choiceDone = (r, v) => {
  if (!r.chooser || !v || v.mode === 'later') return false;
  if (v.mode === 'plus2') return !!v.a1;
  if (v.mode === 'plus11') return !!v.a1 && !!v.a2 && v.a1 !== v.a2;
  if (v.mode === 'feat') return !!v.featId;
  return false;
};

export function LevelUpModal({ open, onClose, c, mutate, data }) {
  const [sel, setSel] = useState('0');
  const [newId, setNewId] = useState('');
  const [custom, setCustom] = useState({ name: '', hitDie: 8 });
  const [method, setMethod] = useState('avg');
  const [rolled, setRolled] = useState(null);
  const [subId, setSubId] = useState('');
  const [skip, setSkip] = useState({});
  const [choices, setChoices] = useState({});
  useEffect(() => { if (open) { setSel(c.classes.length ? '0' : NEW); setMethod('avg'); setRolled(null); setSubId(''); setSkip({}); setChoices({}); } }, [open]);
  if (!open) return null;

  const isNew = sel === NEW;
  const clsOpts = data.classes.filter((x) => x._homebrew || R.matchesRuleset(x, c.ruleset));
  const newD = clsOpts.find((x) => x.id === newId);
  const entry = isNew
    ? { classId: newD?.id || '', name: newD ? newD.name_it || newD.name : custom.name || 'Nuova classe', hitDie: newD?.hitDie || custom.hitDie, level: 0, subclassId: '' }
    : c.classes[Number(sel)];
  const newLevel = (Number(entry?.level) || 0) + 1;
  const firstEver = R.totalLevel(c) === 0;
  const subs = data.subclasses.filter((s) => s.classId === entry?.classId);
  const subLvl = entry?.classId ? subclassLevel(entry.classId, data.subclasses) : 99;
  const needSub = subs.length > 0 && !entry?.subclassId && newLevel >= subLvl;
  const chosenSub = subId || entry?.subclassId || '';
  const feats = entry?.classId ? featuresAtLevel(entry.classId, chosenSub, newLevel, data.classes, data.subclasses) : [];
  // se la sottoclasse viene scelta ora a un livello superiore a quello d'ingresso, aggiunge anche i suoi privilegi precedenti
  if (subId && newLevel > subLvl) {
    const sd = data.subclasses.find((s) => s.id === subId);
    for (const f of sd?.features || []) if (f.level < newLevel) feats.push({ id: 'sub-' + f.id, name: f.name, source: 'class', level: f.level, origin: `${sd.name} ${f.level}`, text: f.desc || '' });
  }
  const { gain: avgGain } = hpGainForLevel(c, entry?.hitDie, 'avg');
  const gainPreview = firstEver ? Math.max(1, (Number(entry?.hitDie) || 8) + R.abilityModOf(c, 'con'))
    : method === 'roll' && rolled != null ? hpGainForLevel(c, entry?.hitDie, 'roll', rolled).gain : avgGain;
  const lvlRow = data.levels.find((l) => l.id === `${entry?.classId}-${newLevel}`);
  const reminders = entry ? levelUpReminders(c, { classId: entry.classId, subclassId: chosenSub, newLevel, isNew, newSubclassChosen: !!subId }, data) : [];
  if (needSub && !subId) reminders.unshift({ id: 'subclass', kind: 'choice', title: 'Sottoclasse', text: `Al ${subLvl}° livello scegli la sottoclasse.` });
  const totalAfter = R.totalLevel(c) + 1;

  const confirm = () => {
    let res, resInfo, slotsBefore = effectiveSlots(c, data.classes), slotsAfter;
    mutate((d) => {
      res = levelUp(d, {
        classIndex: isNew ? 0 : Number(sel), newClass: isNew ? { classId: entry.classId, name: entry.name, hitDie: entry.hitDie } : null,
        hpMethod: method === 'roll' && rolled != null ? 'roll' : 'avg', hpRoll: rolled,
        subclass: subId ? { id: subId, name: (() => { const s = subs.find((q) => q.id === subId); return s ? s.name_it || s.name : ''; })() } : null,
      });
      let x = res.character;
      x.features = [...x.features, ...feats.filter((f) => !skip[f.id]).map((f) => ({ ...f, id: Math.random().toString(36).slice(2, 10) }))];
      resInfo = applySuggestedResources(x, data.levels);
      x = syncSlots(resInfo.character, data.classes);
      slotsAfter = effectiveSlots(x, data.classes);
      // scelte fatte qui (aumento dei punteggi, talento, stile, dono epico)
      for (const r of reminders) {
        const v = choices[r.id];
        if (!choiceDone(r, v)) continue;
        if (v.mode === 'plus2') x.abilities[v.a1] = { ...x.abilities[v.a1], score: Math.min(20, (x.abilities[v.a1]?.score || 10) + 2) };
        if (v.mode === 'plus11') for (const a of [v.a1, v.a2]) x.abilities[a] = { ...x.abilities[a], score: Math.min(20, (x.abilities[a]?.score || 10) + 1) };
        if (v.mode === 'feat') { const f = (data.feats || []).find((q) => q.id === v.featId); if (f) x.feats = [...(x.feats || []), { id: uid(), featId: f.id, name: f.name, text: f.desc || '' }]; }
      }
      // promemoria che restano sulla scheda finché non li segni come fatti
      const label = `${entry.name} ${res.newLevel}`;
      const todo = reminders.filter((r) => r.kind !== 'info' && !choiceDone(r, choices[r.id]) && !(r.id === 'subclass' && subId))
        .map((r) => ({ id: uid(), key: r.id, level: label, kind: r.kind, title: r.title, text: r.text, createdAt: new Date().toISOString() }));
      x.todo = [...(x.todo || []), ...todo];
      return x;
    });
    const newSlots = [];
    for (let i = 1; i <= 9; i++) if (slotsAfter.slots[i].max > slotsBefore.slots[i].max) newSlots.push(`${i}°: ${slotsBefore.slots[i].max}→${slotsAfter.slots[i].max}`);
    const left = reminders.filter((r) => r.kind !== 'info' && !choiceDone(r, choices[r.id]) && !(r.id === 'subclass' && subId)).length;
    toast(`${entry.name} ${res.newLevel}: +${res.hpGain} PF${left ? ` · ${left} ${left === 1 ? 'cosa' : 'cose'} da fare (in cima alla scheda)` : ''}${newSlots.length ? ` · slot ${newSlots.join(', ')}` : ''}${resInfo.added.length || resInfo.updated.length ? ` · risorse: ${[...resInfo.added, ...resInfo.updated].join(', ')}` : ''}`, 'good');
    onClose();
  };

  return html`<${Modal} open=${open} title="Sali di livello" onClose=${onClose} wide>
    <div class="cs-levelup" data-testid="levelup-modal">
      <div class="cs-form cs-form-3">
        <${Select} label="Classe" value=${sel} onChange=${(v) => { setSel(v); setSubId(''); }} data-testid="levelup-class"
          options=${[...c.classes.map((e, i) => ({ value: String(i), label: `${e.name} ${e.level} → ${Number(e.level) + 1}` })), { value: NEW, label: '+ Nuova classe (multiclasse)…' }]} />
        ${isNew && html`<${Select} label="Nuova classe" value=${newId} onChange=${setNewId}
          options=${[{ value: '', label: 'Altro / homebrew' }, ...clsOpts.filter((x) => !c.classes.some((e) => e.classId === x.id)).map((x) => ({ value: x.id, label: `${x.name_it || x.name}${R.versionTag(x, c.ruleset)} (d${x.hitDie})` }))]} />`}
        ${isNew && !newD && html`<label class="field"><span class="field-label">Nome / dado vita</span><span class="row" style="flex-wrap:nowrap">
          <${Inline} value=${custom.name} placeholder="Nome classe" onInput=${(v) => setCustom({ ...custom, name: v })} />
          <select class="input cs-inline" value=${String(custom.hitDie)} onChange=${(e) => setCustom({ ...custom, hitDie: Number(e.currentTarget.value) })}>${[6, 8, 10, 12].map((d) => html`<option value=${String(d)}>d${d}</option>`)}</select></span></label>`}
        ${isNew && newD?.multiclassing?.prerequisites?.length > 0 && html`<p class="faint cs-small">Prerequisiti: ${newD.multiclassing.prerequisites.map((p) => `${R.ABILITY_LABELS_IT[p.ability]?.abbr} ${p.min}`).join(', ')}
          ${newD.multiclassing.prerequisites.every((p) => (c.abilities[p.ability]?.score || 10) >= p.min) ? '✓' : html` <span class="bad-t">non soddisfatti</span>`}</p>`}
      </div>

      <div class="cs-lu-hp">
        <span class="field-label">Punti ferita</span>
        ${firstEver ? html`<span>Primo livello: dado pieno + COS = <b>${gainPreview}</b></span>` : html`
          <label class="check"><input type="radio" name="hpm" checked=${method === 'avg'} onChange=${() => setMethod('avg')} /><span>Media: ${(Number(entry?.hitDie) || 8) / 2 + 1} ${signed(R.abilityModOf(c, 'con'))} COS = <b>${avgGain}</b></span></label>
          <label class="check"><input type="radio" name="hpm" checked=${method === 'roll'} onChange=${() => setMethod('roll')} data-testid="levelup-roll-method" /><span>Tiro</span></label>
          ${method === 'roll' && html`<button class="btn sm" data-testid="levelup-roll" onClick=${() => setRolled(roll('1d' + (entry?.hitDie || 8)).total)}>🎲 1d${entry?.hitDie || 8}</button>
            <input class="input cs-inline cs-num" type="number" min="1" max=${entry?.hitDie || 8} value=${rolled ?? ''} placeholder="?" onInput=${(e) => setRolled(e.currentTarget.value === '' ? null : Math.max(1, Math.min(entry?.hitDie || 8, Number(e.currentTarget.value))))} />
            ${rolled != null && html`<span>= <b>${gainPreview}</b> PF</span>`}`}`}
        <span class="faint cs-small">PF massimi: ${R.maxHp(c)} → ${R.maxHp(c) + gainPreview}</span>
      </div>

      ${needSub && html`<${Select} label=${`Sottoclasse (si sceglie al ${subLvl}° livello)`} value=${subId} onChange=${setSubId} data-testid="levelup-subclass"
        options=${[{ value: '', label: '— scegli più tardi —' }, ...subs.map((s) => ({ value: s.id, label: s.name_it || s.name }))]} />`}

      ${lvlRow && html`<div class="row cs-small">
        <span class="tag">Competenza ${signed(R.profBonusForLevel(R.totalLevel(c) + 1))}</span>
        ${lvlRow.cantripsKnown != null && html`<span class="tag magic">Trucchetti ${lvlRow.cantripsKnown}</span>`}
        ${lvlRow.spellsKnown != null && html`<span class="tag magic">Incantesimi noti ${lvlRow.spellsKnown}</span>`}
        ${lvlRow.preparedSpells != null && html`<span class="tag magic">Preparati ${lvlRow.preparedSpells}</span>`}
        ${Object.entries(lvlRow.spellSlots || {}).some(([, v]) => v) && html`<span class="tag magic">Slot classe: ${Object.entries(lvlRow.spellSlots).filter(([, v]) => v).map(([k, v]) => `${k}°×${v}`).join(' ')}</span>`}
      </div>`}

      <div class="cs-lu-feats">
        <span class="field-label">Nuovi privilegi ${feats.length ? '(spunta per aggiungerli alla scheda)' : ''}</span>
        ${feats.length ? feats.map((f) => html`<label class="cs-lu-feat check">
            <input type="checkbox" checked=${!skip[f.id]} onChange=${() => setSkip({ ...skip, [f.id]: !skip[f.id] })} />
            <span><b>${f.name}</b> <span class="tag">${f.origin}</span><br /><span class="muted cs-small">${String(f.text).slice(0, 260)}${String(f.text).length > 260 ? '…' : ''}</span></span></label>`)
          : html`<p class="faint cs-small">${entry?.classId ? 'Nessun nuovo privilegio SRD a questo livello.' : 'Classe senza dati SRD: aggiungi i privilegi a mano.'}</p>`}
      </div>

      ${reminders.length > 0 && html`<div class="cs-lu-todo" data-testid="levelup-reminders">
        <span class="field-label">Da fare a questo livello</span>
        <ul>${reminders.map((r) => html`<li class=${'lu-r ' + r.kind + (choiceDone(r, choices[r.id]) ? ' done' : '')} data-testid=${'lu-r-' + r.id}>
          <span class="lu-r-ico">${r.kind === 'warn' ? '⚠' : r.kind === 'info' ? 'ℹ' : choiceDone(r, choices[r.id]) ? '✓' : '☐'}</span>
          <div><b>${r.title}</b> <span class="muted cs-small">${r.text}</span>
            ${r.chooser && html`<${Chooser} r=${r} value=${choices[r.id]} onChange=${(v) => setChoices({ ...choices, [r.id]: v })} c=${c} data=${data} totalLevel=${totalAfter} />`}</div>
        </li>`)}</ul>
        <p class="faint cs-small">Quello che non scegli qui resta come promemoria in cima alla scheda, finché non lo segni come fatto.</p>
      </div>`}

      <footer class="row"><span class="spacer"></span>
        <${Button} variant="ghost" onClick=${onClose}>Annulla</${Button}>
        <${Button} variant="primary" onClick=${confirm} disabled=${method === 'roll' && rolled == null && !firstEver} data-testid="levelup-confirm">Sali al livello ${newLevel}</${Button}>
      </footer>
    </div>
  </${Modal}>`;
}
