// Scheda personaggio: intestazione di combattimento sempre visibile + schede (tab).
import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { useSrd } from '../../lib/hooks.js';
import { Button, Tabs, Empty, toast } from '../../components/ui.js';
import * as R from '../../lib/rules.js';
import { signed } from '../../lib/util.js';
import { applyHp, classLabel, raceLabel, slotsNeedSync, syncSlots, dawn } from './logic.js';
import { useCharacter, useUnits, useRollMode, useLastRoll, rollCheck, InlineNum, Pips } from './widgets.js';
import { MainTab } from './tab-main.js';
import { CombatTab } from './tab-combat.js';
import { SpellsTab } from './tab-spells.js';
import { InventoryTab } from './tab-inventory.js';
import { FeaturesTab } from './tab-features.js';
import { StoryTab, NotesTab } from './tab-story.js';
import { LevelUpModal } from './levelup.js';
import { ShortRestModal, LongRestModal } from './rest.js';

const TABS = [
  { id: 'main', label: 'Principale' }, { id: 'combat', label: 'Combattimento' }, { id: 'spells', label: 'Incantesimi' },
  { id: 'inventory', label: 'Inventario' }, { id: 'features', label: 'Privilegi' }, { id: 'story', label: 'Personalità & Storia' }, { id: 'notes', label: 'Note' },
];
const tabMemo = {}; // tab attiva per personaggio (durante la sessione dell'app)

function useData() {
  const d = {};
  for (const k of ['classes', 'subclasses', 'levels', 'equipment', 'magicItems', 'spells', 'races', 'subraces', 'backgrounds', 'feats', 'conditions', 'skills', 'rules', 'languages'])
    d[k] = useSrd(k).items;
  return d;
}

function HpBlock({ c, mutate }) {
  const [amt, setAmt] = useState('');
  const max = R.maxHp(c);
  const cur = Number(c.hp.current ?? max);
  const temp = Number(c.hp.temp) || 0;
  const pct = max ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  const apply = (sign) => {
    const t = String(amt).trim();
    let v = parseInt(t.replace(/^[+-]/, ''), 10);
    if (!v) return;
    if (sign === 0) sign = t.startsWith('+') ? 1 : -1;
    let info;
    mutate((d) => { const r = applyHp(d, sign * v); info = r.info; return r.character; });
    if (sign < 0) toast(`${c.name}: −${v} PF${info.fromTemp ? ` (${info.fromTemp} dai temporanei)` : ''} → ${info.after}/${info.max}${info.droppedToZero ? ' — a 0 PF!' : ''}`, 'bad');
    else toast(`${c.name}: +${info.healed} PF → ${info.after}/${info.max}`, 'good');
    setAmt('');
  };
  return html`<div class="cs-hp ${cur <= 0 ? 'down' : ''}" data-testid="hp-block">
    <div class="cs-hp-top">
      <span class="cs-label">Punti ferita</span>
      <span class="cs-hp-val"><b data-testid="hp-current">${cur}</b><span class="faint"> / </span><span data-testid="hp-max">${max}</span></span>
      ${temp > 0 && html`<span class="tag magic" data-testid="hp-temp-tag">+${temp} temp</span>`}
    </div>
    <div class="cs-hpbar"><i style=${`width:${pct}%`} class=${pct <= 25 ? 'low' : pct <= 50 ? 'mid' : ''}></i>${temp > 0 && html`<em style=${`width:${Math.min(100, (temp / Math.max(1, max)) * 100)}%`}></em>`}</div>
    <div class="cs-hp-ctl">
      <input class="input cs-inline cs-hp-amt" type="text" inputmode="numeric" placeholder="PF" value=${amt} data-testid="hp-amount"
        title="Invio = danno · +N e Invio = cura" onInput=${(e) => setAmt(e.currentTarget.value)} onKeyDown=${(e) => e.key === 'Enter' && apply(0)} />
      <button class="btn sm cs-dmg" onClick=${() => apply(-1)} data-testid="hp-damage">Danno</button>
      <button class="btn sm cs-heal" onClick=${() => apply(1)} data-testid="hp-heal">Cura</button>
      <label class="cs-temp" title="Punti ferita temporanei"><span class="faint">Temp</span>
        <${InlineNum} value=${temp} min=${0} onInput=${(v) => mutate((d) => { d.hp.temp = v ?? 0; })} testid="hp-temp" /></label>
    </div>
    ${cur <= 0 && html`<div class="cs-death" data-testid="death-saves">
      <span class="cs-label">TS morte</span>
      <span class="good-t">✓</span><${Pips} max=${3} used=${3 - c.deathSaves.successes} tone="good"
        onUse=${() => mutate((d) => { d.deathSaves.successes = Math.max(0, d.deathSaves.successes - 1); })}
        onRestore=${() => mutate((d) => { d.deathSaves.successes = Math.min(3, d.deathSaves.successes + 1); })} />
      <span class="bad-t">✗</span><${Pips} max=${3} used=${3 - c.deathSaves.failures} tone="bad"
        onUse=${() => mutate((d) => { d.deathSaves.failures = Math.max(0, d.deathSaves.failures - 1); })}
        onRestore=${() => mutate((d) => { d.deathSaves.failures = Math.min(3, d.deathSaves.failures + 1); })} />
      <button class="btn ghost sm" onClick=${(e) => rollCheck(c, 'TS contro morte', 0, e, 'death')}>Tira</button>
    </div>`}
  </div>`;
}

