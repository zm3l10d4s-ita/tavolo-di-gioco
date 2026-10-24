// Sezione "Compendio": razze, classi, sottoclassi, talenti, background e opzioni di classe.
// Mostra i dati SRD, le voci del catalogo "da completare" (solo nome e dati di base) e quelle completate/creati dall'utente.
// Route: #/compendium/<tab>/<id>
import { html, useState, useMemo, useEffect } from '../../vendor/preact-htm.js';
import { useSrd, useDoc } from '../../lib/hooks.js';
import { getSetting } from '../../lib/store.js';
import { norm } from '../../lib/util.js';
import { formatDistance } from '../../lib/rules.js';
import { shortSource, sourceTone, resetEntry } from '../../lib/catalog.js';
import { Tabs, Button, Empty, SearchBox, ConfirmButton } from '../../components/ui.js';
import { Prose } from '../../components/prose.js';
import { StubBanner, PasteImportModal } from '../../components/paste-import.js';

const TABS = [
  { id: 'races', label: 'Razze' }, { id: 'classes', label: 'Classi' }, { id: 'subclasses', label: 'Sottoclassi' },
  { id: 'feats', label: 'Talenti' }, { id: 'backgrounds', label: 'Background' }, { id: 'classOptions', label: 'Opzioni di classe' },
];
const ABIL_IT = { str: 'FOR', dex: 'DES', con: 'COS', int: 'INT', wis: 'SAG', cha: 'CAR' };
const SIZE_IT = { tiny: 'Minuscola', small: 'Piccola', medium: 'Media', large: 'Grande' };
const SOURCE_FILTERS = [
  { value: '', label: 'Tutte le fonti' }, { value: 'srd', label: 'SRD (completo)' }, { value: 'books', label: 'Manuali (catalogo)' },
  { value: 'stub', label: 'Da completare' }, { value: 'done', label: 'Completati da me' }, { value: 'hb', label: 'Creati da me' },
];
function matchSrc(it, f) {
  if (!f) return true;
  if (f === 'srd') return /^SRD/.test(it.source || '');
  if (f === 'books') return !!(it.stub || it.completed);
  if (f === 'stub') return !!it.stub;
  if (f === 'done') return !!it.completed;
  if (f === 'hb') return it.source === 'Homebrew';
  return true;
}
const memo = { tab: 'races', q: '', src: '', cls: '' };

function useClassNames() {
  const { items } = useSrd('classes');
  return useMemo(() => Object.fromEntries(items.map((c) => [c.id.replace(/-2024$/, ''), c.name_it || c.name])), [items]);
}

function FeatureList({ features, units }) {
  if (!features?.length) return null;
  const sorted = [...features].sort((a, b) => (a.level || 0) - (b.level || 0));
  return html`<div class="cmp-features">${sorted.map((f) => html`<section class="cmp-feature">
    <h4>${f.name}${f.level ? html` <span class="tag">${f.level}° livello</span>` : ''}</h4>
    ${f.desc && html`<${Prose} text=${f.desc} units=${units} />`}
  </section>`)}</div>`;
}

function Body({ tab, it, units, classNames }) {
  const props = [];
  const P = (k, v) => { if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) props.push(html`<div><dt>${k}</dt><dd>${v}</dd></div>`); };
  if (tab === 'races') {
    P('Velocità', it.speed ? formatDistance(it.speed, units) : null); P('Taglia', it.size_it || SIZE_IT[it.size] || it.size);
    P('Aumenti di caratteristica', (it.abilityBonuses || []).map((b) => `${ABIL_IT[b.ability] || b.ability} +${b.bonus}`).join(', '));
  } else if (tab === 'classes') {
    P('Dado vita', it.hitDie ? `d${it.hitDie}` : null); P('Tiri salvezza', (it.savingThrows || []).map((a) => ABIL_IT[a] || a).join(', '));
    P('Caratteristica primaria', (it.primaryAbility || []).map((a) => ABIL_IT[a] || a).join(' / ')); P('Incantatore', it.spellcasting ? (ABIL_IT[it.spellcasting.ability] || '✓') : null);
  } else if (tab === 'subclasses') {
    P('Classe', classNames[it.classId] || it.classId); P('Tipo', it.flavor);
  } else if (tab === 'feats') {
    P('Prerequisito', it.prerequisiteText); P('Tipo', it.featType || (it.type && it.type !== 'general' ? it.type : null));
  } else if (tab === 'backgrounds') {
    P('Abilità', (it.skillProficiencies || []).map((s) => s.name || s).join(', ')); P('Strumenti', it.toolProficienciesText || (it.toolProficiencies || []).map((s) => s.name || s).join(', '));
  } else if (tab === 'classOptions') {
    P('Tipo', it.kind_it); P('Classe', classNames[it.classId] || it.classId); P('Prerequisito', it.prerequisiteText);
  }
  return html`
    ${props.length > 0 && html`<dl class="cmp-props">${props}</dl>`}
    ${it.desc && html`<div class="cmp-desc"><${Prose} text=${it.desc} units=${units} /></div>`}
    ${it.languageDesc && html`<p><b>Linguaggi.</b> ${it.languageDesc}</p>`}
    ${tab === 'races' && it.traits?.length > 0 && html`<div class="cmp-features">${it.traits.map((t) => html`<section class="cmp-feature"><h4>${t.name}</h4><${Prose} text=${t.desc} units=${units} /></section>`)}</div>`}
    ${(tab === 'classes' || tab === 'subclasses') && html`<${FeatureList} features=${it.features} units=${units} />`}
    ${tab === 'backgrounds' && it.feature && html`<section class="cmp-feature"><h4>Privilegio: ${it.feature.name}</h4><${Prose} text=${it.feature.desc || ''} units=${units} /></section>`}
  `;
}

