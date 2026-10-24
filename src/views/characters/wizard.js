// Creazione guidata del personaggio (modale a passi). Valori liberi/homebrew ammessi per razza, classe e background.
import { html, useState, useMemo } from '../../vendor/preact-htm.js';
import { useSrd, useCollection } from '../../lib/hooks.js';
import * as store from '../../lib/store.js';
import { Modal, Button, Select, TextField, toast } from '../../components/ui.js';
import * as R from '../../lib/rules.js';
import { signed, norm } from '../../lib/util.js';
import {
  ABILITIES, STANDARD_ARRAY, POINT_BUY_BUDGET, POINT_COST, pointBuyCost, roll4d6kh3, abilityBonuses, subclassLevel, buildCharacter,
  ALIGNMENTS,
} from './logic.js';
import { useUnits } from './widgets.js';

const STEPS = [
  { id: 'base', label: 'Base' }, { id: 'race', label: 'Razza' }, { id: 'class', label: 'Classe' }, { id: 'bg', label: 'Background' },
  { id: 'abilities', label: 'Caratteristiche' }, { id: 'skills', label: 'Competenze' }, { id: 'summary', label: 'Riepilogo' },
];
const CUSTOM = '__custom';
const AB = R.ABILITY_LABELS_IT;
// SRD: solo le voci delle regole scelte. Manuali (catalogo) e homebrew: sempre disponibili, ordinati dopo l'SRD.
// Con regole miste: tutte le voci SRD 2014 e 2024 (con l'anno accanto al nome) e anche i doppioni dei manuali.
const forRuleset = (items, rs) => {
  const srd = items.filter((x) => !x._catalog && !x._homebrew && R.matchesRuleset(x, rs));
  const rest = items.filter((x) => x._catalog || x._homebrew)
    .filter((x) => rs === 'mix' || !srd.some((y) => y.name === x.name && x._catalog)) // stesso nome già nell'SRD di queste regole
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return [...srd.sort((a, b) => String(a.name).localeCompare(String(b.name))), ...rest];
};
const optLabel = (x, rs, name, after = '') => name + R.versionTag(x, rs) + after + (x._homebrew ? ' (homebrew)' : x._catalog ? ` (${x.sourceKey || x.source || 'manuale'})` : '');
const itName = (x) => x?.name_it || x?.name || '';
const METHODS = [
  { value: 'standard', label: 'Serie standard (15, 14, 13, 12, 10, 8)' }, { value: 'pointbuy', label: `Acquisto a punti (${POINT_BUY_BUDGET})` },
  { value: 'roll', label: 'Tiro 4d6 (scarta il più basso)' }, { value: 'manual', label: 'Manuale' },
];

function initial(defaultCampaign) {
  return {
    step: 0, name: '', player: '', ruleset: ['2024', 'mix'].includes(store.getSetting('ruleset', '2014')) ? store.getSetting('ruleset') : '2014', campaignId: defaultCampaign || '',
    alignment: '', gender: '',
    raceId: '', raceName: '', subraceId: '', bgId: '', bgName: '',
    classId: '', className: '', hitDie: 8, casterType: '', level: 1, subclassId: '',
    method: 'standard', pool: [...STANDARD_ARRAY], assign: { str: 0, dex: 1, con: 2, int: 3, wis: 4, cha: 5 },
    pb: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }, manual: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    raceChoice: [], asiFrom: 'auto', bgMode: '2-1', bgPlus2: '', bgPlus1: '', extra: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    skills: [], startingEquipment: true,
  };
}

