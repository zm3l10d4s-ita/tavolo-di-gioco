// Shell dell'app: navigazione tra sezioni, campagna/sessione attiva, indicatore di salvataggio, scorciatoie, routing con hash.
import { html, render, useState, useEffect, Component } from './vendor/preact-htm.js';
import { initStore, getSetting, setSetting } from './lib/store.js';
import { registerServiceWorker, UpdateBar } from './lib/pwa.js';
import { useSaveStatus, useCollection, useDoc } from './lib/hooks.js';
import { ToastHost, Modal } from './components/ui.js';
import { Icon } from './components/icons.js';
import { GlobalSearch } from './components/global-search.js';
import { navigate, parseHash } from './lib/router.js';
import { activeCampaign, currentSession, installRollListener } from './lib/campaign.js';

// Le sezioni sono caricate su richiesta (import dinamico): un errore in una sezione non blocca le altre.
// `ico` = nome icona SVG (src/components/icons.js).
export const SECTIONS = [
  { id: 'session', label: 'Sessione attiva', ico: 'swords', load: () => import('./views/session/index.js') },
  { id: 'characters', label: 'Schede personaggi', ico: 'users', load: () => import('./views/characters/index.js') },
  { id: 'bestiary', label: 'Bestiario', ico: 'skull', load: () => import('./views/bestiary/index.js') },
  { id: 'spells', label: 'Incantesimi', ico: 'sparkles', load: () => import('./views/spells/index.js') },
  { id: 'equipment', label: 'Equipaggiamento', ico: 'backpack', load: () => import('./views/equipment/index.js') },
  { id: 'compendium', label: 'Compendio', ico: 'scroll', load: () => import('./views/compendium/index.js') },
  { id: 'journal', label: 'Diario campagna', ico: 'book', load: () => import('./views/journal/index.js') },
  { id: 'settings', label: 'Dati e backup', ico: 'database', load: () => import('./views/settings/index.js') },
];
const loaded = new Map(); // id -> { component } | { error }
/** Sezioni nella barra in basso del telefono (le altre stanno in «Altro»). */
const MOBILE_TABS = ['session', 'characters', 'bestiary', 'spells'];
const MOBILE_LABEL = { session: 'Sessione', characters: 'Schede', bestiary: 'Bestiario', spells: 'Incantesimi', equipment: 'Equipaggiamento', compendium: 'Compendio', journal: 'Diario', settings: 'Dati e backup' };
/** Id dell'elemento aperto nel dettaglio (sul telefono lista e dettaglio sono schermate separate) e rotta "indietro". */
function detailOf(section, params = []) {
  if (section === 'equipment') { const p = params.filter((x) => x !== 'magic'); return { id: p[0] || null, back: params[0] === 'magic' ? ['magic'] : [] }; }
  if (section === 'compendium') return { id: params[1] || null, back: params[0] ? [params[0]] : [] };
  if (section === 'session' || section === 'settings') return { id: null, back: [] };
  if (section === 'journal') {
    if (params[0] === 'encounters') return { id: params[1] || null, back: ['encounters'] };
    if (['notes', 'campaign'].includes(params[0])) return { id: null, back: [] };
    return { id: params[0] || null, back: [] };
  }
  return { id: params[0] || null, back: [] };
}

/** Carica la sezione e la rende; isola gli errori di caricamento e di rendering. */
function SectionHost({ section, params }) {
  const [, force] = useState(0);
  const st = loaded.get(section.id);
  useEffect(() => {
    if (loaded.has(section.id)) return;
    section.load().then(
      (m) => { loaded.set(section.id, { component: m.default }); force((x) => x + 1); },
      (e) => { console.error('[app] sezione', section.id, e); loaded.set(section.id, { error: String(e?.message || e) }); force((x) => x + 1); },
    );
  }, [section.id]);
  if (!st) return html`<div class="view section-loading"><span class="faint">Caricamento…</span></div>`;
  if (st.error) return html`<div class="view"><div class="empty"><div class="empty-title">Impossibile aprire «${section.label}»</div>
    <div class="empty-body">${st.error}</div></div></div>`;
  const det = detailOf(section.id, params);
  return html`<div class="section-wrap" data-section=${section.id} data-detail=${det.id ? '1' : '0'}>
    <${ErrorBoundary} key=${section.id} label=${section.label}><${st.component} params=${params} navigate=${navigate} /></${ErrorBoundary}></div>`;
}

