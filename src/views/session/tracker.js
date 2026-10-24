// Combat tracker: barra round/turno, strumenti di aggiunta, righe dei combattenti.
import { html, useState, useMemo, useRef, useEffect } from '../../vendor/preact-htm.js';
import { Button, Modal, TextField, NumberField, Checkbox, Empty, toast } from '../../components/ui.js';
import { Icon } from '../../components/icons.js';
import { PickCharacterModal } from '../../components/pick-character.js';
import * as store from '../../lib/store.js';
import { norm, signed } from '../../lib/util.js';
import { statusOf, STATUS_LABEL, xpSummary } from '../../lib/session-core.js';
import * as A from './actions.js';

const KIND_LABEL = { pc: 'PG', monster: 'Mostro', npc: 'PNG' };

// ------------------------------------------------------------------ ricerca rapida mostri
export function MonsterQuickAdd({ monsters, onAdd, disabled }) {
  const [q, setQ] = useState('');
  const [qty, setQty] = useState(1);
  const [hi, setHi] = useState(0);
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const s = norm(q.trim());
    if (!s) return [];
    const starts = [], has = [];
    for (const m of monsters) {
      const n = norm(m.name);
      if (n.startsWith(s)) starts.push(m); else if (n.includes(s) || norm(m.type).includes(s)) has.push(m);
    }
    const by = (a, b) => a.name.localeCompare(b.name) || String(a.source).localeCompare(String(b.source));
    return [...starts.sort(by), ...has.sort(by)].slice(0, 10);
  }, [q, monsters]);
  useEffect(() => setHi(0), [q]);
  const add = (m) => { if (!m) return; onAdd(m, qty); setQ(''); setQty(1); setOpen(false); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(results.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); add(results[hi]); }
    else if (e.key === 'Escape') setOpen(false);
  };
  return html`<div class="mqa" onFocusOut=${(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <span class="mqa-ico"><${Icon} name="skull" size=${16} /></span>
    <input class="input mqa-input" placeholder="Aggiungi mostro… (es. goblin)" value=${q} disabled=${disabled}
      onInput=${(e) => { setQ(e.currentTarget.value); setOpen(true); }} onFocus=${() => setOpen(true)} onKeyDown=${onKey}
      data-testid="monster-quick-search" />
    <input class="input mqa-qty" type="number" min="1" max="20" value=${qty} title="Quantità"
      onInput=${(e) => setQty(Math.max(1, Math.min(20, Number(e.currentTarget.value) || 1)))} data-testid="monster-quick-qty" />
    ${open && results.length > 0 && html`<div class="mqa-drop" data-testid="monster-quick-results">
      ${results.map((m, i) => html`<button type="button" class="mqa-item ${i === hi ? 'hi' : ''}" onMouseEnter=${() => setHi(i)}
          onMouseDown=${(e) => e.preventDefault()} onClick=${() => add(m)} data-testid="monster-quick-item" data-id=${m.id}>
        <span class="mqa-cr">GS ${m.cr}</span>
        <span class="mqa-name">${m.name}<small>${m.type_it || m.type || ''}</small></span>
        <span class="mqa-stats">CA ${m.ac} · PF ${m.hp}</span>
        <span class="tag ${m.source === 'SRD 5.2' ? 'magic' : m.source === 'Homebrew' ? 'good' : 'accent'}">${m.source === 'SRD 5.2' ? '5.2' : m.source === 'Homebrew' ? 'HB' : '5.1'}</span>
      </button>`)}
      <div class="mqa-hint faint">Invio per aggiungere ${qty > 1 ? `${qty}×` : ''} · ↑↓ per scegliere</div>
    </div>`}
  </div>`;
}

// ------------------------------------------------------------------ PNG
function NpcModal({ open, onClose, onAdd }) {
  const [f, setF] = useState({ name: '', hp: 10, ac: 12, initBonus: 0, count: 1 });
  const set = (p) => setF({ ...f, ...p });
  return html`<${Modal} open=${open} title="Aggiungi PNG o creatura libera" onClose=${onClose}>
    <form class="col" onSubmit=${(e) => { e.preventDefault(); onAdd(f); setF({ ...f, name: '' }); onClose(); }}>
      <${TextField} label="Nome" value=${f.name} onInput=${(v) => set({ name: v })} placeholder="es. Capitano della guardia" autofocus data-testid="npc-name" />
      <div class="row npc-grid">
        <${NumberField} label="PF" value=${f.hp} min=${1} onInput=${(v) => set({ hp: v })} />
        <${NumberField} label="CA" value=${f.ac} min=${0} onInput=${(v) => set({ ac: v })} />
        <${NumberField} label="Bonus iniziativa" value=${f.initBonus} onInput=${(v) => set({ initBonus: v })} />
        <${NumberField} label="Quantità" value=${f.count} min=${1} max=${20} onInput=${(v) => set({ count: v })} />
      </div>
      <div class="row"><span class="spacer"></span><${Button} type="submit" variant="primary" data-testid="npc-add">Aggiungi</${Button}></div>
    </form>
  </${Modal}>`;
}

