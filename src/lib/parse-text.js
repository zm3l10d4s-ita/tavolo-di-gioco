// Importazione "Incolla testo": trasforma il testo copiato da un manuale (inglese 2014/2024 o italiano)
// in una voce strutturata dello schema dell'app. Puro (nessuna dipendenza da DOM/store): testabile con node.
// Ogni parser ritorna { data, warnings: [] }. I campi non riconosciuti finiscono nella descrizione.

const ABILS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ABIL_ALIASES = {
  str: ['str', 'strength', 'for', 'forza'], dex: ['dex', 'dexterity', 'des', 'destrezza'], con: ['con', 'constitution', 'cos', 'costituzione'],
  int: ['int', 'intelligence', 'intelligenza'], wis: ['wis', 'wisdom', 'sag', 'saggezza'], cha: ['cha', 'charisma', 'car', 'carisma'],
};
const abilOf = (w) => { const k = String(w).toLowerCase().replace(/[^a-zà-ù]/g, ''); return ABILS.find((a) => ABIL_ALIASES[a].includes(k)) || null; };

const SCHOOLS = {
  abjuration: 'abjuration', abiurazione: 'abjuration', conjuration: 'conjuration', evocazione: 'conjuration', divination: 'divination', divinazione: 'divination',
  enchantment: 'enchantment', ammaliamento: 'enchantment', evocation: 'evocation', invocazione: 'evocation', illusion: 'illusion', illusione: 'illusion',
  necromancy: 'necromancy', necromanzia: 'necromancy', transmutation: 'transmutation', trasmutazione: 'transmutation',
};
const CLASS_WORDS = {
  artificer: ['artificer', 'artefice'], bard: ['bard', 'bardo'], cleric: ['cleric', 'chierico'], druid: ['druid', 'druido'], paladin: ['paladin', 'paladino'],
  ranger: ['ranger'], sorcerer: ['sorcerer', 'stregone'], warlock: ['warlock'], wizard: ['wizard', 'mago'], barbarian: ['barbarian', 'barbaro'],
  fighter: ['fighter', 'guerriero'], monk: ['monk', 'monaco'], rogue: ['rogue', 'ladro'],
};
const SKILLS = {
  acrobatics: ['acrobatics', 'acrobazia'], 'animal-handling': ['animal handling', 'addestrare animali'], arcana: ['arcana', 'arcano'],
  athletics: ['athletics', 'atletica'], deception: ['deception', 'inganno'], history: ['history', 'storia'], insight: ['insight', 'intuizione'],
  intimidation: ['intimidation', 'intimidire'], investigation: ['investigation', 'indagare'], medicine: ['medicine', 'medicina'],
  nature: ['nature', 'natura'], perception: ['perception', 'percezione'], performance: ['performance', 'intrattenere'],
  persuasion: ['persuasion', 'persuasione'], religion: ['religion', 'religione'], 'sleight-of-hand': ['sleight of hand', 'rapidità di mano', 'rapidita di mano'],
  stealth: ['stealth', 'furtività', 'furtivita'], survival: ['survival', 'sopravvivenza'],
};
const SIZES = [['Tiny', /^(tiny|minuscol)/i], ['Small', /^(small|piccol)/i], ['Medium', /^(medium|medi)/i], ['Large', /^(large|grand)/i], ['Huge', /^(huge|enorm)/i], ['Gargantuan', /^(gargantuan|mastodontic)/i]];
const TYPES = [['aberration', /^aberra/i], ['beast', /^(beast|besti)/i], ['celestial', /^celest/i], ['construct', /^(construct|costrutt)/i], ['dragon', /^(dragon|drag)/i],
  ['elemental', /^elementa/i], ['fey', /^(fey|follett)/i], ['fiend', /^(fiend|immond)/i], ['giant', /^(giant|gigant)/i], ['humanoid', /^(humanoid|umanoid)/i],
  ['monstrosity', /^(monstrosit|mostruosit)/i], ['ooze', /^(ooze|melm)/i], ['plant', /^(plant|vegetal)/i], ['undead', /^(undead|non mort)/i]];