function Tile({ label, value, sub, onClick, testid, title, className = '' }) {
  const Tag = onClick ? 'button' : 'div';
  return html`<${Tag} type=${onClick ? 'button' : undefined} class="cs-tile ${onClick ? 'click' : ''} ${className}" onClick=${onClick} title=${title} data-testid=${testid}>
    <span class="cs-tile-label">${label}</span><span class="cs-tile-val">${value}</span>${sub != null && html`<span class="cs-tile-sub">${sub}</span>`}
  </${Tag}>`;
}

function Header({ c, mutate, data, units, onBack, onLevelUp, onShort, onLong }) {
  const [mode, setMode] = useRollMode();
  const last = useLastRoll();
  const acd = R.armorClassDetail(c, data.equipment);
  const ac = acd.ac + (Number(c.acTemp) || 0);
  const acTitle = acd.override ? `Valore manuale (calcolato ${acd.computed})` : `${acd.armor ? acd.armor.name : 'Senza armatura'} ${acd.base} + DES ${acd.dex}${acd.shield ? ` + scudo ${acd.shield}` : ''}${acd.bonus ? ` + ${acd.bonus}` : ''}`;
  const dc = R.spellSaveDc(c);
  const conds = data.conditions.filter((x) => x.id !== 'exhaustion');
  const condName = (id) => conds.find((x) => x.id === id)?.name_it || id;
  const exh = Number(c.exhaustion) || 0;
  return html`<header class="cs-head" data-testid="sheet-header">
    <div class="cs-head-row">
      <button class="btn ghost sm" onClick=${onBack} title="Torna all'elenco" data-testid="back-to-list">←</button>
      <div class="cs-ident">
        <h1 class="cs-name" data-testid="sheet-name">${c.name || 'Senza nome'}</h1>
        <div class="cs-sub muted" data-testid="sheet-sub">${[raceLabel(c), classLabel(c), c.alignment].filter(Boolean).join(' · ')}</div>
      </div>
      <div class="cs-conds" data-testid="conditions">
        ${c.spellcasting.concentration && html`<span class="tag magic cs-conc" title="Concentrazione">◎ ${c.spellcasting.concentration}
          <button class="cs-x" title="Termina concentrazione" onClick=${() => mutate((d) => { d.spellcasting.concentration = ''; })}>✕</button></span>`}
        ${c.conditions.map((id) => html`<span class="tag bad">${condName(id)}<button class="cs-x" title="Rimuovi" onClick=${() => mutate((d) => { d.conditions = d.conditions.filter((x) => x !== id); })}>✕</button></span>`)}
        <select class="input cs-inline cs-cond-add" value="" data-testid="condition-add" title="Aggiungi una condizione" onChange=${(e) => { const v = e.currentTarget.value; if (v) mutate((d) => { if (!d.conditions.includes(v)) d.conditions.push(v); }); e.currentTarget.value = ''; }}>
          <option value="">+ Condizione</option>
          ${conds.filter((x) => !c.conditions.includes(x.id)).map((x) => html`<option value=${x.id}>${x.name_it || x.name}</option>`)}
        </select>
      </div>
      <span class="spacer"></span>
      ${last && last.characterId === c.id && html`<span class="cs-last" title=${last.text}>🎲 ${last.label}: <b>${last.total}</b></span>`}
      <div class="cs-seg" role="group" aria-label="Prossimo tiro" title="Modalità del prossimo tiro (oppure Shift = vantaggio, Alt = svantaggio)">
        ${[['normal', 'Normale', 'Norm.'], ['adv', 'Vantaggio', 'Vant.'], ['dis', 'Svantaggio', 'Svant.']].map(([k, l, sh]) => html`<button class=${mode === k ? 'on ' + k : ''} onClick=${() => setMode(k)} data-testid=${'mode-' + k} title=${l}><span class="cs-full">${l}</span><span class="cs-short">${sh}</span></button>`)}
      </div>
      <div class="cs-actions">
      <${Button} size="sm" onClick=${onLevelUp} data-testid="level-up">▲ Livello</${Button}>
      <${Button} size="sm" onClick=${onShort} data-testid="short-rest">Riposo breve</${Button}>
      <${Button} size="sm" onClick=${onLong} data-testid="long-rest">Riposo lungo</${Button}>
      <${Button} size="sm" variant="ghost" title="Ripristina le risorse che si ricaricano all'alba" data-testid="dawn"
        onClick=${() => { let s; mutate((d) => { const r = dawn(d); s = r.summary; return r.character; }); toast('Alba — ' + s.join(' · ')); }}>☀ Alba</${Button}>
      </div>
    </div>
    <div class="cs-head-row cs-head-stats">
      <${HpBlock} c=${c} mutate=${mutate} />
      <${Tile} label="CA" value=${ac} sub=${c.acTemp ? `${signed(c.acTemp)} temp` : acd.override ? 'manuale' : acd.armor ? acd.armor.name : acd.shield ? 'scudo' : ''} title=${acTitle} testid="ac" className="cs-tile-ac" />
      <${Tile} label="Iniziativa" value=${signed(R.initiative(c))} onClick=${(e) => rollCheck(c, 'Iniziativa', R.initiative(c), e, 'initiative')} testid="initiative" title="Tira l'iniziativa" />
      <${Tile} label="Velocità" value=${R.formatDistance(c.speed.walk, units)} sub=${['fly', 'swim', 'climb'].filter((k) => c.speed[k]).map((k) => ({ fly: 'vol', swim: 'nuoto', climb: 'scal' })[k] + ' ' + R.formatDistance(c.speed[k], units)).join(' · ') || null} testid="speed" />
      <${Tile} label="Competenza" value=${signed(R.profBonus(c))} testid="prof" />
      <${Tile} label="Perc. passiva" value=${R.passive(c, 'perception')} testid="passive-perception" />
      ${dc != null && html`<${Tile} label="CD incant." value=${dc} sub=${'att. ' + signed(R.spellAttackBonus(c))} testid="spell-dc" />`}
      <button type="button" class="cs-tile click cs-insp ${c.inspiration ? 'on' : ''}" data-testid="inspiration" aria-pressed=${!!c.inspiration}
        onClick=${() => mutate((d) => { d.inspiration = !d.inspiration; })} title="Ispirazione">
        <span class="cs-tile-label">Ispirazione</span><span class="cs-tile-val">${c.inspiration ? '★' : '☆'}</span></button>
      <div class="cs-tile cs-exh ${exh ? 'on' : ''}" title=${c.ruleset === '2024' ? `−${exh * 2} ai tiri d20, −${exh * 1.5} m velocità` : 'Sfinimento (regole 2014: effetti cumulativi)'} data-testid="exhaustion">
        <span class="cs-tile-label">Sfinimento</span>
        <span class="cs-exh-ctl">
          <button class="btn ghost sm" disabled=${exh <= 0} onClick=${() => mutate((d) => { d.exhaustion = Math.max(0, exh - 1); })}>−</button>
          <b data-testid="exhaustion-value">${exh}</b>
          <button class="btn ghost sm" disabled=${exh >= 6} onClick=${() => mutate((d) => { d.exhaustion = Math.min(6, exh + 1); })}>+</button>
        </span>
      </div>
    </div>
  </header>`;
}