// ------------------------------------------------------------------ fine combattimento
function EndCombatModal({ open, onClose, combat, xpOf, onEnd }) {
  const [includeAll, setIncludeAll] = useState(false);
  const [award, setAward] = useState(true);
  const [keepFoes, setKeepFoes] = useState(false);
  if (!open) return null;
  const sum = xpSummary(combat.combatants, xpOf, { includeAll });
  return html`<${Modal} open title="Fine del combattimento" onClose=${onClose}>
    <div class="col end-combat" data-testid="end-combat">
      <div class="xp-total"><span>PE totali</span><b data-testid="xp-total">${sum.total.toLocaleString('it-IT')}</b>
        <span class="faint">${sum.pcs.length ? `${sum.perPc.toLocaleString('it-IT')} PE a testa · ${sum.pcs.length} PG` : 'nessun PG nel combattimento'}</span></div>
      ${sum.rows.length ? html`<table class="table"><thead><tr><th>Creatura</th><th style="text-align:right">PE</th></tr></thead>
        <tbody>${sum.rows.map((r) => html`<tr><td>${r.name}</td><td style="text-align:right">${r.xp}</td></tr>`)}</tbody></table>`
        : html`<div class="faint">Nessuna creatura sconfitta${includeAll ? '' : ' (PF a 0)'}.</div>`}
      <${Checkbox} label="Conta anche le creature non sconfitte (fuggite, arrese…)" checked=${includeAll} onChange=${setIncludeAll} />
      <${Checkbox} label=${`Assegna i PE alle schede dei PG${sum.perPc ? ` (+${sum.perPc} ciascuno)` : ''}`} checked=${award} onChange=${setAward} />
      <${Checkbox} label="Mantieni mostri e PNG nella lista" checked=${keepFoes} onChange=${setKeepFoes} />
      <div class="row"><span class="spacer"></span>
        <${Button} onClick=${onClose}>Annulla</${Button}>
        <${Button} variant="primary" onClick=${() => { onEnd({ includeAll, award, keepFoes }); onClose(); }} data-testid="end-combat-confirm">Termina combattimento</${Button}>
      </div>
    </div>
  </${Modal}>`;
}

// ------------------------------------------------------------------ riga combattente
function HpBar({ c }) {
  const pct = c.maxHp ? Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100)) : 0;
  const tone = pct <= 0 ? 'zero' : pct < 34 ? 'low' : pct < 67 ? 'mid' : 'high';
  return html`<div class="hpbar ${tone}"><span style=${`width:${pct}%`}></span></div>`;
}