const RARITIES = [['very-rare', /very rare|molto rar/i], ['uncommon', /uncommon|non comune/i], ['common', /\bcommon\b|\bcomune\b/i], ['rare', /\brare\b|\brar[oa]\b/i],
  ['legendary', /legendary|leggendari/i], ['artifact', /artifact|artefatto/i], ['varies', /varies|variabile/i]];
const ITEM_TYPES = [['wondrous-item', /wondrous|meraviglios/i], ['weapon', /^weapon|^arma\b/i], ['armor', /^armor|^armatura/i], ['ring', /^ring|^anello/i],
  ['potion', /^potion|^pozione/i], ['rod', /^rod|^verga/i], ['staff', /^staff|^bastone/i], ['wand', /^wand|^bacchetta/i], ['scroll', /^scroll|^pergamena/i]];

// ------------------------------------------------------------------ utilità di testo
export function cleanText(text) {
  return String(text || '').replace(/\r/g, '').replace(/ /g, ' ').replace(/[−–]/g, '-').replace(/[ \t]+/g, ' ')
    .replace(/(\w)-\n(\w)/g, '$1$2') // sillabazione a fine riga (PDF)
    .split('\n').map((l) => l.trim()).join('\n').trim();
}
const lines = (t) => t.split('\n').map((l) => l.trim()).filter(Boolean);
function titleCase(s) {
  if (!s || s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s;
  return s.toLowerCase().replace(/(^|[\s(\-/])([a-zà-ù])/g, (m, a, b) => a + b.toUpperCase());
}
/** Riunisce righe spezzate (copia da PDF) in paragrafi: una riga che non termina con punteggiatura continua nella successiva. */
function paragraphs(ls) {
  const out = [];
  for (const l of ls) {
    const prev = out[out.length - 1];
    if (prev != null && !/[.:!?;”"»)]$/.test(prev) && /^[a-zà-ù0-9(,;]/.test(l)) out[out.length - 1] = prev + ' ' + l;
    else out.push(l);
  }
  return out;
}
/** Estrae una riga "Etichetta: valore" (prima occorrenza), la rimuove dall'elenco e ritorna il valore. */
function takeField(ls, labels) {
  const re = new RegExp(`^(?:${labels.join('|')})\\s*[:.]?\\s+(.+)$`, 'i');
  const i = ls.findIndex((l) => re.test(l));
  if (i < 0) return null;
  const v = ls[i].match(re)[1].trim();
  ls.splice(i, 1);
  return v;
}
function takeSource(ls) {
  const i = ls.findIndex((l) => /^(source|fonte)\s*:/i.test(l));
  if (i < 0) return null;
  const v = ls[i].replace(/^(source|fonte)\s*:\s*/i, '').trim();
  ls.splice(i, 1);
  return v;
}
const ENTRY_RE = /^([A-ZÀ-Ý][^.:!?]{0,70}?(?:\s*\([^)]{0,60}\))?)\.\s+(.+)$/;
/** Divide un blocco di righe in voci "Nome. Descrizione" (tratti, azioni, privilegi). */
export function splitEntries(ls) {
  const entries = []; const loose = [];
  for (const p of paragraphs(ls)) {
    const m = p.match(ENTRY_RE);
    if (m && m[1].split(/\s+/).length <= 9 && !/^(the|a|an|il|lo|la|un|una|if|se|when|quando|you|tu)\b/i.test(m[1])) entries.push({ name: m[1].trim(), desc: m[2].trim() });
    else if (entries.length) entries[entries.length - 1].desc += '\n\n' + p;
    else loose.push(p);
  }
  return { entries, loose };
}
const ftFromMeters = (m) => Math.round((Number(String(m).replace(',', '.')) / 1.5) * 5);
function distanceFt(str) {
  const s = String(str);
  const ft = s.match(/(\d[\d,.]*)\s*(?:ft|feet|foot|piedi)\b/i);
  if (ft) return Number(ft[1].replace(/,/g, ''));
  const m = s.match(/(\d[\d,.]*)\s*(?:m|metri|metro)\b/i);
  if (m) return ftFromMeters(m[1]);
  return null;
}

// ------------------------------------------------------------------ incantesimi
export function parseSpell(text) {
  const warnings = [];
  const ls = lines(cleanText(text));
  const source = takeSource(ls);
  const data = { name: titleCase(ls.shift() || 'Incantesimo'), level: 0, school: 'evocation', ritual: false, classes: [] };
  if (source) data.sourceNote = source;
  // riga livello/scuola
  const li = ls.findIndex((l) => /cantrip|trucchett|level|livello/i.test(l) && l.length < 90);
  if (li >= 0) {
    const l = ls[li];
    let m;
    if ((m = l.match(/(\d)(?:st|nd|rd|th)?[- ]level\s+([a-z]+)/i)) || (m = l.match(/level\s+(\d)\s+([a-z]+)/i))) { data.level = Number(m[1]); data.school = SCHOOLS[m[2].toLowerCase()] || data.school; }
    else if ((m = l.match(/([a-zà-ù]+)\s+di\s+(\d)\s*°?\s*livello/i)) || (m = l.match(/([a-zà-ù]+)\s+di\s+livello\s+(\d)/i))) { data.school = SCHOOLS[m[1].toLowerCase()] || data.school; data.level = Number(m[2]); }
    else if ((m = l.match(/([a-z]+)\s+cantrip/i)) || (m = l.match(/trucchetto\s+(?:di\s+)?([a-zà-ù]+)/i)) || (m = l.match(/([a-zà-ù]+)\s+trucchetto/i))) { data.level = 0; data.school = SCHOOLS[m[1].toLowerCase()] || data.school; }
    else warnings.push('Livello e scuola non riconosciuti: controllali.');
    data.ritual = /ritual|rituale/i.test(l);
    const par = l.match(/\(([^)]+)\)/);
    if (par) data.classes = classList(par[1]);
    ls.splice(li, 1);
  } else warnings.push('Riga "livello/scuola" non trovata.');
  data.castingTime = takeField(ls, ['casting time', 'tempo di lancio']) || '1 action';
  if (/ritual|rituale/i.test(data.castingTime)) { data.ritual = true; data.castingTime = data.castingTime.replace(/\s*(?:or\s+)?\(?ritual[e]?\)?/i, '').trim(); }
  data.range = takeField(ls, ['range', 'gittata']) || 'Self';
  const rft = distanceFt(data.range);
  data.rangeFt = rft;
  const comp = takeField(ls, ['components', 'componenti']) || '';
  const mat = comp.match(/\((.+)\)/);
  const letters = comp.replace(/\(.+\)/, '').toUpperCase();
  data.components = { v: /\bV\b/.test(letters), s: /\bS\b/.test(letters), m: /\bM\b/.test(letters), material: mat ? mat[1].trim() : null };
  data.duration = takeField(ls, ['duration', 'durata']) || 'Instantaneous';
  data.concentration = /concentration|concentrazione/i.test(data.duration);
  const cl = takeField(ls, ['classes', 'classi', 'spell lists', 'liste degli incantesimi', 'liste di incantesimi']);
  if (cl) data.classes = classList(cl);
  // descrizione e livelli superiori
  const body = paragraphs(ls);
  const hi = body.findIndex((p) => /^(at higher levels|using a higher-level spell slot|cantrip upgrade|a livelli superiori|usare uno slot di livello superiore|potenziamento del trucchetto)\b/i.test(p));
  const sl = body.findIndex((p) => /^(spell lists|liste degli incantesimi)\b/i.test(p));
  if (sl >= 0) { data.classes = data.classes.length ? data.classes : classList(body[sl].replace(/^[^.:]+[.:]/, '')); body.splice(sl, 1); }
  if (hi >= 0) {
    data.higherLevel = body.slice(hi).join('\n\n').replace(/^(at higher levels|using a higher-level spell slot|cantrip upgrade|a livelli superiori|usare uno slot di livello superiore|potenziamento del trucchetto)\s*[.:]\s*/i, '');
    data.desc = body.slice(0, hi).join('\n\n');
  } else { data.desc = body.join('\n\n'); data.higherLevel = ''; }
  if (!data.desc) warnings.push('Nessuna descrizione trovata.');
  return { data, warnings };
}
function classList(s) {
  const out = [];
  for (const w of String(s).split(/[,;/]|\band\b|\be\b/i)) {
    const k = w.trim().toLowerCase();
    const c = Object.entries(CLASS_WORDS).find(([, al]) => al.some((a) => k === a || k.startsWith(a + ' ')));
    if (c && !out.includes(c[0])) out.push(c[0]);
  }
  return out;
}

// ------------------------------------------------------------------ mostri
const SECTION_RE = [
  ['bonusActions', /^(bonus actions|azioni bonus)$/i], ['legendaryActions', /^(legendary actions|azioni leggendarie)$/i],
  ['reactions', /^(reactions|reazioni)$/i], ['actions', /^(actions|azioni)$/i], ['mythic', /^(mythic actions|azioni mitiche)$/i],
  ['lair', /^(lair actions|azioni della tana)$/i], ['traits', /^(traits|tratti)$/i],
];
export function parseMonster(text) {
  const warnings = [];
  const ls = lines(cleanText(text));
  const source = takeSource(ls);
  const m = { name: titleCase(ls.shift() || 'Mostro'), size: 'Medium', type: 'humanoid', subtype: null, alignment: 'unaligned', ac: 10, acNote: '', hp: 1, hpFormula: '',
    speed: { walk: 30, fly: 0, swim: 0, climb: 0, burrow: 0, hover: false }, abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saves: {}, skills: {}, damageVulnerabilities: [], damageResistances: [], damageImmunities: [], conditionImmunities: [], senses: { passivePerception: 10 },
    languages: '—', cr: '0', traits: [], actions: [], bonusActions: [], reactions: [], legendaryActions: [], legendaryDesc: '', environments: [] };
  if (source) m.sourceNote = source;
  // taglia / tipo / allineamento
  const ti = ls.findIndex((l, i) => i < 4 && SIZES.some(([, r]) => l.split(/\s+/).some((w) => r.test(w))) && TYPES.some(([, r]) => l.split(/[\s(,]+/).some((w) => r.test(w))));
  if (ti >= 0) {
    const l = ls[ti];
    const words = l.split(/[\s,]+/);
    m.size = (SIZES.find(([, r]) => words.some((w) => r.test(w))) || ['Medium'])[0];
    const tw = l.split(/[\s(,]+/);
    m.type = (TYPES.find(([, r]) => tw.some((w) => r.test(w))) || ['humanoid'])[0];
    const sub = l.match(/\(([^)]+)\)/); if (sub) m.subtype = sub[1];
    const al = l.split(',').slice(1).join(',').trim(); if (al) m.alignment = al;
    ls.splice(ti, 1);
  } else warnings.push('Taglia e tipo non riconosciuti.');
  let v;
  if ((v = takeField(ls, ['armor class', 'ac', 'classe armatura', 'ca']))) {
    const mm = v.match(/(\d+)\s*(?:\(([^)]+)\))?/); if (mm) { m.ac = Number(mm[1]); m.acNote = mm[2] || ''; }
  }
  if ((v = takeField(ls, ['hit points', 'hp', 'punti ferita', 'pf']))) {
    const mm = v.match(/(\d+)\s*(?:\(([^)]+)\))?/); if (mm) { m.hp = Number(mm[1]); m.hpFormula = (mm[2] || '').replace(/\s+/g, ' '); }
  }
  if ((v = takeField(ls, ['speed', 'velocità', 'velocita']))) m.speed = parseSpeed(v);
  takeField(ls, ['initiative', 'iniziativa']);
  // caratteristiche
  parseAbilities(ls, m, warnings);
  if ((v = takeField(ls, ['saving throws', 'tiri salvezza', 'ts']))) for (const p of v.split(/[,;]/)) { const mm = p.trim().match(/^([a-zà-ù]+)\.?\s*([+-]\d+)/i); if (mm && abilOf(mm[1])) m.saves[abilOf(mm[1])] = Number(mm[2]); }
  if ((v = takeField(ls, ['skills', 'abilità', 'abilita']))) for (const p of v.split(/[,;]/)) {
    const mm = p.trim().match(/^(.+?)\s*([+-]\d+)$/); if (!mm) continue;
    const k = mm[1].trim().toLowerCase(); const id = Object.entries(SKILLS).find(([, al]) => al.includes(k))?.[0];
    if (id) m.skills[id] = Number(mm[2]);
  }
  const list = (s) => (s ? s.split(/;|,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean) : []);
  m.damageVulnerabilities = list(takeField(ls, ['damage vulnerabilities', 'vulnerabilities', 'vulnerabilità ai danni', 'vulnerabilità']));
  m.damageResistances = list(takeField(ls, ['damage resistances', 'resistances', 'resistenze ai danni', 'resistenze']));
  m.damageImmunities = list(takeField(ls, ['damage immunities', 'immunità ai danni']));
  m.conditionImmunities = list(takeField(ls, ['condition immunities', 'immunità alle condizioni']));
  const imm = takeField(ls, ['immunities', 'immunità']);
  if (imm) { const [d, c] = imm.split(';'); m.damageImmunities.push(...list(d)); m.conditionImmunities.push(...list(c)); }
  if ((v = takeField(ls, ['senses', 'sensi']))) m.senses = parseSenses(v);
  takeField(ls, ['gear', 'equipaggiamento']);
  if ((v = takeField(ls, ['languages', 'linguaggi', 'lingue']))) m.languages = v;
  if ((v = takeField(ls, ['challenge', 'cr', 'grado di sfida', 'sfida', 'gs']))) {
    const mm = v.match(/(\d+\/\d+|\d+)/); if (mm) m.cr = mm[1];
  } else warnings.push('Grado di sfida non trovato.');
  takeField(ls, ['proficiency bonus', 'bonus di competenza']);
  // sezioni
  let cur = 'traits'; const buckets = { traits: [] };
  for (const l of ls) {
    const sec = SECTION_RE.find(([, r]) => r.test(l.replace(/[:.]$/, '')));
    if (sec) { cur = sec[0]; buckets[cur] = buckets[cur] || []; continue; }
    (buckets[cur] = buckets[cur] || []).push(l);
  }
  for (const k of ['traits', 'actions', 'bonusActions', 'reactions', 'legendaryActions']) {
    const { entries, loose } = splitEntries(buckets[k] || []);
    m[k] = entries;
    if (k === 'legendaryActions') m.legendaryDesc = loose.join('\n\n');
    else if (loose.length && k === 'traits' && !entries.length && loose.join(' ').length > 0) m.description = loose.join('\n\n');
    else if (loose.length && entries.length === 0 && k !== 'traits') m[k] = [{ name: k === 'actions' ? 'Azione' : 'Voce', desc: loose.join('\n\n') }];
  }
  if (buckets.mythic || buckets.lair) m.description = [m.description, ...(buckets.mythic || []), ...(buckets.lair || [])].filter(Boolean).join('\n\n');
  if (!m.actions.length) warnings.push('Nessuna azione riconosciuta: controlla la sezione "Actions/Azioni".');
  return { data: m, warnings };
}
function parseSpeed(v) {
  const sp = { walk: 0, fly: 0, swim: 0, climb: 0, burrow: 0, hover: /hover|fluttua/i.test(v) };
  for (const part of v.split(/,|;/)) {
    const ft = distanceFt(part); if (ft == null) continue;
    const p = part.toLowerCase();
    if (/fly|volare|volo/.test(p)) sp.fly = ft; else if (/swim|nuotare|nuoto/.test(p)) sp.swim = ft;
    else if (/climb|scalare/.test(p)) sp.climb = ft; else if (/burrow|scavare/.test(p)) sp.burrow = ft; else sp.walk = ft;
  }
  return sp;
}
function parseSenses(v) {
  const s = { passivePerception: 10 };
  const pp = v.match(/(?:passive perception|percezione passiva)\s*(\d+)/i); if (pp) s.passivePerception = Number(pp[1]);
  for (const [k, r] of [['darkvision', /(?:darkvision|scurovisione)\s*([\d.,]+\s*(?:ft|feet|m|metri)\.?)/i], ['blindsight', /(?:blindsight|vista cieca)\s*([\d.,]+\s*(?:ft|feet|m|metri)\.?)/i],
    ['tremorsense', /(?:tremorsense|percezione tellurica|senso tellurico)\s*([\d.,]+\s*(?:ft|feet|m|metri)\.?)/i], ['truesight', /(?:truesight|vista pura|visione del vero)\s*([\d.,]+\s*(?:ft|feet|m|metri)\.?)/i]]) {
    const mm = v.match(r); if (mm) s[k] = distanceFt(mm[1]);
  }
  return s;
}
function parseAbilities(ls, m, warnings) {
  const joined = ls.join('\n');
  // 2014: "STR DEX CON INT WIS CHA" + "8 (-1) 14 (+2) ..."
  const vals = [...joined.matchAll(/\b(\d{1,2})\s*\(\s*[+-]?\d+\s*\)/g)];
  let found = false;
  if (vals.length >= 6) {
    ABILS.forEach((a, i) => { m.abilities[a] = Number(vals[i][1]); });
    found = true;
    // rimuovi le righe di intestazione e valori
    for (let i = ls.length - 1; i >= 0; i--) if (/^(str|for)\b.*\b(cha|car)\b/i.test(ls[i]) || /^(?:\d{1,2}\s*\(\s*[+-]?\d+\s*\)\s*){1,6}$/.test(ls[i])) ls.splice(i, 1);
  } else {
    // 2024: "Str 21 +5 +5 Dex 9 -1 +3 ..." / "FOR 21 +5 +5"
    for (const a of ABILS) {
      for (const al of ABIL_ALIASES[a].slice(0, 2).concat(ABIL_ALIASES[a].slice(2, 3))) {
        const mm = joined.match(new RegExp(`\\b${al}\\s+(\\d{1,2})\\s+[+-]\\d+(?:\\s+([+-]\\d+))?`, 'i'));
        if (mm) { m.abilities[a] = Number(mm[1]); if (mm[2] && Number(mm[2]) !== Math.floor((Number(mm[1]) - 10) / 2)) m.saves[a] = Number(mm[2]); found = true; break; }
      }
    }
    if (found) for (let i = ls.length - 1; i >= 0; i--) if (/^((str|dex|con|int|wis|cha|for|des|cos|sag|car|mod|save|ts)\b[\s\d+-]*){1,}$/i.test(ls[i])) ls.splice(i, 1);
  }
  if (!found) warnings.push('Caratteristiche non riconosciute: controlla FOR/DES/COS/INT/SAG/CAR.');
}

// ------------------------------------------------------------------ oggetti magici
export function parseItem(text) {
  const warnings = [];
  const ls = lines(cleanText(text));
  const source = takeSource(ls);
  const data = { name: titleCase(ls.shift() || 'Oggetto'), type: 'wondrous-item', rarity: 'common', attunement: false, attunementReq: null, subtitle: '' };
  if (source) data.sourceNote = source;
  const si = ls.findIndex((l, i) => i < 3 && ITEM_TYPES.some(([, r]) => r.test(l)) && l.length < 140);
  if (si >= 0) {
    const l = ls[si];
    data.subtitle = l;
    data.type = (ITEM_TYPES.find(([, r]) => r.test(l)) || ['wondrous-item'])[0];
    data.rarity = (RARITIES.find(([, r]) => r.test(l)) || ['common'])[0];
    const att = l.match(/\((requires attunement|richiede (?:la )?sintonia|requires attunement by [^)]+|richiede (?:la )?sintonia [^)]+)\)/i);
    if (att) { data.attunement = true; const by = att[1].replace(/^(requires attunement|richiede (?:la )?sintonia)\s*/i, '').trim(); data.attunementReq = by || null; }
    ls.splice(si, 1);
  } else warnings.push('Riga "tipo, rarità" non trovata (es. "Wondrous item, rare (requires attunement)").');
  data.desc = paragraphs(ls).join('\n\n');
  return { data, warnings };
}