export function CharacterSheet({ id, navigate }) {
  const [c, mutate] = useCharacter(id);
  const data = useData();
  const units = useUnits();
  const [tab, setTabState] = useState(tabMemo[id] || 'main');
  const [modal, setModal] = useState(null);
  const setTab = (t) => { tabMemo[id] = t; setTabState(t); };

  // Slot automatici: mantiene i massimi salvati allineati alla tabella (classi/livelli cambiati).
  useEffect(() => {
    if (c && data.classes.length && slotsNeedSync(c, data.classes)) mutate((d) => syncSlots(d, data.classes));
  });

  if (!c) {
    return html`<div class="view"><${Empty} title="Personaggio non trovato">Potrebbe essere stato eliminato.
      <div style="margin-top:12px"><${Button} onClick=${() => navigate('characters')}>Torna all'elenco</${Button}></div></${Empty}></div>`;
  }
  const ctx = { c, mutate, data, units, navigate };
  const body = {
    main: MainTab, combat: CombatTab, spells: SpellsTab, inventory: InventoryTab, features: FeaturesTab, story: StoryTab, notes: NotesTab,
  }[tab];
  return html`<div class="cs-sheet" data-testid="character-sheet" data-id=${c.id}>
    <div class="cs-sticky">
      <${Header} c=${c} mutate=${mutate} data=${data} units=${units} onBack=${() => navigate('characters')}
        onLevelUp=${() => setModal('level')} onShort=${() => setModal('short')} onLong=${() => setModal('long')} />
      <div class="cs-tabs" data-testid="sheet-tabs"><${Tabs} tabs=${TABS} active=${tab} onChange=${setTab} /></div>
    </div>
    <div class="cs-body" data-tab=${tab}><${body} ...${ctx} /></div>
    <${LevelUpModal} open=${modal === 'level'} onClose=${() => setModal(null)} ...${ctx} />
    <${ShortRestModal} open=${modal === 'short'} onClose=${() => setModal(null)} ...${ctx} />
    <${LongRestModal} open=${modal === 'long'} onClose=${() => setModal(null)} ...${ctx} />
  </div>`;
}