class ErrorBoundary extends Component {
  constructor() { super(); this.state = { error: null }; }
  componentDidCatch(error) { console.error('[app] errore nella sezione', this.props.label, error); this.setState({ error }); }
  render() {
    if (!this.state.error) return this.props.children;
    return html`<div class="view"><div class="empty"><div class="empty-title">Qualcosa è andato storto in «${this.props.label}»</div>
      <div class="empty-body"><p>${String(this.state.error?.message || this.state.error)}</p>
      <button class="btn" onClick=${() => this.setState({ error: null })}>Riprova</button></div></div></div>`;
  }
}

const SHORTCUTS = [
  ['Ctrl + 1…8', 'Vai alla sezione (nell\'ordine della barra laterale)'],
  ['Ctrl + K', 'Ricerca globale: mostri, incantesimi, oggetti, personaggi'],
  ['Alt + → / Alt + ←', 'Combattimento: turno successivo / precedente'],
  ['Invio', 'Nel campo PF: applica danno (-7), cura (+5), valore (=20), PF temp (t5)'],
  ['Ctrl + /', 'Mostra queste scorciatoie'],
  ['Esc', 'Chiudi finestre e ricerca'],
];

function SaveIndicator({ testid = 'save-status' } = {}) {
  const s = useSaveStatus();
  const label = { idle: '—', pending: 'Modifiche…', saving: 'Salvataggio…', saved: 'Tutto salvato', error: 'Errore di salvataggio' }[s.state];
  const time = s.lastSavedAt ? new Date(s.lastSavedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
  return html`<div class="save-ind" data-testid=${testid} data-state=${s.state} title=${s.error || label + (time ? ' alle ' + time : '')}>
    <span class="save-dot ${s.state}"></span><span class="save-label">${label}${s.state === 'saved' && time ? ' · ' + time : ''}</span>
  </div>`;
}

/** Riquadro "In gioco": campagna e sessione attive, con collegamento rapido alla sessione. */
function ActivePlay({ current }) {
  useCollection('campaigns'); useCollection('sessions'); useDoc('settings', 'app');
  const c = activeCampaign();
  const s = currentSession();
  if (!c) return html`<button class="sb-active empty" onClick=${() => navigate('session')} title="Crea una campagna" data-testid="sidebar-active">
    <span class="sb-active-ico"><${Icon} name="map" size=${18} /></span><span class="sb-active-body"><small>Nessuna campagna</small><b>Crea campagna</b></span></button>`;
  const cb = s?.combat;
  const fighting = cb?.active && cb.combatants?.length;
  const turn = fighting ? cb.combatants[cb.turnIndex]?.name : null;
  return html`<button class="sb-active ${current === 'session' ? 'here' : ''}" onClick=${() => navigate('session')} data-testid="sidebar-active"
      title=${`${c.name}${s ? ' · ' + s.title : ''}`}>
    <span class="sb-active-ico ${fighting ? 'live' : ''}"><${Icon} name=${fighting ? 'swords' : 'map'} size=${18} /></span>
    <span class="sb-active-body">
      <small>Campagna</small>
      <b data-testid="sidebar-campaign">${c.name}</b>
      <span class="sb-active-session" data-testid="sidebar-session">${s ? `${s.title}${s.date ? ' · ' + new Date(s.date + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : ''}` : 'Nessuna sessione in corso'}</span>
      ${fighting && html`<span class="sb-active-live"><i></i>Round ${cb.round} · ${turn}</span>`}
    </span>
  </button>`;
}

function App() {
  const [route, setRoute] = useState(parseHash());
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    const on = () => { const r = parseHash(); setRoute(r); if (r.section) setSetting('lastSection', r.section); };
    window.addEventListener('hashchange', on);
    if (!route.section) navigate(getSetting('lastSection', 'session'));
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => installRollListener(), []);
  useEffect(() => {
    const k = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= SECTIONS.length && !e.shiftKey) { e.preventDefault(); setSearchOpen(false); navigate(SECTIONS[n - 1].id); return; }
      const key = e.key.toLowerCase();
      if (key === 'k') { e.preventDefault(); setHelpOpen(false); setSearchOpen((x) => !x); }
      else if (key === '/') { e.preventDefault(); setHelpOpen((x) => !x); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const current = SECTIONS.find((s) => s.id === route.section) || SECTIONS[0];
  const det = detailOf(current.id, route.params);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => { setMoreOpen(false); }, [route.section]);
  const inMore = !MOBILE_TABS.includes(current.id);
  return html`<div class="app">
    <header class="m-top" data-testid="m-top">
      ${det.id ? html`<button class="m-icon-btn" onClick=${() => navigate(current.id, ...det.back)} aria-label="Indietro" data-testid="m-back"><${Icon} name="prev" size=${22} /></button>`
        : html`<span class="m-brand"><${Icon} name="d20" size=${22} strokeWidth=${1.6} /></span>`}
      <span class="m-title">${MOBILE_LABEL[current.id] || current.label}</span>
      <${SaveIndicator} testid="m-save-status" />
      <button class="m-icon-btn" onClick=${() => setSearchOpen(true)} aria-label="Cerca" data-testid="m-search"><${Icon} name="search" size=${21} /></button>
    </header>
    <nav class="sidebar" aria-label="Sezioni">
      <div class="brand" title="Tavolo di Gioco · D&D 5e"><span class="brand-mark"><${Icon} name="d20" size=${22} strokeWidth=${1.6} /></span>
        <span class="brand-text">Tavolo di Gioco<small>D&D 5e · SRD</small></span></div>
      <button class="sb-search" onClick=${() => setSearchOpen(true)} data-testid="open-search" title="Ricerca globale (Ctrl+K)">
        <${Icon} name="search" size=${16} /><span class="sb-search-label">Cerca…</span><kbd>Ctrl K</kbd></button>
      <div class="nav-list">
        ${SECTIONS.map((s, i) => html`<button class="nav-item ${s.id === current.id ? 'active' : ''}" data-nav=${s.id}
          aria-current=${s.id === current.id ? 'page' : undefined} title=${`${s.label} (Ctrl+${i + 1})`}
          onClick=${() => navigate(s.id)}><span class="ico"><${Icon} name=${s.ico} size=${19} /></span><span class="nav-label">${s.label}</span></button>`)}
      </div>
      <${ActivePlay} current=${current.id} />
      <div class="sidebar-foot">
        <${SaveIndicator} />
        <button class="btn ghost sm sb-help" onClick=${() => setHelpOpen(true)} title="Scorciatoie da tastiera (Ctrl+/)" data-testid="open-shortcuts"><${Icon} name="keyboard" size=${16} /></button>
      </div>
    </nav>
    <main class="main"><${SectionHost} section=${current} params=${route.params} /></main>
    <nav class="m-tabs" aria-label="Sezioni" data-testid="m-tabs">
      ${MOBILE_TABS.map((id) => { const s = SECTIONS.find((x) => x.id === id); return html`<button class="m-tab ${current.id === id ? 'active' : ''}" data-mnav=${id}
        onClick=${() => navigate(id)}><${Icon} name=${s.ico} size=${22} /><span>${MOBILE_LABEL[id]}</span></button>`; })}
      <button class="m-tab ${inMore || moreOpen ? 'active' : ''}" data-mnav="more" onClick=${() => setMoreOpen((x) => !x)}><${Icon} name="d20" size=${22} /><span>Altro</span></button>
    </nav>
    ${moreOpen && html`<div class="m-more-backdrop" onClick=${() => setMoreOpen(false)}>
      <div class="m-more" onClick=${(e) => e.stopPropagation()} data-testid="m-more">
        ${SECTIONS.filter((s) => !MOBILE_TABS.includes(s.id)).map((s) => html`<button class="m-more-item ${current.id === s.id ? 'active' : ''}" data-mnav=${s.id}
          onClick=${() => { setMoreOpen(false); navigate(s.id); }}><${Icon} name=${s.ico} size=${22} /><span>${s.label}</span></button>`)}
        <div class="m-more-active"><${ActivePlay} current=${current.id} /></div>
      </div></div>`}
    <${GlobalSearch} open=${searchOpen} onClose=${() => setSearchOpen(false)} />
    <${Modal} open=${helpOpen} title="Scorciatoie da tastiera" onClose=${() => setHelpOpen(false)}>
      <table class="table shortcuts"><tbody>${SHORTCUTS.map(([k, d]) => html`<tr><td><kbd>${k}</kbd></td><td>${d}</td></tr>`)}</tbody></table>
    </${Modal}>
    <${ToastHost} />
    <${UpdateBar} />
  </div>`;
}

initStore().then(() => { render(html`<${App} />`, document.getElementById('root')); registerServiceWorker(); }).catch((err) => {
  document.getElementById('root').textContent = 'Errore di avvio: ' + err;
  console.error(err);
});