// ------------------------------------------------------------------ voci generiche: talenti, opzioni di classe, background
export function parseGeneric(text) {
  const warnings = [];
  const ls = lines(cleanText(text));
  const source = takeSource(ls);
  const data = { name: titleCase(ls.shift() || 'Voce') };
  if (source) data.sourceNote = source;
  const pre = takeField(ls, ['prerequisites?', 'prerequisit[oi]', 'requisit[oi]']);
  if (pre) data.prerequisiteText = pre;
  const lvl = ls.findIndex((l) => /^(?:\w+\s+feat|talento\s+\w+)/i.test(l) && l.length < 80);
  if (lvl >= 0 && lvl < 2) { data.featType = ls[lvl]; const p = ls[lvl].match(/\(([^)]*prerequisit[^)]*)\)/i); if (p && !data.prerequisiteText) data.prerequisiteText = p[1].replace(/^prerequisit\w*\s*:?\s*/i, ''); ls.splice(lvl, 1); }
  data.desc = paragraphs(ls).join('\n\n');
  if (!data.desc) warnings.push('Nessuna descrizione trovata.');
  return { data, warnings };
}
export function parseBackground(text) {
  const { data, warnings } = parseGeneric(text);
  const body = data.desc.split('\n\n');
  const grab = (labels) => { const re = new RegExp(`^(?:${labels})\\s*[:.]\\s*(.+)$`, 'i'); const p = body.find((x) => re.test(x)); return p ? p.match(re)[1] : null; };
  const sk = grab('skill proficiencies|competenze nelle abilità|competenze in abilità|abilità');
  if (sk) data.skillProficiencies = sk.split(/,|\band\b|\be\b/).map((s) => { const k = s.trim().toLowerCase(); return Object.entries(SKILLS).find(([, al]) => al.includes(k))?.[0]; }).filter(Boolean);
  const tools = grab('tool proficiencies|competenze negli strumenti|strumenti'); if (tools) data.toolProficienciesText = tools;
  const fi = body.findIndex((p) => /^(feature|privilegio)\s*:/i.test(p));
  if (fi >= 0) data.feature = { name: body[fi].replace(/^(feature|privilegio)\s*:\s*/i, '').trim(), desc: body.slice(fi + 1, fi + 2).join('') };
  return { data, warnings };
}

