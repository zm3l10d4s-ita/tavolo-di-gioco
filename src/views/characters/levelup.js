// Modale "Livello su": classe esistente o multiclasse, PF (media o tiro), sottoclasse, nuovi privilegi SRD, slot e risorse aggiornati.
import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { Modal, Button, Select, toast } from '../../components/ui.js';
import * as R from '../../lib/rules.js';
import { roll, signed } from '../../lib/util.js';
import { levelUp, featuresAtLevel, subclassLevel, hpGainForLevel, applySuggestedResources, syncSlots, effectiveSlots } from './logic.js';
import { Inline } from './widgets.js';

const NEW = '__new';

export function LevelUpModal({ open, onClose, c, mutate, data }) {
  const [sel, setSel] = useState('0');
  const [newId, setNewId] = useState('');
  const [custom, setCustom] = useState({ name: '', hitDie: 8 });
  const [method, setMethod] = useState('avg');
  const [rolled, setRolled] = useState(null);
  const [subId, setSubId] = useState('');
  const [skip, setSkip] = useState({});
  useEffect(() => { if (open) { setSel(c.classes.length ? '0' : NEW); setMethod('avg'); setRolled(null); setSubId(''); setSkip({}); } }, [open]);
  if (!open) return null;

  const isNew = sel === NEW;
  const clsOpts = data.classes.filter((x) => x._homebrew || !x.ruleset || x.ruleset === c.ruleset);
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
  const asi = feats.some((f) => /ability score improvement/i.test(f.name));

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
      return x;
    });
    const newSlots = [];
    for (let i = 1; i <= 9; i++) if (slotsAfter.slots[i].max > slotsBefore.slots[i].max) newSlots.push(`${i}°: ${slotsBefore.slots[i].max}→${slotsAfter.slots[i].max}`);
    toast(`${entry.name} ${res.newLevel}: +${res.hpGain} PF${newSlots.length ? ` · slot ${newSlots.join(', ')}` : ''}${resInfo.added.length || resInfo.updated.length ? ` · risorse: ${[...resInfo.added, ...resInfo.updated].join(', ')}` : ''}`, 'good');
    onClose();
  };

  return html`<${Modal} open=${open} title="Sali di livello" onClose=${onClose} wide>
    <div class="cs-levelup" data-testid="levelup-modal">
      <div class="cs-form cs-form-3">
        <${Select} label="Classe" value=${sel} onChange=${(v) => { setSel(v); setSubId(''); }} data-testid="levelup-class"
          options=${[...c.classes.map((e, i) => ({ value: String(i), label: `${e.name} ${e.level} → ${Number(e.level) + 1}` })), { value: NEW, label: '+ Nuova classe (multiclasse)…' }]} />
        ${isNew && html`<${Select} label="Nuova classe" value=${newId} onChange=${setNewId}
          options=${[{ value: '', label: 'Altro / homebrew' }, ...clsOpts.filter((x) => !c.classes.some((e) => e.classId === x.id)).map((x) => ({ value: x.id, label: `${x.name_it || x.name} (d${x.hitDie})` }))]} />`}
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
        ${asi && html`<p class="cs-small"><span class="tag accent">Aumento dei punteggi</span> Ricorda di aggiornare le caratteristiche (o di scegliere un talento) nella scheda.</p>`}
      </div>

      <footer class="row"><span class="spacer"></span>
        <${Button} variant="ghost" onClick=${onClose}>Annulla</${Button}>
        <${Button} variant="primary" onClick=${confirm} disabled=${method === 'roll' && rolled == null && !firstEver} data-testid="levelup-confirm">Sali al livello ${newLevel}</${Button}>
      </footer>
    </div>
  </${Modal}>`;
}