export function CreationWizard({ open, onClose, onCreated, defaultCampaign }) {
  const [s, setS] = useState(() => initial(defaultCampaign));
  const set = (p) => setS((x) => ({ ...x, ...p }));
  const units = useUnits();
  const campaigns = useCollection('campaigns');
  const races = useSrd('races').items, subraces = useSrd('subraces').items, classes = useSrd('classes').items;
  const subclasses = useSrd('subclasses').items, backgrounds = useSrd('backgrounds').items, levels = useSrd('levels').items;
  const languages = useSrd('languages').items, equipment = useSrd('equipment').items, skillsData = useSrd('skills').items;

  const raceD = races.find((x) => x.id === s.raceId) || null;
  const subD = subraces.find((x) => x.id === s.subraceId) || null;
  const clsD = classes.find((x) => x.id === s.classId) || null;
  const bgD = backgrounds.find((x) => x.id === s.bgId) || null;
  const subLvl = clsD ? subclassLevel(clsD.id, subclasses) : 99;
  const subOptions = clsD ? [
    ...subclasses.filter((x) => !x._catalog && x.classId === clsD.id),
    // sottoclassi dei manuali: valgono per la classe sia con regole 2014 sia 2024
    ...subclasses.filter((x) => x._catalog && x.classId === clsD.id.replace(/-2024$/, '')).sort((a, b) => a.name.localeCompare(b.name)),
  ] : [];

  // punteggi base secondo il metodo
  const base = {};
  for (const a of ABILITIES) {
    if (s.method === 'pointbuy') base[a] = s.pb[a];
    else if (s.method === 'manual') base[a] = s.manual[a];
    else base[a] = s.pool[s.assign[a]] ?? 10;
  }
  // Da dove arrivano gli aumenti di caratteristica: razza (regole 2014) o background (regole 2024).
  // Con regole miste, se entrambi ne danno, si sceglie (predefinito: background, come nel manuale 2024).
  const raceHasAsi = !!((raceD?.abilityBonuses || []).length || (subD?.abilityBonuses || []).length || raceD?.abilityBonusChoice);
  const bgHasAsi = !!(bgD?.abilityScores || []).length;
  const mixed = s.ruleset === 'mix';
  const asiFrom = s.asiFrom === 'auto' ? 'background' : s.asiFrom;
  const useRaceAsi = s.ruleset === '2014' || (mixed && raceHasAsi && (!bgHasAsi || asiFrom !== 'background'));
  const useBgAsi = s.ruleset === '2024' || (mixed && bgHasAsi && (!raceHasAsi || asiFrom !== 'race'));
  const chosen = { ...s.extra };
  if (useRaceAsi) for (const a of s.raceChoice) chosen[a] = (chosen[a] || 0) + (raceD?.abilityBonusChoice?.from?.find((f) => f.ability === a)?.bonus || 1);
  if (useBgAsi && bgD?.abilityScores?.length) {
    if (s.bgMode === '1-1-1') for (const a of bgD.abilityScores) chosen[a] = (chosen[a] || 0) + 1;
    else { if (s.bgPlus2) chosen[s.bgPlus2] = (chosen[s.bgPlus2] || 0) + 2; if (s.bgPlus1 && s.bgPlus1 !== s.bgPlus2) chosen[s.bgPlus1] = (chosen[s.bgPlus1] || 0) + 1; }
  }
  const bonus = abilityBonuses({ race: useRaceAsi ? raceD : null, subrace: useRaceAsi ? subD : null, chosen });
  const scores = {};
  for (const a of ABILITIES) scores[a] = Math.min(30, (base[a] || 10) + (bonus[a] || 0));

  const bgSkills = bgD?.skillProficiencies || [];
  const skillChoice = clsD?.skillChoices || null;
  const skillName = (id) => skillsData.find((x) => x.id === id)?.name_it || R.SKILLS[id]?.name_it || id;

  const choices = () => ({
    name: s.name.trim() || 'Nuovo personaggio', player: s.player, ruleset: s.ruleset, campaignId: s.campaignId || null,
    alignment: s.alignment, gender: s.gender, units,
    race: s.raceId === CUSTOM || !s.raceId ? { id: '', name: s.raceName.trim() } : { id: s.raceId, name: itName(raceD) },
    subrace: subD ? { id: subD.id, name: itName(subD) } : null,
    background: s.bgId === CUSTOM || !s.bgId ? { id: '', name: s.bgName.trim() } : { id: s.bgId, name: itName(bgD) },
    cls: clsD
      ? { classId: clsD.id, name: itName(clsD), hitDie: clsD.hitDie, level: s.level, subclassId: s.level >= subLvl ? s.subclassId : '', subclassName: s.level >= subLvl ? itName(subclasses.find((x) => x.id === s.subclassId)) : '' }
      : { classId: '', name: s.className.trim() || 'Classe', hitDie: Number(s.hitDie) || 8, level: s.level, casterType: s.casterType || null },
    scores, skills: s.skills, startingEquipment: s.startingEquipment,
  });
  const preview = useMemo(() => {
    try { return buildCharacter(choices(), { races, subraces, classes, subclasses, backgrounds, levels, languages, equipment }); } catch (e) { console.error(e); return null; }
  }, [JSON.stringify(s), races.length, classes.length, units]);

  const create = () => {
    const c = buildCharacter(choices(), { races, subraces, classes, subclasses, backgrounds, levels, languages, equipment });
    const saved = store.put('characters', c);
    if (saved.campaignId) {
      const camp = store.get('campaigns', saved.campaignId);
      if (camp) store.update('campaigns', camp.id, { partyIds: [...new Set([...(camp.partyIds || []), saved.id])] });
    }
    toast(`Creato ${saved.name}`, 'good');
    setS(initial(defaultCampaign));
    onCreated?.(saved);
  };

  const step = STEPS[s.step].id;
  const go = (i) => set({ step: Math.max(0, Math.min(STEPS.length - 1, i)) });

  // ---------------------------------------------------------------- passi
  const stepBase = html`<div class="cs-wz-grid">
    <${TextField} label="Nome del personaggio" value=${s.name} onInput=${(v) => set({ name: v })} placeholder="es. Fjellbjørn" data-testid="wz-name" autofocus />
    <${TextField} label="Giocatore" value=${s.player} onInput=${(v) => set({ player: v })} />
    <${Select} label="Regole" value=${s.ruleset} onChange=${(v) => set({ ruleset: v, raceId: '', subraceId: '', classId: '', subclassId: '', bgId: '', skills: [] })}
      options=${[{ value: '2014', label: 'D&D 5e 2014 (SRD 5.1)' }, { value: '2024', label: 'D&D 5e 2024 (SRD 5.2)' }, { value: 'mix', label: 'Misto: un po\' 2014, un po\' 2024' }]} data-testid="wz-ruleset" />
    ${s.ruleset === 'mix' && html`<p class="cs-small faint cs-span2">Puoi scegliere razza, classe e background di entrambe le versioni: ognuno porta le sue regole (l'anno è indicato accanto al nome). Le regole generali (sfinimento, multiclasse) si scelgono poi nella scheda.</p>`}
    <${Select} label="Campagna" value=${s.campaignId || ''} onChange=${(v) => set({ campaignId: v })}
      options=${[{ value: '', label: 'Nessuna' }, ...campaigns.map((x) => ({ value: x.id, label: x.name || 'Campagna' }))]} />
    <${Select} label="Allineamento" value=${s.alignment} onChange=${(v) => set({ alignment: v })} options=${[{ value: '', label: '—' }, ...ALIGNMENTS]} />
    <${TextField} label="Sesso" value=${s.gender} onInput=${(v) => set({ gender: v })} />
  </div>`;

  const raceOpts = forRuleset(races, s.ruleset);
  const subOpts = subraces.filter((x) => x.raceId === s.raceId);
  const stepRace = html`<div class="cs-wz-grid">
    <${Select} label=${s.ruleset === '2024' ? 'Specie' : mixed ? 'Razza / specie' : 'Razza'} value=${s.raceId} data-testid="wz-race"
      onChange=${(v) => set({ raceId: v, subraceId: '', raceChoice: [] })}
      options=${[{ value: '', label: '— scegli —' }, ...raceOpts.map((x) => ({ value: x.id, label: optLabel(x, s.ruleset, itName(x)) })), { value: CUSTOM, label: 'Altro / homebrew (nome libero)…' }]} />
    ${s.raceId === CUSTOM && html`<${TextField} label="Nome razza" value=${s.raceName} onInput=${(v) => set({ raceName: v })} placeholder="es. Lupin" data-testid="wz-race-name" />`}
    ${subOpts.length > 0 && html`<${Select} label=${s.ruleset === '2024' ? 'Lignaggio / eredità' : mixed ? 'Sottorazza / lignaggio' : 'Sottorazza'} value=${s.subraceId} onChange=${(v) => set({ subraceId: v })}
      options=${[{ value: '', label: '— nessuna —' }, ...subOpts.map((x) => ({ value: x.id, label: itName(x) }))]} data-testid="wz-subrace" />`}
  </div>
  ${raceD && html`<div class="cs-wz-info">
    <div class="row">
      <span class="tag">Velocità ${R.formatDistance(raceD.speed, units)}</span>
      ${raceD.size_it && html`<span class="tag">Taglia ${raceD.size_it}</span>`}
      ${useRaceAsi && [...(raceD.abilityBonuses || []), ...(subD?.abilityBonuses || [])].map((b) => html`<span class="tag accent">${AB[b.ability]?.abbr} ${signed(b.bonus)}</span>`)}
    </div>
    ${raceD.abilityBonusChoice && useRaceAsi && html`<div class="cs-wz-choice">
      <span class="field-label">Scegli ${raceD.abilityBonusChoice.choose} caratteristiche (+${raceD.abilityBonusChoice.from?.[0]?.bonus || 1})</span>
      <div class="row">${(raceD.abilityBonusChoice.from || []).map((f) => {
        const on = s.raceChoice.includes(f.ability);
        return html`<label class="check"><input type="checkbox" checked=${on} disabled=${!on && s.raceChoice.length >= raceD.abilityBonusChoice.choose}
          onChange=${() => set({ raceChoice: on ? s.raceChoice.filter((x) => x !== f.ability) : [...s.raceChoice, f.ability] })} /><span>${AB[f.ability]?.name}</span></label>`;
      })}</div></div>`}
    <ul class="cs-wz-traits">${[...(raceD.traits || []), ...(subD?.traits || [])].map((t) => html`<li><b>${t.name}.</b> <span class="muted">${String(t.desc || '').slice(0, 220)}${String(t.desc || '').length > 220 ? '…' : ''}</span></li>`)}</ul>
  </div>`}`;

  const clsOpts = forRuleset(classes, s.ruleset);
  const stepClass = html`<div class="cs-wz-grid">
    <${Select} label="Classe" value=${s.classId} data-testid="wz-class" onChange=${(v) => set({ classId: v, subclassId: '', skills: [] })}
      options=${[{ value: '', label: '— scegli —' }, ...clsOpts.map((x) => ({ value: x.id, label: optLabel(x, s.ruleset, itName(x), ` (d${x.hitDie})`) })), { value: CUSTOM, label: 'Altro / homebrew…' }]} />
    <label class="field"><span class="field-label">Livello</span>
      <input class="input" type="number" min="1" max="20" value=${s.level} data-testid="wz-level"
        onInput=${(e) => { const v = Number(e.currentTarget.value); if (v >= 1 && v <= 20) set({ level: v }); }} /></label>
    ${s.classId === CUSTOM && html`
      <${TextField} label="Nome classe" value=${s.className} onInput=${(v) => set({ className: v })} data-testid="wz-class-name" />
      <${Select} label="Dado vita" value=${String(s.hitDie)} onChange=${(v) => set({ hitDie: Number(v) })} options=${['6', '8', '10', '12'].map((d) => ({ value: d, label: 'd' + d }))} />
      <${Select} label="Incantatore" value=${s.casterType} onChange=${(v) => set({ casterType: v })}
        options=${[{ value: '', label: 'No' }, { value: 'full', label: 'Completo' }, { value: 'half', label: 'Mezzo' }, { value: 'third', label: 'Un terzo' }, { value: 'pact', label: 'Patto' }]} />`}
    ${clsD && s.level >= subLvl && subOptions.length > 0 && html`<${Select} label=${`Sottoclasse (dal ${subLvl}° livello)`} value=${s.subclassId} data-testid="wz-subclass"
      onChange=${(v) => set({ subclassId: v })} options=${[{ value: '', label: '— da scegliere —' }, ...subOptions.map((x) => ({ value: x.id, label: optLabel(x, s.ruleset, itName(x)) }))]} />`}
  </div>
  ${clsD && html`<div class="cs-wz-info">
    <div class="row">
      <span class="tag accent">Dado vita d${clsD.hitDie}</span>
      <span class="tag">TS: ${(clsD.savingThrows || []).map((a) => AB[a]?.abbr).join(', ')}</span>
      ${clsD.spellcasting && html`<span class="tag magic">Incantatore (${AB[clsD.spellcasting.ability]?.abbr})</span>`}
      ${s.level < subLvl && subOptions.length > 0 && html`<span class="tag">Sottoclasse al ${subLvl}° livello</span>`}
    </div>
    <p class="muted cs-small">Armature: ${(clsD.proficiencies_it?.armor || []).join(', ') || '—'} · Armi: ${(clsD.proficiencies_it?.weapons || []).join(', ') || '—'}</p>
    <div class="cs-small faint">Privilegi fino al livello ${s.level}: ${(clsD.features || []).filter((f) => f.level <= s.level).map((f) => f.name).join(', ')}</div>
  </div>`}`;

  const bgOpts = forRuleset(backgrounds, s.ruleset);
  const stepBg = html`<div class="cs-wz-grid">
    <${Select} label="Background" value=${s.bgId} onChange=${(v) => set({ bgId: v, bgPlus2: '', bgPlus1: '' })} data-testid="wz-bg"
      options=${[{ value: '', label: '— nessuno —' }, ...bgOpts.map((x) => ({ value: x.id, label: optLabel(x, s.ruleset, itName(x)) })), { value: CUSTOM, label: 'Altro (nome libero)…' }]} />
    ${s.bgId === CUSTOM && html`<${TextField} label="Nome background" value=${s.bgName} onInput=${(v) => set({ bgName: v })} />`}
  </div>
  ${bgD && html`<div class="cs-wz-info">
    <div class="row">${bgSkills.map((k) => html`<span class="tag accent">${skillName(k)}</span>`)}
      ${(bgD.toolProficiencies || []).map((t) => html`<span class="tag">${t}</span>`)}
      ${bgD.feat && html`<span class="tag magic">Talento: ${bgD.feat.name}${bgD.feat.note ? ` (${bgD.feat.note})` : ''}</span>`}</div>
    ${bgD.feature && html`<p class="muted cs-small"><b>${bgD.feature.name}.</b> ${String(bgD.feature.desc).slice(0, 260)}…</p>`}
    ${useBgAsi && bgD.abilityScores?.length > 0 && html`<p class="cs-small faint">Aumenti di caratteristica (${bgD.abilityScores.map((a) => AB[a]?.abbr).join(', ')}) nel passo «Caratteristiche».</p>`}
  </div>`}`;

  const assignSwap = (a, idx) => {
    const cur = { ...s.assign };
    const other = ABILITIES.find((k) => cur[k] === idx);
    if (other) cur[other] = cur[a];
    cur[a] = idx;
    set({ assign: cur });
  };
  const pbCost = pointBuyCost(s.pb);
  const stepAbilities = html`<div class="row" style="align-items:flex-end;margin-bottom:12px">
      <${Select} label="Metodo" value=${s.method} options=${METHODS} data-testid="wz-method"
        onChange=${(v) => set({ method: v, pool: v === 'standard' ? [...STANDARD_ARRAY] : s.pool, assign: { str: 0, dex: 1, con: 2, int: 3, wis: 4, cha: 5 } })} />
      ${s.method === 'roll' && html`<${Button} onClick=${() => set({ pool: Array.from({ length: 6 }, () => roll4d6kh3()).sort((a, b) => b - a) })} data-testid="wz-roll">🎲 Tira 6 volte 4d6</${Button}>`}
      ${s.method === 'roll' && html`<span class="muted">Valori: <b>${s.pool.join(', ')}</b></span>`}
      ${s.method === 'pointbuy' && html`<span class=${pbCost > POINT_BUY_BUDGET ? 'tag bad' : 'tag good'}>Punti spesi ${pbCost} / ${POINT_BUY_BUDGET}</span>`}
    </div>
    ${mixed && raceHasAsi && bgHasAsi && html`<div class="cs-wz-choice row">
      <${Select} label="Aumenti di caratteristica da" value=${asiFrom} onChange=${(v) => set({ asiFrom: v })} data-testid="wz-asi-from"
        options=${[{ value: 'background', label: 'Background (regola 2024)' }, { value: 'race', label: 'Razza (regola 2014)' }, { value: 'both', label: 'Entrambi (homebrew)' }]} />
    </div>`}
    ${useBgAsi && bgD?.abilityScores?.length > 0 && html`<div class="cs-wz-choice row">
      <span class="field-label">Background:</span>
      <${Select} value=${s.bgMode} onChange=${(v) => set({ bgMode: v })} options=${[{ value: '2-1', label: '+2 e +1' }, { value: '1-1-1', label: '+1 a tutte e tre' }]} />
      ${s.bgMode === '2-1' && html`
        <${Select} value=${s.bgPlus2} onChange=${(v) => set({ bgPlus2: v })} options=${[{ value: '', label: '+2 a…' }, ...bgD.abilityScores.map((a) => ({ value: a, label: '+2 ' + AB[a].name }))]} />
        <${Select} value=${s.bgPlus1} onChange=${(v) => set({ bgPlus1: v })} options=${[{ value: '', label: '+1 a…' }, ...bgD.abilityScores.filter((a) => a !== s.bgPlus2).map((a) => ({ value: a, label: '+1 ' + AB[a].name }))]} />`}
    </div>`}
    <table class="table cs-wz-ab">
      <thead><tr><th>Caratteristica</th><th>Base</th><th>Bonus</th><th>Altro</th><th>Totale</th><th>Mod</th></tr></thead>
      <tbody>${ABILITIES.map((a) => html`<tr data-testid=${'wz-ab-' + a}>
        <td><b>${AB[a].name}</b> <span class="faint">${AB[a].abbr}</span>${clsD?.primaryAbility?.includes(a) ? html` <span class="tag accent">primaria</span>` : ''}</td>
        <td>${s.method === 'pointbuy'
          ? html`<span class="cs-stepper"><button class="btn ghost sm" disabled=${s.pb[a] <= 8} onClick=${() => set({ pb: { ...s.pb, [a]: s.pb[a] - 1 } })}>−</button>
              <b class="cs-wz-val">${s.pb[a]}</b><button class="btn ghost sm" disabled=${s.pb[a] >= 15 || pbCost - POINT_COST[s.pb[a]] + POINT_COST[s.pb[a] + 1] > POINT_BUY_BUDGET} onClick=${() => set({ pb: { ...s.pb, [a]: s.pb[a] + 1 } })}>+</button></span>`
          : s.method === 'manual'
            ? html`<input class="input cs-inline cs-num" type="number" min="1" max="30" value=${s.manual[a]} data-testid=${'wz-score-' + a}
                onInput=${(e) => { const v = Number(e.currentTarget.value); if (v >= 1 && v <= 30) set({ manual: { ...s.manual, [a]: v } }); }} />`
            : html`<select class="input cs-inline" value=${String(s.assign[a])} onChange=${(e) => assignSwap(a, Number(e.currentTarget.value))} data-testid=${'wz-assign-' + a}>
                ${s.pool.map((v, i) => html`<option value=${String(i)}>${v}</option>`)}</select>`}</td>
        <td>${(bonus[a] || 0) - (s.extra[a] || 0) ? html`<span class="tag accent">${signed((bonus[a] || 0) - (s.extra[a] || 0))}</span>` : html`<span class="faint">—</span>`}</td>
        <td><input class="input cs-inline cs-num" type="number" value=${s.extra[a]} title="Bonus liberi (homebrew)"
          onInput=${(e) => set({ extra: { ...s.extra, [a]: Number(e.currentTarget.value) || 0 } })} /></td>
        <td><b class="cs-wz-total">${scores[a]}</b></td>
        <td><span class="mod">${signed(R.abilityMod(scores[a]))}</span></td>
      </tr>`)}</tbody>
    </table>`;

  const toggleSkill = (k) => set({ skills: s.skills.includes(k) ? s.skills.filter((x) => x !== k) : [...s.skills, k] });
  const pickFrom = skillChoice ? skillChoice.from : Object.keys(R.SKILLS);
  const limit = skillChoice ? skillChoice.choose : 99;
  const picked = s.skills.filter((k) => !bgSkills.includes(k));
  const stepSkills = html`<p class="muted">${skillChoice ? `Scegli ${skillChoice.choose} abilità della classe.` : 'Scegli liberamente le abilità in cui il personaggio è competente.'}
      ${bgSkills.length ? ` Il background dà: ${bgSkills.map(skillName).join(', ')}.` : ''}
      <b> (${picked.length}${skillChoice ? '/' + limit : ''})</b></p>
    <div class="cs-wz-skills">${Object.keys(R.SKILLS).map((k) => {
      const fromBg = bgSkills.includes(k);
      const allowed = pickFrom.includes(k);
      const on = fromBg || s.skills.includes(k);
      return html`<label class="check ${!allowed && !fromBg ? 'faint' : ''}">
        <input type="checkbox" checked=${on} disabled=${fromBg || !allowed || (!on && picked.length >= limit)} onChange=${() => toggleSkill(k)} data-testid=${'wz-skill-' + k} />
        <span>${skillName(k)} <span class="faint">${AB[R.SKILLS[k].ability].abbr}</span>${fromBg ? html` <span class="tag">background</span>` : ''}</span></label>`;
    })}</div>`;

  const p = preview;
  const stepSummary = p && html`<div class="cs-wz-summary">
    <h2>${p.name}</h2>
    <p class="muted">${[p.race.name, p.subrace?.name].filter(Boolean).join(' – ') || 'Razza non indicata'} · ${p.classes.map((x) => `${x.name}${x.subclassName ? ' (' + x.subclassName + ')' : ''} ${x.level}`).join(' / ')} · ${p.background.name || 'nessun background'}</p>
    <div class="row cs-wz-stats">
      <div class="statbox"><div class="statbox-label">PF</div><div class="statbox-value" data-testid="wz-hp">${R.maxHp(p)}</div></div>
      <div class="statbox"><div class="statbox-label">CA</div><div class="statbox-value">${R.armorClass(p, equipment)}</div></div>
      <div class="statbox"><div class="statbox-label">Iniziativa</div><div class="statbox-value">${signed(R.initiative(p))}</div></div>
      <div class="statbox"><div class="statbox-label">Competenza</div><div class="statbox-value">${signed(R.profBonus(p))}</div></div>
      <div class="statbox"><div class="statbox-label">Velocità</div><div class="statbox-value">${R.formatDistance(p.speed.walk, units)}</div></div>
      ${ABILITIES.map((a) => html`<div class="statbox"><div class="statbox-label">${AB[a].abbr}</div><div class="statbox-value">${signed(R.abilityModOf(p, a))}</div><div class="statbox-sub">${p.abilities[a].score}</div></div>`)}
    </div>
    <p class="cs-small"><b>Abilità:</b> ${Object.keys(p.skills).map(skillName).join(', ') || '—'}</p>
    <p class="cs-small"><b>Privilegi:</b> ${p.features.map((f) => f.name).join(', ') || '—'}</p>
    ${p.resources.length > 0 && html`<p class="cs-small"><b>Risorse:</b> ${p.resources.map((r) => `${r.name} (${r.max})`).join(', ')}</p>`}
    ${(clsD?.startingEquipment?.length || bgD?.equipment?.length) ? html`<label class="check"><input type="checkbox" checked=${s.startingEquipment} onChange=${(e) => set({ startingEquipment: e.currentTarget.checked })} />
      <span>Aggiungi l'equipaggiamento iniziale fisso (${[...(clsD?.startingEquipment || []), ...(bgD?.equipment || [])].map((x) => x.name).join(', ')})</span></label>` : ''}
    <p class="faint cs-small">Tutto resta modificabile nella scheda: privilegi, incantesimi e inventario si completano dopo.</p>
  </div>`;

  const body = { base: stepBase, race: stepRace, class: stepClass, bg: stepBg, abilities: stepAbilities, skills: stepSkills, summary: stepSummary }[step];
  return html`<${Modal} open=${open} title="Nuovo personaggio" onClose=${onClose} wide>
    <div class="cs-wz" data-testid="wizard">
      <nav class="cs-wz-steps">${STEPS.map((x, i) => html`<button class="cs-wz-step ${i === s.step ? 'active' : i < s.step ? 'done' : ''}" onClick=${() => go(i)} data-testid=${'wz-step-' + x.id}>
        <span class="cs-wz-num">${i + 1}</span>${x.label}</button>`)}</nav>
      <div class="cs-wz-body">${body}</div>
      <footer class="cs-wz-foot">
        <${Button} variant="ghost" onClick=${onClose}>Annulla</${Button}>
        <span class="spacer"></span>
        ${s.step > 0 && html`<${Button} onClick=${() => go(s.step - 1)}>← Indietro</${Button}>`}
        ${s.step < STEPS.length - 1
          ? html`<${Button} variant="primary" onClick=${() => go(s.step + 1)} data-testid="wz-next">Avanti →</${Button}>`
          : html`<${Button} variant="primary" onClick=${create} data-testid="wz-create">Crea personaggio</${Button}>`}
      </footer>
    </div>
  </${Modal}>`;
}