// ------------------------------------------------------------------ razze / specie
export function parseRace(text) {
  const warnings = [];
  const ls = lines(cleanText(text));
  const source = takeSource(ls);
  const data = { name: titleCase(ls.shift() || 'Razza'), speed: 30, size: 'medium', abilityBonuses: [], languages: [], traits: [] };
  if (source) data.sourceNote = source;
  const { entries, loose } = splitEntries(ls);
  data.desc = loose.join('\n\n');
  for (const e of entries) {
    const n = e.name.toLowerCase();
    if (/^(speed|velocità|velocita)$/.test(n)) { const ft = distanceFt(e.desc); if (ft) data.speed = ft; }
    if (/^(size|taglia)$/.test(n)) { const s = SIZES.find(([, r]) => e.desc.split(/[\s,.]+/).some((w) => r.test(w))); if (s) data.size = s[0].toLowerCase(); }
    if (/^(ability score increase|ability scores|aumento dei punteggi di caratteristica|punteggi di caratteristica)/.test(n)) {
      for (const mm of e.desc.matchAll(/(strength|dexterity|constitution|intelligence|wisdom|charisma|forza|destrezza|costituzione|intelligenza|saggezza|carisma)\b[^.,;]*?(?:by|di)\s*(\d)/gi)) {
        const a = abilOf(mm[1]); if (a) data.abilityBonuses.push({ ability: a, bonus: Number(mm[2]) });
      }
    }
    if (/^(languages|linguaggi|lingue)$/.test(n)) data.languageDesc = e.desc;
    data.traits.push({ id: n.replace(/[^a-z0-9]+/g, '-'), name: e.name, desc: e.desc });
  }
  if (!entries.length) warnings.push('Nessun tratto riconosciuto (formato atteso: "Nome del tratto. Descrizione").');
  return { data, warnings };
}