function CombatantRow({ c, index, current, selected, sid, eq, readonly, onSelect, total }) {
  const st = statusOf(c);
  const [hpv, setHpv] = useState('');
  const submitHp = (e) => {
    e.preventDefault();
    const t = A.hpInput(sid, c.id, hpv, eq);
    if (t === null) { toast('Formato PF non valido: usa -7, +5, =20 o t5', 'bad'); return; }
    setHpv('');
  };
  const stop = (e) => e.stopPropagation();
  return html`<div class="cbt-row kind-${c.kind} st-${st} ${current ? 'current' : ''} ${selected ? 'selected' : ''} ${c.hidden ? 'is-hidden' : ''}"
      data-testid="combatant" data-id=${c.id} data-name=${c.name} data-current=${current ? '1' : '0'} onClick=${() => onSelect(c.id)}>
    <div class="cbt-turn">${current ? html`<${Icon} name="play" size=${14} />` : html`<span class="cbt-idx">${index + 1}</span>`}</div>
    <div class="cbt-init" onClick=${stop}>
      <input class="input" type="number" value=${c.initiative ?? ''} placeholder="—" disabled=${readonly} title=${`Iniziativa (bonus ${signed(c.initBonus)})`}
        onChange=${(e) => A.setInitiative(sid, c.id, e.currentTarget.value, eq)} onKeyDown=${(e) => e.key === 'Enter' && e.currentTarget.blur()} data-testid="init-input" />
      <button class="cbt-die" title=${`Tira iniziativa: 1d20${signed(c.initBonus)}`} disabled=${readonly} onClick=${() => A.rollInit(sid, c.id, eq)} data-testid="init-roll"><${Icon} name="d20" size=${15} /></button>
    </div>
    <div class="cbt-main">
      <div class="cbt-name"><span class="cbt-name-text">${c.name}</span>
        ${c.kind !== 'monster' && html`<span class="tag ${c.kind === 'pc' ? 'accent' : ''}">${KIND_LABEL[c.kind]}</span>`}
        ${st !== 'ok' && html`<span class="tag bad cbt-status" data-testid="status">${STATUS_LABEL[st]}</span>`}
        ${c.hidden && html`<span class="tag" title="Escluso dai turni">nascosto</span>`}
      </div>
      ${(c.conditions.length > 0 || c.notes) && html`<div class="cbt-sub">
        ${c.conditions.map((k) => html`<span class="cond-badge" title=${k.rounds ? `${k.rounds} round rimanenti` : 'Durata indefinita'}>${k.label || k.id}${k.rounds ? html`<b>${k.rounds}</b>` : ''}</span>`)}
        ${c.notes && html`<span class="cbt-note faint">${c.notes}</span>`}
      </div>`}
    </div>
    <div class="cbt-ac" title="Classe Armatura"><${Icon} name="shield" size=${15} /><b>${c.ac}</b></div>
    <div class="cbt-hp" title="Punti Ferita">
      <div class="cbt-hp-num"><b data-testid="hp-value">${c.hp}</b><span>/${c.maxHp}</span>${c.tempHp > 0 && html`<em title="PF temporanei">+${c.tempHp}</em>`}</div>
      <${HpBar} c=${c} />
    </div>
    <form class="cbt-hpin" onSubmit=${submitHp} onClick=${stop}>
      <input class="input" value=${hpv} placeholder="−7 / +5" disabled=${readonly} onInput=${(e) => setHpv(e.currentTarget.value)}
        title="Danno: -7 (o 7) · Cura: +5 · Imposta: =20 · PF temporanei: t5 · Dadi: -2d6+3" data-testid="hp-input" />
    </form>
    <div class="cbt-actions" onClick=${stop}>
      <button class="icon-btn" title="Su" disabled=${readonly || index === 0} onClick=${() => A.move(sid, c.id, -1, eq)} data-testid="move-up"><${Icon} name="up" size=${15} /></button>
      <button class="icon-btn" title="Giù" disabled=${readonly || index === total - 1} onClick=${() => A.move(sid, c.id, 1, eq)} data-testid="move-down"><${Icon} name="down" size=${15} /></button>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ tracker
export function Tracker({ session, combat, eq, monsters, monstersById, selectedId, onSelect, readonly, campaign }) {
  const sid = session.id;
  const [pcOpen, setPcOpen] = useState(false);
  const [npcOpen, setNpcOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const list = combat.combatants;
  const current = combat.active ? list[combat.turnIndex] : null;
  const present = new Set(list.filter((x) => x.kind === 'pc').map((x) => x.refId));
  const partyMissing = (campaign?.partyIds || []).filter((id) => !present.has(id) && store.get('characters', id));
  const xpOf = (c) => c.xp ?? monstersById.get(c.refId)?.xp ?? 0;

  const addParty = () => A.addPcs(sid, partyMissing.map((id) => store.get('characters', id)), eq);
  const addMonster = (m, n) => { A.addMonsters(sid, m, n); toast(`${n > 1 ? n + '× ' : ''}${m.name} aggiunt${n > 1 ? 'i' : 'o'}`, 'good'); };

  return html`<section class="panel tracker" data-testid="tracker">
    <header class="tracker-head">
      <div class="round-box ${combat.active ? 'on' : ''}" title="Round"><span>Round</span><b data-testid="round">${combat.active ? combat.round : '—'}</b></div>
      <div class="turn-info">
        ${combat.active
          ? html`<span class="faint">Turno di</span><b data-testid="current-turn">${current?.name || '—'}</b>`
          : html`<span class="faint">${list.length ? 'Pronto: tira l\'iniziativa e inizia' : 'Nessun combattimento in corso'}</span>`}
      </div>
      <span class="spacer"></span>
      ${combat.active ? html`
        <${Button} onClick=${() => A.prev(sid, eq)} disabled=${readonly} title="Turno precedente (Alt+←)" data-testid="turn-prev"><${Icon} name="prev" size=${16} /> Indietro</${Button}>
        <${Button} variant="primary" size="lg" onClick=${() => A.next(sid, eq)} disabled=${readonly} title="Turno successivo (Alt+→)" data-testid="turn-next">Avanti <${Icon} name="next" size=${16} /></${Button}>
        <${Button} variant="danger" onClick=${() => setEndOpen(true)} disabled=${readonly} data-testid="combat-end"><${Icon} name="flag" size=${15} /> Termina</${Button}>`
      : html`<${Button} variant="primary" size="lg" disabled=${readonly || !list.length} onClick=${() => A.start(sid, eq)} data-testid="combat-start"><${Icon} name="swords" size=${17} /> Inizia combattimento</${Button}>`}
    </header>
    ${!readonly && html`<div class="tracker-tools">
      <${MonsterQuickAdd} monsters=${monsters} onAdd=${addMonster} />
      <div class="tt-group">
        ${partyMissing.length > 0 && html`<${Button} size="sm" onClick=${addParty} title="Aggiunge i PG del gruppo non ancora presenti" data-testid="add-party"><${Icon} name="users" size=${15} /> Gruppo (${partyMissing.length})</${Button}>`}
        <${Button} size="sm" onClick=${() => setPcOpen(true)} data-testid="add-pc"><${Icon} name="user" size=${15} /> PG</${Button}>
        <${Button} size="sm" onClick=${() => setNpcOpen(true)} data-testid="add-npc"><${Icon} name="plus" size=${15} /> PNG</${Button}>
      </div>
      <div class="tt-group">
        <span class="tt-label">Iniziativa</span>
        <${Button} size="sm" onClick=${() => A.rollInit(sid, 'monsters', eq)} disabled=${!list.some((x) => x.kind !== 'pc')} title="Tira per tutti i mostri e PNG" data-testid="roll-monsters"><${Icon} name="d20" size=${15} /> Mostri</${Button}>
        <${Button} size="sm" onClick=${() => A.rollInit(sid, 'all', eq)} disabled=${!list.length} title="Tira per tutti, PG compresi" data-testid="roll-all"><${Icon} name="d20" size=${15} /> Tutti</${Button}>
        <${Button} size="sm" variant="ghost" onClick=${() => A.sortNow(sid, eq)} disabled=${!list.length} title="Ordina per iniziativa (pareggi: mod DES)" data-testid="sort-init"><${Icon} name="sort" size=${15} /> Ordina</${Button}>
      </div>
    </div>`}
    <div class="tracker-list" data-testid="combatant-list">
      ${list.length ? html`
        <div class="cbt-head"><span></span><span>Iniz.</span><span>Nome</span><span>CA</span><span>PF</span><span>Danno / cura</span><span></span></div>
        ${list.map((c, i) => html`<${CombatantRow} key=${c.id} c=${c} index=${i} total=${list.length} current=${current?.id === c.id} selected=${selectedId === c.id}
          sid=${sid} eq=${eq} readonly=${readonly} onSelect=${onSelect} />`)}`
      : html`<${Empty} title="Nessun combattente">${readonly ? 'Questa sessione è chiusa.' : html`Cerca un mostro qui sopra, aggiungi i PG del gruppo o un PNG.`}</${Empty}>`}
    </div>
    <${PickCharacterModal} open=${pcOpen} title="Aggiungi PG al combattimento" onClose=${() => setPcOpen(false)}
      isDisabled=${(ch) => (present.has(ch.id) ? 'già presente' : null)}
      onPick=${(ch) => { A.addPcs(sid, [ch], eq); setPcOpen(false); }} />
    <${NpcModal} open=${npcOpen} onClose=${() => setNpcOpen(false)} onAdd=${(f) => A.addNpc(sid, f)} />
    <${EndCombatModal} open=${endOpen} onClose=${() => setEndOpen(false)} combat=${combat} xpOf=${xpOf}
      onEnd=${(o) => { const s = A.endCombat(sid, o, xpOf, eq); toast(`Combattimento terminato: ${s.total} PE${s.perPc ? `, ${s.perPc} a testa` : ''}`, 'good'); }} />
  </section>`;
}
