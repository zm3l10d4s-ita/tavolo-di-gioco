// Tab "Combattimento": attacchi, munizioni e consumabili, risorse a usi limitati, PF e dadi vita, difesa, stato.
import { html, useState } from '../../vendor/preact-htm.js';
import { Panel, Select, ConfirmButton, Checkbox } from '../../components/ui.js';
import * as R from '../../lib/rules.js';
import { uid, signed } from '../../lib/util.js';
import { attackBonus, hitDiceState, RECOVERY, applySuggestedResources } from './logic.js';
import {
  Pips, RollBtn, rollCheck, rollExpr, Inline, InlineNum, Stepper, OverrideField, ftToUnit, unitToFt, distUnit,
} from './widgets.js';
import { toast } from '../../components/ui.js';

const AB = R.ABILITY_LABELS_IT;
const AB_OPTS = [{ value: '', label: '—' }, ...R.ABILITIES.map((a) => ({ value: a, label: AB[a].abbr }))];

function AttackRow({ c, mutate, atk, i }) {
  const [edit, setEdit] = useState(!atk.name);
  const b = attackBonus(c, atk);
  const set = (k) => (v) => mutate((d) => { d.attacks[i] = { ...d.attacks[i], [k]: v }; });
  return html`<div class="cs-atk ${edit ? 'editing' : ''}" data-testid="attack-row">
    <div class="cs-atk-main">
      <span class="cs-atk-name">${atk.name || html`<i class="faint">senza nome</i>`}</span>
      <${RollBtn} bonus=${b} testid="attack-roll" onRoll=${(e) => rollCheck(c, `Attacco: ${atk.name}`, b, e, 'attack')} />
      <button type="button" class="cs-roll dmg" data-testid="damage-roll" title="Tira i danni (Shift = critico, dadi raddoppiati)"
        onClick=${(e) => {
          let expr = atk.damage || '';
          if (e.shiftKey) expr = expr.replace(/(\d*)d(\d+)/g, (_, n, d) => `${(Number(n) || 1) * 2}d${d}`);
          rollExpr(c, `Danni ${atk.name}${e.shiftKey ? ' (critico)' : ''}`, expr);
        }}>${atk.damage || '—'}</button>
      <span class="cs-atk-type muted">${atk.damageType}</span>
      <span class="cs-atk-notes faint">${atk.notes}</span>
      <button class="btn ghost sm" onClick=${() => setEdit(!edit)} title="Modifica">${edit ? 'Fine' : '✎'}</button>
    </div>
    ${edit && html`<div class="cs-atk-edit">
      <label class="field"><span class="field-label">Nome</span><${Inline} value=${atk.name} onInput=${set('name')} testid="attack-name" /></label>
      <${Select} label="Caratt." value=${atk.ability || ''} options=${AB_OPTS} onChange=${(v) => set('ability')(v || null)} />
      <label class="field"><span class="field-label">Compet.</span><${Checkbox} checked=${atk.proficient} onChange=${set('proficient')} label="" /></label>
      <label class="field"><span class="field-label">Bonus att. (manuale)</span>
        <${Inline} value=${atk.attackBonusOverride ?? ''} placeholder=${signed((atk.ability ? R.abilityModOf(c, atk.ability) : 0) + (atk.proficient ? R.profBonus(c) : 0)) + ' auto'}
          onInput=${(v) => set('attackBonusOverride')(v.trim() === '' ? null : v)} testid="attack-override" /></label>
      <label class="field"><span class="field-label">Danni</span><${Inline} value=${atk.damage} placeholder="1d8+3" onInput=${set('damage')} testid="attack-damage" /></label>
      <label class="field"><span class="field-label">Tipo</span><${Inline} value=${atk.damageType} placeholder="tagliente" onInput=${set('damageType')} /></label>
      <label class="field cs-span2"><span class="field-label">Note</span><${Inline} value=${atk.notes} onInput=${set('notes')} /></label>
      <${ConfirmButton} onConfirm=${() => mutate((d) => { d.attacks.splice(i, 1); })} confirmText="Elimina?">Elimina</${ConfirmButton}>
    </div>`}
  </div>`;
}

function Attacks(ctx) {
  const { c, mutate } = ctx;
  return html`<${Panel} title="Attacchi e incantesimi" className="cs-attacks"
    actions=${html`<button class="btn ghost sm" data-testid="add-attack" onClick=${() => mutate((d) => { d.attacks.push({ id: uid(), name: '', ability: 'str', proficient: true, attackBonusOverride: null, damage: '1d6', damageType: '', notes: '' }); })}>+ Attacco</button>`}>
    ${!c.attacks.length && html`<p class="faint">Nessun attacco. Aggiungine uno, oppure crealo da un'arma nell'Inventario (⚔).</p>`}
    <div class="cs-atk-head faint"><span>Nome</span><span>Bonus</span><span>Danni</span><span>Tipo</span><span>Note</span></div>
    ${c.attacks.map((a, i) => html`<${AttackRow} key=${a.id || i} ...${ctx} atk=${a} i=${i} />`)}
    <p class="faint cs-small">Clic sul bonus: tiro per colpire · clic sui danni: tiro dei danni (Shift = critico).</p>
  </${Panel}>`;
}