export default function CompendiumView({ params = [], navigate }) {
  const tab = TABS.some((t) => t.id === params[0]) ? params[0] : memo.tab;
  const selId = params[0] === tab ? params[1] : null;
  useDoc('settings', 'app');
  const units = getSetting('units', 'm');
  const { items, loading } = useSrd(tab);
  const classNames = useClassNames();
  const [q, setQ] = useState(memo.q);
  const [src, setSrc] = useState(memo.src);
  const [cls, setCls] = useState(memo.cls);
  const [paste, setPaste] = useState(false);
  useEffect(() => { memo.tab = tab; }, [tab]);
  useEffect(() => { Object.assign(memo, { q, src, cls }); }, [q, src, cls]);
  const hasClass = tab === 'subclasses' || tab === 'classOptions';
  const list = useMemo(() => {
    const nq = norm(q);
    return items.filter((it) => (!nq || norm(`${it.name} ${it.name_it || ''}`).includes(nq)) && matchSrc(it, src) && (!hasClass || !cls || String(it.classId || '').replace(/-2024$/, '') === cls))
      .sort((a, b) => (a.name_it || a.name).localeCompare(b.name_it || b.name, 'it'));
  }, [items, q, src, cls, tab]);
  const selected = items.find((x) => x.id === selId) || null;
  const stubCount = items.filter((x) => x.stub).length;
  const classOpts = Object.entries(classNames).sort((a, b) => a[1].localeCompare(b[1], 'it'));
  const go = (id) => navigate('compendium', tab, id);

  return html`<div class="view cmp-view" data-testid="compendium-view">
    <div class="view-head">
      <h1>Compendio</h1>
      <span class="faint">${items.length} voci · ${stubCount} da completare</span>
      <span class="spacer"></span>
      <${Button} onClick=${() => setPaste(true)} data-testid="compendium-paste">Incolla testo (nuova voce)</${Button}>
    </div>
    <${Tabs} tabs=${TABS} active=${tab} onChange=${(t) => navigate('compendium', t)} />
    <div class="cmp-layout">
      <section class="panel cmp-side">
        <div class="cmp-filters">
          <${SearchBox} value=${q} onInput=${setQ} placeholder="Cerca per nome…" />
          <div class="row">
            <select class="input" value=${src} onChange=${(e) => setSrc(e.currentTarget.value)} data-testid="compendium-source">
              ${SOURCE_FILTERS.map((o) => html`<option value=${o.value}>${o.label}</option>`)}</select>
            ${hasClass && html`<select class="input" value=${cls} onChange=${(e) => setCls(e.currentTarget.value)} data-testid="compendium-class">
              <option value="">Tutte le classi</option>${classOpts.map(([id, n]) => html`<option value=${id}>${n}</option>`)}</select>`}
          </div>
          <div class="faint cmp-count" data-testid="compendium-count">${list.length} risultati</div>
        </div>
        <div class="cmp-list" data-testid="compendium-list">
          ${loading && !items.length ? html`<div class="faint" style="padding:12px">Caricamento…</div>`
            : list.map((it) => html`<button class="cmp-row ${it.id === selId ? 'selected' : ''} ${it.stub ? 'is-stub' : ''}" onClick=${() => go(it.id)} data-testid="compendium-row" data-id=${it.id}>
              <span class="cmp-row-main"><span class="cmp-row-name">${it.name_it || it.name}</span>
                <span class="cmp-row-sub">${hasClass ? (classNames[String(it.classId || '').replace(/-2024$/, '')] || '') : ''}${tab === 'classOptions' ? ' · ' + (it.kind_it || '') : ''}${it.ruleset === '2024' ? ' · 2024' : ''}</span></span>
              ${it.stub && html`<span class="cmp-dot" title="Da completare"></span>`}
              <span class="tag ${sourceTone(it)}">${shortSource(it)}</span>
            </button>`)}
        </div>
      </section>
      <section class="panel cmp-detail" data-testid="compendium-detail">
        ${!selected ? html`<${Empty} title="Seleziona una voce">Le voci con il pallino arancione sono <b>da completare</b>: l'app conosce nome e dati di base,
            il testo lo incolli tu dal tuo manuale con «Incolla testo».</${Empty}>`
        : html`<article class="cmp-card">
            <header class="cmp-head"><div><h2>${selected.name_it || selected.name}</h2>${selected.name_it && html`<div class="faint">${selected.name}</div>`}</div>
              <span class="spacer"></span><span class="tag ${sourceTone(selected)}">${selected.source}</span></header>
            <${StubBanner} dataset=${tab} item=${selected} />
            ${selected._homebrew && !selected.completed && html`<div class="row cmp-hb-actions">
              <${Button} size="sm" onClick=${() => setPaste({ hbId: selected._hbId })}>Sostituisci testo…</${Button}>
              <${ConfirmButton} size="sm" onConfirm=${() => { resetEntry(selected._hbId); navigate('compendium', tab); }}>Elimina</${ConfirmButton}></div>`}
            <${Body} tab=${tab} it=${selected} units=${units} classNames=${classNames} />
            <p class="faint cmp-attrib">${selected.stub ? 'Testo non incluso nell\'app.' : selected.completed ? 'Testo inserito da te (uso personale).' : selected.source === 'Homebrew' ? 'Contenuto creato da te.' : `${selected.source} · Wizards of the Coast · CC-BY-4.0`}</p>
          </article>`}
      </section>
    </div>
    <${PasteImportModal} open=${!!paste} dataset=${tab} hbId=${paste?.hbId || null} onClose=${() => setPaste(false)} onSaved=${(id) => setTimeout(() => go(id), 80)} />
  </div>`;
}
