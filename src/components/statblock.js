// Scheda statistiche di un mostro (stile manuale), riusabile: bestiario, combat tracker, incontri.
//   <${StatBlock} monster=${m} compact=${false} onRoll=${({ label, result, kind, monster }) => …} />
// Bonus d'attacco, dadi di danno, caratteristiche, tiri salvezza e abilità sono cliccabili per tirare.
// Distanze in metri o piedi secondo getSetting('units','m') (5 ft = 1,5 m). I dati restano in piedi.
// Nessuna dipendenza dalla vista bestiario.
import { html } from '../vendor/preact-htm.js';
import { roll, signed } from '../lib/util.js';
import { useDoc } from '../lib/hooks.js';
import { toast } from './ui.js';

// ------------------------------------------------------------------ vocabolari (esportati per riuso)
export const SIZE_IT = { Tiny: 'Minuscola', Small: 'Piccola', Medium: 'Media', Large: 'Grande', Huge: 'Enorme', Gargantuan: 'Mastodontica' };
export const TYPE_IT = {
  aberration: 'Aberrazione', beast: 'Bestia', celestial: 'Celestiale', construct: 'Costrutto', dragon: 'Drago',
  elemental: 'Elementale', fey: 'Folletto', fiend: 'Immondo', giant: 'Gigante', humanoid: 'Umanoide',
  monstrosity: 'Mostruosità', ooze: 'Melma', plant: 'Vegetale', undead: 'Non morto',
};
const TYPE_PLURAL_IT = {
  beast: 'bestie', undead: 'non morti', aberration: 'aberrazioni', construct: 'costrutti', dragon: 'draghi', elemental: 'elementali',
  fey: 'folletti', fiend: 'immondi', giant: 'giganti', humanoid: 'umanoidi', monstrosity: 'mostruosità', ooze: 'melme', plant: 'vegetali', celestial: 'celestiali',
};
export const ABILITY_IT = { str: 'FOR', dex: 'DES', con: 'COS', int: 'INT', wis: 'SAG', cha: 'CAR' };
export const ABILITY_LONG_IT = { str: 'Forza', dex: 'Destrezza', con: 'Costituzione', int: 'Intelligenza', wis: 'Saggezza', cha: 'Carisma' };
export const SKILL_IT = {
  acrobatics: 'Acrobazia', 'animal-handling': 'Addestrare Animali', arcana: 'Arcano', athletics: 'Atletica', deception: 'Inganno',
  history: 'Storia', insight: 'Intuizione', intimidation: 'Intimidire', investigation: 'Indagare', medicine: 'Medicina',
  nature: 'Natura', perception: 'Percezione', performance: 'Intrattenere', persuasion: 'Persuasione', religion: 'Religione',
  'sleight-of-hand': 'Rapidità di Mano', stealth: 'Furtività', survival: 'Sopravvivenza',
};
export const SKILL_ABILITY = {
  acrobatics: 'dex', 'animal-handling': 'wis', arcana: 'int', athletics: 'str', deception: 'cha', history: 'int', insight: 'wis',
  intimidation: 'cha', investigation: 'int', medicine: 'wis', nature: 'int', perception: 'wis', performance: 'cha',
  persuasion: 'cha', religion: 'int', 'sleight-of-hand': 'dex', stealth: 'dex', survival: 'wis',
};
export const CONDITION_IT = {
  blinded: 'accecato', charmed: 'affascinato', deafened: 'assordato', exhaustion: 'indebolimento', frightened: 'spaventato',
  grappled: 'afferrato', incapacitated: 'incapacitato', invisible: 'invisibile', paralyzed: 'paralizzato', petrified: 'pietrificato',
  poisoned: 'avvelenato', prone: 'prono', restrained: 'trattenuto', stunned: 'stordito', unconscious: 'privo di sensi',
};
export const DAMAGE_IT = {
  acid: 'acido', bludgeoning: 'contundente', cold: 'freddo', fire: 'fuoco', force: 'forza', lightning: 'fulmine',
  necrotic: 'necrotico', piercing: 'perforante', poison: 'veleno', psychic: 'psichico', radiant: 'radioso',
  slashing: 'tagliente', thunder: 'tuono',
};
const SENSE_IT = { darkvision: 'scurovisione', blindsight: 'vista cieca', tremorsense: 'percezione tellurica', truesight: 'vista pura' };
const SPEED_IT = { fly: 'volare', swim: 'nuotare', climb: 'scalare', burrow: 'scavare' };