function AmmoConsumables({ c, mutate, navigateTab }) {
  const items = c.inventory.map((it, i) => ({ it, i })).filter(({ it }) => it.category === 'ammunition' || it.category === 'consumable');
  const add = (category) => mutate((d) => { d.inventory.push({ id: uid(), itemId: null, name: category === 'ammunition' ? 'Frecce' : 'Pozione di guarigione', qty: category === 'ammunition' ? 20 : 1, weight: 0, equipped: false, attuned: false, category, notes: '' }); });
  return html`<${Panel} title="Munizioni e consumabili" className="cs-ammo"
    actions=${html`<button class="btn ghost sm" onClick=${() => add('ammunition')} data-testid="add-ammo">+ Munizioni</button><button class="btn ghost sm" onClick=${() => add('consumable')}>+ Consumabile</button>`}>
    ${!items.length && html`<p class="faint">Le voci dell'inventario di categoria «Munizioni» o «Consumabile» compaiono qui.</p>`}
    ${items.map(({ it, i }) => html`<div class="cs-ammo-row" data-testid="ammo-row">
      <span class=${'tag ' + (it.category === 'ammunition' ? '' : 'magic')}>${it.category === 'ammunition' ? 'Mun.' : 'Cons.'}</span>
      <${Inline} value=${it.name} onInput=${(v) => mutate((d) => { d.inventory[i].name = v; })} />
      <${Stepper} value=${it.qty} onChange=${(v) => mutate((d) => { d.inventory[i].qty = v; })} testid="ammo-qty" />
    </div>`)}
  </${Panel}>`;
}

function Resources({ c, mutate, data }) {
  const set = (i, k, v) => mutate((d) => { d.resources[i] = { ...d.resources[i], [k]: v }; });
  const [edit, setEdit] = useState(false);
  return html`<${Panel} title="Privilegi a usi limitati" className="cs-resources"
    actions=${html`
      <button class="btn ghost sm" title="Crea/aggiorna le risorse dai dati della classe (Ira, Forma selvatica, Punti ki…)" data-testid="suggest-resources"
        onClick=${() => { let r; mutate((d) => { r = applySuggestedResources(d, data.levels); return r.character; }); toast(r.added.length || r.updated.length ? `Risorse: ${[...r.added.map((x) => '+' + x), ...r.updated.map((x) => '↻ ' + x)].join(', ')}` : 'Risorse di classe già aggiornate'); }}>Dalla classe</button>
      <button class="btn ghost sm" onClick=${() => setEdit(!edit)}>${edit ? 'Fine' : '✎'}</button>
      <button class="btn ghost sm" data-testid="add-resource" onClick=${() => { setEdit(true); mutate((d) => { d.resources.push({ id: uid(), name: '', max: 1, used: 0, recovery: 'long' }); }); }}>+</button>`}>
    ${!c.resources.length && html`<p class="faint">Nessuna risorsa. «Dalla classe» crea quelle previste dal livello.</p>`}
    ${c.resources.map((r, i) => html`<div class="cs-res" data-testid="resource-row">
      ${edit
        ? html`<${Inline} value=${r.name} placeholder="Nome" onInput=${(v) => set(i, 'name', v)} testid="resource-name" />
          <label class="cs-res-max" title="Usi massimi"><span class="faint">max</span><${InlineNum} value=${r.max} min=${0} onInput=${(v) => set(i, 'max', v || 0)} /></label>
          <select class="input cs-inline cs-res-rec" value=${r.recovery || 'long'} onChange=${(e) => set(i, 'recovery', e.currentTarget.value)}>
            ${Object.entries(RECOVERY).map(([k, v]) => html`<option value=${k}>${v.label}</option>`)}</select>
          <${ConfirmButton} variant="ghost" onConfirm=${() => mutate((d) => { d.resources.splice(i, 1); })} confirmText="Elimina?">✕</${ConfirmButton}>`
        : html`<span class="cs-res-name">${r.name || html`<i class="faint">senza nome</i>`}</span>
          <${Pips} max=${r.max} used=${r.used} testid="resource-pips" label=${r.name}
            onUse=${() => set(i, 'used', Math.min(r.max, (r.used || 0) + 1))} onRestore=${() => set(i, 'used', Math.max(0, (r.used || 0) - 1))} />
          <span class="tag cs-rec" title=${RECOVERY[r.recovery || 'long']?.label}>${RECOVERY[r.recovery || 'long']?.abbr}</span>`}
    </div>`)}
  </${Panel}>`;
}

function HitPoints({ c, mutate }) {
  const hd = hitDiceState(c);
  const ov = c.hp.maxOverride;
  const calc = R.maxHp({ ...c, hp: { ...c.hp, maxOverride: null } });
  return html`<${Panel} title="Punti ferita e dadi vita" className="cs-hpdetail">
    <div class="cs-form cs-form-4">
      <label class="field"><span class="field-label">PF attuali</span><${InlineNum} value=${c.hp.current} min=${0} onInput=${(v) => mutate((d) => { d.hp.current = v || 0; })} testid="hp-current-input" /></label>
      <${OverrideField} label="PF massimi" computed=${calc} value=${ov} onInput=${(v) => mutate((d) => { d.hp.maxOverride = v; })} testid="hp-max-override" />
      <label class="field" title="Bonus fisso ai PF massimi calcolati (es. Robustezza, tiri ai livelli)"><span class="field-label">Bonus PF max</span>
        <${InlineNum} value=${c.hp.bonusMax || 0} onInput=${(v) => mutate((d) => { d.hp.bonusMax = v || 0; })} /></label>
      <label class="field"><span class="field-label">PF temporanei</span><${InlineNum} value=${c.hp.temp} min=${0} onInput=${(v) => mutate((d) => { d.hp.temp = v || 0; })} /></label>
    </div>
    <div class="cs-hd">
      <span class="field-label">Dadi vita</span>
      ${Object.keys(hd).length ? Object.entries(hd).map(([die, s]) => html`<div class="cs-hd-row" data-testid=${'hitdice-' + die}>
        <b>${die}</b><span class="muted">${s.left}/${s.total} disponibili</span>
        <${Pips} max=${s.total} used=${s.used} onUse=${() => mutate((d) => { d.hitDiceUsed[die] = Math.min(s.total, s.used + 1); })}
          onRestore=${() => mutate((d) => { d.hitDiceUsed[die] = Math.max(0, s.used - 1); })} />
      </div>`) : html`<span class="faint">Nessuna classe</span>`}
    </div>
    <div class="cs-ds" data-testid="death-saves-panel">
      <span class="field-label">Tiri salvezza contro morte</span>
      <span class="row"><span class="muted">Successi</span><${Pips} max=${3} used=${3 - c.deathSaves.successes} tone="good"
        onUse=${() => mutate((d) => { d.deathSaves.successes = Math.max(0, d.deathSaves.successes - 1); })} onRestore=${() => mutate((d) => { d.deathSaves.successes = Math.min(3, d.deathSaves.successes + 1); })} />
      <span class="muted">Fallimenti</span><${Pips} max=${3} used=${3 - c.deathSaves.failures} tone="bad"
        onUse=${() => mutate((d) => { d.deathSaves.failures = Math.max(0, d.deathSaves.failures - 1); })} onRestore=${() => mutate((d) => { d.deathSaves.failures = Math.min(3, d.deathSaves.failures + 1); })} />
      <button class="btn ghost sm" onClick=${(e) => rollCheck(c, 'TS contro morte', 0, e, 'death')}>Tira</button></span>
    </div>
  </${Panel}>`;
}

function Defense({ c, mutate, data, units }) {
  const acd = R.armorClassDetail(c, data.equipment);
  const du = distUnit(units);
  const setSpeed = (k) => (v) => mutate((d) => { d.speed[k] = v == null ? null : unitToFt(v, units); if (v == null && k !== 'walk') delete d.speed[k]; });
  const arm = acd.armor;
  return html`<${Panel} title="Difesa e movimento" className="cs-defense">
    <div class="cs-ac-break faint cs-small" data-testid="ac-breakdown">
      Calcolata: <b class="cs-text">${acd.computed}</b> = ${arm ? arm.name : 'senza armatura'} ${acd.base} + DES ${acd.dex}${acd.shield ? ` + scudo ${acd.shield}` : ''}${acd.bonus ? ` + bonus ${acd.bonus}` : ''}
      ${arm && html`<br />Armatura indossata: ${arm.name} · CA ${arm.ac?.base} · Des max ${arm.ac?.dexBonus === false ? '0' : arm.ac?.maxBonus ?? '—'} · For ${arm.strMinimum || '—'}${arm.stealthDisadvantage ? ' · svantaggio Furtività' : ''}`}
      ${arm?.strMinimum > (c.abilities.str.score || 10) && html`<br /><span class="bad-t">Forza insufficiente: −${units === 'ft' ? '10 ft' : '3 m'} di velocità</span>`}
    </div>
    <div class="cs-form cs-form-4">
      <${OverrideField} label="CA (manuale)" computed=${acd.computed} value=${c.acOverride} onInput=${(v) => mutate((d) => { d.acOverride = v; })} testid="ac-override" />
      <label class="field" title="Bonus permanente (oggetti, privilegi)"><span class="field-label">Bonus CA</span><${InlineNum} value=${c.acBonus || 0} onInput=${(v) => mutate((d) => { d.acBonus = v || 0; })} /></label>
      <label class="field" title="Bonus temporaneo (es. Scudo +5): aggiunto alla CA mostrata e al combat tracker"><span class="field-label">CA temporanea</span><${InlineNum} value=${c.acTemp || 0} onInput=${(v) => mutate((d) => { d.acTemp = v || 0; })} testid="ac-temp" /></label>
      <label class="field" title=${`Iniziativa = DES ${signed(R.abilityModOf(c, 'dex'))} + bonus`}><span class="field-label">Bonus iniziativa</span><${InlineNum} value=${c.initiativeBonus || 0} onInput=${(v) => mutate((d) => { d.initiativeBonus = v || 0; })} /></label>
    </div>
    <div class="cs-form cs-form-4">
      ${[['walk', 'Camminare'], ['fly', 'Volare'], ['swim', 'Nuotare'], ['climb', 'Scalare']].map(([k, l]) => html`<label class="field"><span class="field-label">${l} (${du})</span>
        <${InlineNum} value=${c.speed[k] != null ? ftToUnit(c.speed[k], units) : null} nullable=${k !== 'walk'} min=${0} step=${units === 'ft' ? 5 : 1.5} testid=${'speed-' + k} onInput=${setSpeed(k)} /></label>`)}
    </div>
  </${Panel}>`;
}

function StatusPanel({ c, mutate, data }) {
  const rule = data.rules.find((x) => x.id === (c.ruleset === '2024' ? 'exhaustion-2024' : 'exhaustion-2014'));
  const lv = rule?.data?.levels || null;
  const conds = data.conditions.filter((x) => x.id !== 'exhaustion');
  const toggle = (id) => mutate((d) => { d.conditions = d.conditions.includes(id) ? d.conditions.filter((x) => x !== id) : [...d.conditions, id]; });
  return html`<${Panel} title="Stato" className="cs-status">
    <div class="row">
      <span class="field-label">Sfinimento</span>
      <${Stepper} value=${c.exhaustion} min=${0} max=${6} onChange=${(v) => mutate((d) => { d.exhaustion = v; })} />
      <span class="muted cs-small">${c.ruleset === '2024' ? `−${2 * c.exhaustion} ai tiri d20 · −${(1.5 * c.exhaustion).toLocaleString('it-IT')} m velocità` : exhaustionText2014(c.exhaustion)}</span>
    </div>
    ${c.ruleset !== '2024' && Array.isArray(lv) && html`<ol class="cs-exh-list">${lv.map((x) => html`<li class=${x.level <= c.exhaustion ? 'on' : ''}>${x.effect_it || x.effect}</li>`)}</ol>`}
    ${c.ruleset === '2024' && rule?.data?.summary_it && html`<p class="faint cs-small">${rule.data.summary_it}</p>`}
    <label class="field"><span class="field-label">Livello di follia</span><${Inline} value=${c.madness || ''} placeholder="—" onInput=${(v) => mutate((d) => { d.madness = v; })} testid="madness" /></label>
    <span class="field-label">Condizioni</span>
    <div class="cs-cond-grid">${conds.map((x) => html`<label class="check" title=${x.summary_it || ''}><input type="checkbox" checked=${c.conditions.includes(x.id)} onChange=${() => toggle(x.id)} /><span>${x.name_it || x.name}</span></label>`)}</div>
  </${Panel}>`;
}
const EXH_2014 = ['', 'svantaggio alle prove di caratteristica', '+ velocità dimezzata', '+ svantaggio a tiri per colpire e TS', '+ PF massimi dimezzati', '+ velocità 0', 'morte'];
function exhaustionText2014(n) { return n ? EXH_2014[Math.min(6, n)] : 'nessun effetto'; }

export function CombatTab(ctx) {
  return html`<div class="cs-grid-2">
    <div class="cs-col"><${Attacks} ...${ctx} /><${Resources} ...${ctx} /><${AmmoConsumables} ...${ctx} /></div>
    <div class="cs-col"><${HitPoints} ...${ctx} /><${Defense} ...${ctx} /><${StatusPanel} ...${ctx} /></div>
  </div>`;
}