// ------------------------------------------------------------------ sottoclassi / classi (privilegi per livello)
const LEVEL_RE = [/\((\d+)(?:st|nd|rd|th)?[- ]?level\)/i, /^level\s+(\d+)\s*[:.]/i, /\b(\d+)(?:st|nd|rd|th) level\b/i, /\b(\d+)\s*°\s*livello/i, /\blivello\s+(\d+)/i];
const levelIn = (s) => { for (const r of LEVEL_RE) { const m = String(s).match(r); if (m) return Number(m[1]); } return null; };
export function parseSubclass(text) {
  const warnings = [];
  const ls = lines(cleanText(text));
  const source = takeSource(ls);
  const data = { name: titleCase(ls.shift() || 'Sottoclasse'), features: [] };
  if (source) data.sourceNote = source;
  const intro = []; let cur = null;
  const isHeading = (l, next) => l.length <= 60 && !/[.:,;]$/.test(l) && /^[A-ZÀ-Ý0-9]/.test(l) && next != null && (/^level\s+\d+\s*:/i.test(l) || l.split(/\s+/).length <= 8);
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i];
    if (isHeading(l, ls[i + 1])) {
      const name = l.replace(/^level\s+\d+\s*:\s*/i, '').replace(/\s*\(\d+\w*[- ]?level\)/i, '').trim();
      cur = { id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, level: levelIn(l), desc: '' };
      data.features.push(cur);
    } else if (cur) cur.desc += (cur.desc ? '\n' : '') + l;
    else intro.push(l);
  }
  for (const f of data.features) { f.desc = paragraphs(f.desc.split('\n')).join('\n\n'); if (f.level == null) f.level = levelIn(f.desc.slice(0, 160)); }
  data.desc = paragraphs(intro).join('\n\n');
  if (!data.features.length) {
    const { entries, loose } = splitEntries(ls);
    data.features = entries.map((e) => ({ id: e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: e.name, level: levelIn(e.desc.slice(0, 160)), desc: e.desc }));
    data.desc = loose.join('\n\n');
  }
  if (!data.features.length) warnings.push('Nessun privilegio riconosciuto: le intestazioni dei privilegi devono stare su righe proprie.');
  if (data.features.some((f) => f.level == null)) warnings.push('Ad alcuni privilegi manca il livello: puoi correggerlo dopo.');
  return { data, warnings };
}

/** Parser per dataset. */
export const PARSERS = {
  spells: parseSpell, monsters: parseMonster, magicItems: parseItem, equipment: parseItem, feats: parseGeneric, classOptions: parseGeneric,
  backgrounds: parseBackground, races: parseRace, subraces: parseRace, subclasses: parseSubclass, classes: parseSubclass,
};
export function parseFor(dataset, text) { return (PARSERS[dataset] || parseGeneric)(text); }