/** Etichetta italiana per una stringa di danno ("bludgeoning, piercing, and slashing from nonmagical attacks"). */
export function damageIt(s) {
  let t = String(s || '');
  if (DAMAGE_IT[t.toLowerCase()]) return DAMAGE_IT[t.toLowerCase()];
  const phrases = [
    [/from nonmagical attacks? that aren'?t (silvered|adamantine)/gi, (m, x) => `da attacchi non magici non ${x.toLowerCase() === 'silvered' ? 'argentati' : 'di adamantio'}`],
    [/from nonmagical weapons that aren'?t (silvered|adamantine)/gi, (m, x) => `da armi non magiche non ${x.toLowerCase() === 'silvered' ? 'argentate' : 'di adamantio'}`],
    [/from nonmagical attacks/gi, 'da attacchi non magici'], [/from nonmagical weapons/gi, 'da armi non magiche'],
    [/from magic weapons/gi, 'da armi magiche'], [/damage from spells/gi, 'danni da incantesimi'], [/\(from stoneskin\)/gi, '(da pelle di pietra)'],
    [/wielded by good creatures/gi, 'impugnate da creature buone'], [/\band\b/gi, 'e'], [/\bdamage\b/gi, 'danni'],
  ];
  for (const [re, rep] of phrases) t = t.replace(re, rep);
  t = t.replace(/\b(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)\b/gi, (w) => DAMAGE_IT[w.toLowerCase()]);
  return t.replace(/,\s*e\b/g, ' e');
}

// ------------------------------------------------------------------ distanze / formattazione
const nf = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
export function ftToUnits(ft, units = 'm') {
  const n = Number(ft) || 0;
  return units === 'ft' ? `${n} ft` : `${nf.format(Math.round(n * 0.3 * 10) / 10)} m`;
}
/** Converte le distanze nel testo SRD ("reach 10 ft.", "80/320 ft.", "60-foot cone", "within 30 feet") se units='m'. */
export function convertDistances(text, units = 'm') {
  if (units === 'ft') return text;
  const m = (x) => nf.format(Math.round(Number(x) * 0.3 * 10) / 10);
  return String(text)
    .replace(/(\d+)\/(\d+)\s*ft\.?/g, (_, a, b) => `${m(a)}/${m(b)} m`)
    .replace(/(\d[\d,]*)\s*(?:ft\.|feet|foot)(?![a-z])/g, (_, a) => `${m(a.replace(/,/g, ''))} m`)
    .replace(/(\d+)-foot(?:-|\s)/g, (_, a) => `${m(a)} m `);
}
export const abilityMod = (score) => Math.floor(((Number(score) || 10) - 10) / 2);
export const fmtNum = (n) => new Intl.NumberFormat('it-IT').format(Number(n) || 0);

export function usageIt(u) {
  if (!u) return '';
  if (u.type === 'recharge') return u.min >= 6 ? 'Ricarica 6' : `Ricarica ${u.min}–6`;
  if (u.type === 'perDay') return u.timesInLair ? `${u.times}/giorno, ${u.timesInLair}/giorno nella tana` : `${u.times}/giorno`;
  if (u.type === 'rest') return `si ricarica dopo un riposo ${(u.rest || []).map((r) => (r === 'short' ? 'breve' : 'lungo')).join(' o ')}`;
  if (u.type === 'atWill') return 'a volontà';
  return u.text || '';
}
function entryTitle(e) {
  let name = String(e.name || '').replace(/\(Costs (\d) Actions\)/i, '(costa $1 azioni)');
  const u = usageIt(e.usage);
  if (u && !/\(/.test(name)) name += ` (${u})`;
  return name;
}

// ------------------------------------------------------------------ tiri
function doRoll({ expr, label, kind, monster, onRoll }) {
  const result = roll(expr);
  let tone = '';
  let extra = '';
  if (kind === 'attack' || kind === 'check') {
    const d20 = result.rolls[0]?.results?.[0];
    if (d20 === 20) { tone = 'good'; extra = kind === 'attack' ? ' — CRITICO!' : ' — 20 naturale!'; }
    if (d20 === 1) { tone = 'bad'; extra = ' — 1 naturale'; }
  }
  const detail = result.rolls.map((r) => `[${r.results.join(', ')}]`).join(' ');
  toast(html`<div><b>${label}</b></div><div>${expr} → ${detail} = <b style="font-size:1.25em">${result.total}</b>${extra}</div>`, tone);
  onRoll?.({ label, result, kind, monster });
  return result;
}

function RollBtn({ expr, label, kind = 'dice', ctx, children, title }) {
  return html`<button type="button" class="sb-roll ${kind}" title=${title || `Tira ${expr}`} data-roll=${expr}
    onClick=${(e) => { e.stopPropagation(); doRoll({ expr, label, kind, ...ctx }); }}>${children}</button>`;
}

// Tokenizzatore del testo descrittivo: attacchi, danni, dadi, CD, distanze.
const TOKEN_RE = /([+-]\d+)(\s+(?:to hit|al colpire|per colpire))|((?:Attack Roll|Tiro per colpire):\*?\s*)([+-]\d+)|(\d+)\s\((\d+d\d+(?:\s*[+−-]\s*\d+)?)\)|\b(\d+d\d+(?:\s*[+−-]\s*\d+)?)\b|\b(DC|CD)\s(\d+)\b|((?:Melee or Ranged|Melee|Ranged) (?:Weapon |Spell )?Attack(?: Roll)?:|Hit:|Miss:|Failure or Success:|Failure:|Success:|First Failure:|Second Failure:|(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw:|Trigger:|Response:)(\s*[+-]\d+(?!d))?/g;

function RichText({ text, label, ctx, units }) {
  const src = convertDistances(String(text || ''), units);
  const lines = src.split(/\n+/);
  const renderLine = (line) => {
    const out = []; let last = 0; let m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(line))) {
      if (m.index > last) out.push(line.slice(last, m.index));
      if (m[1]) out.push(html`<${RollBtn} expr=${'1d20' + m[1]} kind="attack" label=${`${label}: tiro per colpire`} ctx=${ctx}>${m[1]}</${RollBtn}>${m[2]}`);
      else if (m[4]) out.push(html`<em>${m[3]}</em><${RollBtn} expr=${'1d20' + m[4]} kind="attack" label=${`${label}: tiro per colpire`} ctx=${ctx}>${m[4]}</${RollBtn}>`);
      else if (m[6]) { const d = m[6].replace(/−/g, '-').replace(/\s+/g, ''); out.push(html`<${RollBtn} expr=${d} kind="damage" label=${`${label}: danni`} ctx=${ctx}>${m[5]} (${m[6]})</${RollBtn}>`); }
      else if (m[7]) { const d = m[7].replace(/−/g, '-').replace(/\s+/g, ''); out.push(html`<${RollBtn} expr=${d} kind="dice" label=${`${label}: ${m[7]}`} ctx=${ctx}>${m[7]}</${RollBtn}>`); }
      else if (m[8]) out.push(html`<span class="sb-dc">CD ${m[9]}</span>`);
      else if (m[10]) {
        out.push(html`<em>${m[10]}</em>`);
        if (m[11]) out.push(' ', html`<${RollBtn} expr=${'1d20' + m[11].trim()} kind="attack" label=${`${label}: tiro per colpire`} ctx=${ctx}>${m[11].trim()}</${RollBtn}>`);
      }
      last = TOKEN_RE.lastIndex;
    }
    if (last < line.length) out.push(line.slice(last));
    return out;
  };
  const blocks = [];
  let list = null;
  for (const l of lines) {
    const t = l.trim();
    if (!t) continue;
    if (/^[-•*]\s+/.test(t)) { (list ??= []).push(t.replace(/^[-•*]\s+/, '')); continue; }
    if (list) { blocks.push({ list }); list = null; }
    blocks.push({ p: t });
  }
  if (list) blocks.push({ list });
  return blocks.map((b, i) => (b.list
    ? html`<ul class="sb-list" key=${i}>${b.list.map((x) => html`<li>${renderLine(x)}</li>`)}</ul>`
    : i === 0 ? html`<span>${renderLine(b.p)}</span>` : html`<p class="sb-p">${renderLine(b.p)}</p>`));
}

function Entry({ e, monster, ctx, units }) {
  const title = entryTitle(e);
  const label = `${monster.name} · ${e.name}`;
  return html`<div class="sb-entry" data-entry=${e.name}>
    <b class="sb-entry-name">${title}.</b>${' '}<${RichText} text=${e.desc} label=${label} ctx=${ctx} units=${units} />
  </div>`;
}

function Section({ title, entries, monster, ctx, units, intro }) {
  if (!entries?.length) return null;
  return html`<section class="sb-section">
    <h4 class="sb-section-title">${title}</h4>
    ${intro && html`<p class="sb-intro"><${RichText} text=${intro} label=${monster.name} ctx=${ctx} units=${units} /></p>`}
    ${entries.map((e, i) => html`<${Entry} key=${i} e=${e} monster=${monster} ctx=${ctx} units=${units} />`)}
  </section>`;
}

function Prop({ label, children }) {
  if (children == null || children === '' || (Array.isArray(children) && !children.length)) return null;
  return html`<div class="sb-prop"><span class="sb-label">${label}</span> ${children}</div>`;
}

function dmgList(list) {
  const a = (list || []).map(damageIt);
  if (!a.length) return null;
  return a.join(a.some((x) => x.includes(',')) ? '; ' : ', ');
}

function joinNodes(nodes, sep = ', ') {
  const out = [];
  nodes.forEach((n, i) => { if (i) out.push(sep); out.push(n); });
  return out;
}

/** Riga "Taglia tipo (sottotipo), allineamento" in italiano. */
export function typeLine(m) {
  const size = m.size_it || SIZE_IT[m.size] || m.size || '';
  let type;
  if (m.swarm) type = `sciame di ${TYPE_PLURAL_IT[m.type] || m.type} ${(SIZE_IT[m.swarm] || m.swarm).toLowerCase().replace(/a$/, 'e')}`;
  else type = (m.type_it || TYPE_IT[m.type] || m.type || '').toLowerCase();
  const sub = m.subtype ? ` (${m.subtype})` : '';
  const al = m.alignment_it || m.alignment || '';
  return `${type ? type[0].toUpperCase() + type.slice(1) : ''}${sub} di taglia ${size}${al ? ', ' + al : ''}`.trim();
}

export function StatBlock({ monster, compact = false, onRoll }) {
  const [settings] = useDoc('settings', 'app');
  const units = settings?.units || 'm';
  if (!monster) return null;
  const m = monster;
  const ctx = { monster: m, onRoll };
  const ab = m.abilities || {};
  const sp = m.speed || {};

  const speedParts = [];
  speedParts.push(ftToUnits(sp.walk || 0, units));
  for (const k of ['burrow', 'climb', 'fly', 'swim']) {
    if (sp[k]) speedParts.push(`${SPEED_IT[k]} ${ftToUnits(sp[k], units)}${k === 'fly' && sp.hover ? ' (fluttuare)' : ''}`);
  }

  const saves = Object.entries(m.saves || {}).filter(([, v]) => v != null && v !== '');
  const skills = Object.entries(m.skills || {}).filter(([, v]) => v != null && v !== '');
  const senses = m.senses || {};
  const senseParts = Object.entries(SENSE_IT).filter(([k]) => senses[k]).map(([k, it]) => `${it} ${ftToUnits(senses[k], units)}`);
  if (senses.note) senseParts.push(`(${convertDistances(senses.note, units).replace(/blind beyond this radius/g, 'cieco oltre questo raggio').replace(/unimpeded by magical darkness/g, 'non ostacolata dall\'oscurità magica')})`);
  senseParts.push(`Percezione passiva ${senses.passivePerception ?? 10 + abilityMod(ab.wis)}`);

  const acText = [`${m.ac}${m.acNote ? ` (${m.acNote})` : ''}`, ...(m.acAlt || []).map((a) => `${a.value}${a.note ? ` (${a.note})` : ''}`)].join(', ');
  const hpExpr = String(m.hpFormula || '').replace(/\s+/g, '');
  const xpText = `${fmtNum(m.xp)} PE${m.xpInLair ? `, ${fmtNum(m.xpInLair)} PE nella tana` : ''}`;
  const srcTone = m.source === 'Homebrew' ? 'good' : m.source === 'SRD 5.2' ? 'magic' : 'accent';

  return html`<article class="statblock ${compact ? 'compact' : ''}" data-testid="statblock" data-monster=${m.id}>
    <header class="sb-head">
      <div class="sb-title-row">
        <h2 class="sb-name">${m.name}</h2>
        <span class="tag ${srcTone}">${m.source || 'SRD'}</span>
      </div>
      <div class="sb-type">${typeLine(m)}</div>
    </header>
    <div class="sb-rule"></div>
    <div class="sb-props">
      <${Prop} label="Classe Armatura">${acText}</${Prop}>
      <${Prop} label="Punti Ferita">${m.hp}${hpExpr && html` (<${RollBtn} expr=${hpExpr} kind="hp" label=${`${m.name}: punti ferita`} ctx=${ctx}>${m.hpFormula}</${RollBtn}>)`}</${Prop}>
      <${Prop} label="Velocità">${speedParts.join(', ')}</${Prop}>
    </div>
    <div class="sb-rule"></div>
    <div class="sb-abilities">
      ${['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => {
        const mod = abilityMod(ab[k]);
        const save = m.saves?.[k];
        return html`<div class="sb-ab">
          <div class="sb-ab-label">${ABILITY_IT[k]}</div>
          <${RollBtn} expr=${'1d20' + signed(mod)} kind="check" label=${`${m.name}: prova di ${ABILITY_LONG_IT[k]}`} ctx=${ctx} title="Tira una prova di caratteristica">
            <span class="sb-ab-score">${ab[k] ?? 10}</span> <span class="sb-ab-mod">(${signed(mod)})</span>
          </${RollBtn}>
          ${!compact && html`<div class="sb-ab-save ${save != null ? 'prof' : ''}" title="Tiro salvezza">TS ${signed(save != null ? save : mod)}</div>`}
        </div>`;
      })}
    </div>
    <div class="sb-rule"></div>
    <div class="sb-props">
      <${Prop} label="Tiri Salvezza">${saves.length ? joinNodes(saves.map(([k, v]) => html`<${RollBtn} expr=${'1d20' + signed(v)} kind="check" label=${`${m.name}: tiro salvezza su ${ABILITY_LONG_IT[k] || k}`} ctx=${ctx}>${ABILITY_LONG_IT[k]?.slice(0, 3) || k} ${signed(v)}</${RollBtn}>`)) : null}</${Prop}>
      <${Prop} label="Abilità">${skills.length ? joinNodes(skills.map(([k, v]) => html`<${RollBtn} expr=${'1d20' + signed(v)} kind="check" label=${`${m.name}: ${SKILL_IT[k] || k}`} ctx=${ctx}>${SKILL_IT[k] || k} ${signed(v)}</${RollBtn}>`)) : null}</${Prop}>
      <${Prop} label="Vulnerabilità ai danni">${dmgList(m.damageVulnerabilities)}</${Prop}>
      <${Prop} label="Resistenze ai danni">${dmgList(m.damageResistances)}</${Prop}>
      <${Prop} label="Immunità ai danni">${dmgList(m.damageImmunities)}</${Prop}>
      <${Prop} label="Immunità alle condizioni">${(m.conditionImmunities || []).map((c) => CONDITION_IT[c] || c).join(', ') || null}</${Prop}>
      <${Prop} label="Sensi">${senseParts.join(', ')}</${Prop}>
      <${Prop} label="Linguaggi">${m.languages && m.languages !== 'None' ? convertDistances(m.languages, units) : '—'}</${Prop}>
      ${m.gear && html`<${Prop} label="Equipaggiamento">${m.gear}</${Prop}>`}
      <div class="sb-prop sb-cr-row">
        <span><span class="sb-label">Grado di Sfida</span> ${m.cr} (${xpText})</span>
        ${m.profBonus != null && html`<span><span class="sb-label">Bonus di competenza</span> ${signed(m.profBonus)}</span>`}
      </div>
    </div>
    <div class="sb-rule"></div>
    ${m.traits?.length ? html`<section class="sb-section sb-traits">
      ${m.traits.map((e, i) => html`<${Entry} key=${i} e=${e} monster=${m} ctx=${ctx} units=${units} />`)}
    </section>` : null}
    <${Section} title="Azioni" entries=${m.actions} monster=${m} ctx=${ctx} units=${units} />
    <${Section} title="Azioni bonus" entries=${m.bonusActions} monster=${m} ctx=${ctx} units=${units} />
    <${Section} title="Reazioni" entries=${m.reactions} monster=${m} ctx=${ctx} units=${units} />
    <${Section} title="Azioni leggendarie" entries=${m.legendaryActions} monster=${m} ctx=${ctx} units=${units} intro=${m.legendaryDesc} />
    ${!compact && m.description && html`<details class="sb-lore"><summary>Descrizione</summary><div class="prose">${String(m.description).split(/\n+/).map((p) => html`<p>${p}</p>`)}</div></details>`}
  </article>`;
}

export default StatBlock;
