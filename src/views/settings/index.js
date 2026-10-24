// Sezione "Dati e backup": cartella dati, stato salvataggio, backup/rollback, export/import,
// preferenze (unità, regolamento) e licenze/attribuzioni. Proprietario: Agente 2.
import { html, useState, useEffect, useCallback } from '../../vendor/preact-htm.js';
import { Panel, Button, ConfirmButton, Select, TextField, Tag, Empty, toast } from '../../components/ui.js';
import { useSaveStatus, useDoc } from '../../lib/hooks.js';
import * as store from '../../lib/store.js';
import * as srd from '../../lib/srd.js';
import { SyncPanel } from './sync.js';

const FONT_LICENSE_URL = new URL('../../fonts/OFL-EB-Garamond.txt', import.meta.url);

const COLLECTION_LABELS = {
  characters: ['personaggio', 'personaggi'], campaigns: ['campagna', 'campagne'], sessions: ['sessione', 'sessioni'],
  journal: ['voce di diario', 'voci di diario'], notes: ['nota', 'note'], encounters: ['incontro', 'incontri'],
  homebrew: ['homebrew', 'homebrew'],
};
const STATE_LABELS = { idle: '—', pending: 'Modifiche in attesa', saving: 'Salvataggio in corso…', saved: 'Tutto salvato', error: 'Errore di salvataggio' };

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function fmtTime(iso) { return iso ? new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'; }
function fmtBytes(n) {
  if (!n) return '0 KB';
  if (n < 1024 * 1024) return (n / 1024).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' KB';
  return (n / 1024 / 1024).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' MB';
}
function fmtCounts(counts = {}) {
  const parts = Object.entries(COLLECTION_LABELS)
    .filter(([c]) => counts[c])
    .map(([c, [one, many]]) => `${counts[c]} ${counts[c] === 1 ? one : many}`);
  return parts.length ? parts.join(' · ') : 'nessun dato';
}
function kindTag(b) {
  if (b.kind === 'manual') return html`<${Tag} tone="accent">Manuale<//>`;
  if (b.kind === 'safety') return html`<${Tag} tone="magic">${b.reasonLabel}<//>`;
  return html`<${Tag}>${b.reasonLabel}<//>`;
}

// ------------------------------------------------------------------ pannelli
function StoragePanel({ info }) {
  const s = useSaveStatus();
  const [events, setEvents] = useState(store.getStorageEvents());
  useEffect(() => store.subscribeStorageEvents(() => setEvents(store.getStorageEvents())), []);
  return html`<${Panel} title="Salvataggio" className="set-storage">
    <div class="set-kv">
      <span class="set-k">Cartella dati</span>
      <div class="set-path-row">
        <code class="set-path" data-testid="settings-data-dir" title=${info?.dataDir || ''}>${info?.dataDir || '…'}</code>
        ${store.isDesktop && html`<${Button} size="sm" onClick=${() => store.openDataDir()} data-testid="open-data-dir">Apri cartella<//>`}
      </div>
    </div>
    <div class="set-kv">
      <span class="set-k">Stato</span>
      <span class="set-status" data-testid="settings-save-state" data-state=${s.state}>
        <span class="save-dot ${s.state}"></span>${STATE_LABELS[s.state] || s.state}
        ${s.lastSavedAt && html`<span class="faint"> · ultimo salvataggio ${fmtTime(s.lastSavedAt)}</span>`}
      </span>
    </div>
    ${s.error && html`<p class="set-error">${s.error}</p>`}
    ${store.isDesktop
      ? html`<p class="set-note faint">Ogni modifica è scritta su disco entro un secondo, in modo atomico, con una copia
      della versione precedente. Un backup completo viene creato all'avvio, ogni 10 minuti se ci sono modifiche
      e alla chiusura.</p>`
      : html`<p class="set-note faint">Ogni modifica è salvata subito nella memoria interna dell'app su questo dispositivo
      ${info?.persisted ? '(protetta: il sistema non la cancella da solo)' : ''}. Un backup completo viene creato all'apertura
      dell'app (al massimo ogni 6 ore). Disinstallare l'app o cancellare i dati del sito elimina i dati: sincronizza o esporta spesso.</p>
      ${info?.usage != null && html`<p class="set-note faint">Spazio usato: ${fmtBytes(info.usage)}</p>`}`}
    ${events.length > 0 && html`<div class="set-events" data-testid="storage-events">
      <span class="set-k">Eventi di questa sessione</span>
      <ul>${events.slice().reverse().map((e) => html`<li class=${'lvl-' + (e.level || 'info')}>
        <span class="faint">${fmtTime(e.at)}</span> ${e.message}</li>`)}</ul>
    </div>`}
  <//>`;
}

function BackupPanel({ backups, refresh, busy, run }) {
  const [label, setLabel] = useState('');
  const create = () => run(async () => {
    const r = await store.createBackup(label.trim() || 'Backup manuale');
    if (r?.ok) { toast('Backup creato: ' + (r.label || r.id), 'good'); setLabel(''); }
    else toast('Backup non creato: ' + (r?.error || 'errore'), 'bad');
  });
  const restore = (b) => run(async () => {
    const r = await store.restoreBackup(b.id);
    if (r?.ok) toast(`Ripristinato il backup del ${fmtDate(b.createdAt)}. Lo stato precedente è nel backup «Prima del ripristino».`, 'good');
    else toast('Ripristino fallito: ' + (r?.error || 'errore'), 'bad');
  });
  const del = (b) => run(async () => {
    const r = await store.deleteBackup(b.id);
    if (!r?.ok) toast('Eliminazione fallita: ' + (r?.error || 'errore'), 'bad');
  });
  const autos = backups.filter((b) => b.kind === 'auto').length;
  const manuals = backups.filter((b) => b.kind === 'manual').length;

  return html`<${Panel} title="Backup e ripristino" className="set-backups"
    actions=${html`<${Button} size="sm" variant="ghost" onClick=${refresh} title="Aggiorna elenco">↻<//>`}>
    <form class="set-create" onSubmit=${(e) => { e.preventDefault(); create(); }}>
      <${TextField} label="Etichetta del backup" value=${label} onInput=${setLabel}
        placeholder="es. Prima dello scontro col drago" data-testid="backup-label" maxlength="80" />
      <${Button} type="submit" variant="primary" disabled=${busy} data-testid="backup-create">Crea backup ora<//>
    </form>
    <p class="set-note faint">I backup con etichetta si conservano tutti; degli automatici si tengono gli ultimi ${store.isDesktop ? 30 : 15}
      (più gli ultimi 10 creati prima di ripristini, importazioni e sincronizzazioni). Ripristinare un backup crea prima un backup
      dello stato attuale, quindi è sempre possibile tornare indietro.${store.isDesktop ? '' : ' Sul telefono i backup stanno dentro l\'app: per una copia esterna usa «Invia» qui sopra o «Esporta tutto».'}</p>
    ${backups.length === 0
        ? html`<${Empty} title="Nessun backup">Il primo backup automatico verrà creato al prossimo avvio o tra pochi minuti.<//>`
        : html`<div class="set-summary faint">${backups.length} backup · ${manuals} ${manuals === 1 ? 'manuale' : 'manuali'} · ${autos} ${autos === 1 ? 'automatico' : 'automatici'}</div>
          <div class="set-table-wrap"><table class="table set-table" data-testid="backup-list">
            <thead><tr><th>Backup</th><th>Tipo</th><th class="r">Dimensione</th><th></th></tr></thead>
            <tbody>${backups.map((b) => html`<tr key=${b.id} data-testid="backup-row" data-id=${b.id}>
              <td class="set-when">
                ${b.label && html`<div class="set-label">${b.label}</div>`}
                <div class="set-date">${fmtDate(b.createdAt)}</div>
                <div class="faint set-counts">${fmtCounts(b.counts)}</div>
              </td>
              <td>${kindTag(b)}</td>
              <td class="r faint">${fmtBytes(b.bytes)}</td>
              <td class="set-actions">
                <span data-testid="backup-restore"><${ConfirmButton} variant="" confirmText="Confermi ripristino?" onConfirm=${() => restore(b)}>Ripristina<//></span>
                <span data-testid="backup-delete"><${ConfirmButton} variant="ghost" confirmText="Eliminare?" onConfirm=${() => del(b)}>Elimina<//></span>
              </td>
            </tr>`)}</tbody>
          </table></div>`}
  <//>`;
}

function TransferPanel({ busy, run }) {
  const doExport = () => run(async () => {
    const r = await store.exportAll();
    if (r?.ok) toast('Dati esportati in ' + r.path, 'good');
    else if (!r?.canceled) toast('Esportazione fallita: ' + (r?.error || 'errore'), 'bad');
  });
  const doImport = () => run(async () => {
    const r = await store.importAll();
    if (r?.ok) toast(`Importati: ${fmtCounts(r.counts)}. Lo stato precedente è nel backup «Prima dell'importazione».`, 'good');
    else if (!r?.canceled) toast('Importazione fallita: ' + (r?.error || 'errore'), 'bad');
  });
  return html`<${Panel} title="Esporta / importa" className="set-transfer">
    <p class="set-note">Un unico file JSON con tutti i dati (personaggi, campagne, sessioni, diario, note, incontri,
      homebrew, impostazioni): utile come copia di sicurezza. Per tenere allineati più dispositivi usa invece «Sincronizza».</p>
    <div class="row">
      <${Button} onClick=${doExport} disabled=${busy} data-testid="export-all">Esporta tutto…<//>
      <span data-testid="import-all"><${ConfirmButton} variant="" size="" confirmText="Sostituire i dati con il file?"
        onConfirm=${doImport}>Importa da file…<//></span>
    </div>
    <p class="set-note faint">L'importazione sostituisce le collezioni presenti nel file, dopo averle validate e dopo un backup automatico.</p>
  <//>`;
}

function PrefsPanel() {
  const [s] = useDoc('settings', 'app');
  const units = s?.units ?? 'm';
  const ruleset = s?.ruleset ?? '2014';
  return html`<${Panel} title="Preferenze" className="set-prefs">
    <div class="set-prefs-grid">
      <${Select} label="Unità di misura" value=${units} data-testid="setting-units"
        options=${[{ value: 'm', label: 'Metri (1,5 m = 5 ft)' }, { value: 'ft', label: 'Piedi (ft)' }]}
        onChange=${(v) => store.setSetting('units', v)} />
      <${Select} label="Regolamento predefinito" value=${ruleset} data-testid="setting-ruleset"
        options=${[{ value: '2014', label: '2014 (SRD 5.1)' }, { value: '2024', label: '2024 (SRD 5.2.1)' }, { value: 'mix', label: 'Misto (2014 + 2024)' }]}
        onChange=${(v) => store.setSetting('ruleset', v)} />
    </div>
    <p class="set-note faint">Le distanze restano salvate in piedi (come nell'SRD) e vengono mostrate nell'unità scelta.
      Il regolamento predefinito si applica ai nuovi personaggi. «Misto» permette di prendere razze, classi, background, talenti e incantesimi da entrambe le versioni.</p>
  <//>`;
}

function LicensesPanel() {
  const [attr, setAttr] = useState(null);
  const [ofl, setOfl] = useState('');
  useEffect(() => {
    let alive = true;
    srd.meta('abilities').then((m) => alive && setAttr(m?.attributions || (m?.attribution ? { SRD: m.attribution } : {}))).catch(() => alive && setAttr({}));
    fetch(FONT_LICENSE_URL).then((r) => (r.ok ? r.text() : '')).then((t) => alive && setOfl(t)).catch(() => {});
    return () => { alive = false; };
  }, []);
  const entries = [
    ['SRD 5.1', 'System Reference Document 5.1 — regolamento 2014'],
    ['SRD 5.2', 'System Reference Document 5.2.1 — regolamento 2024'],
    ['SRD 5.2 (it)', 'SRD 5.2.1 — preambolo ufficiale in italiano'],
  ];
  return html`<${Panel} title="Licenze e attribuzioni" className="set-licenses">
    <div data-testid="licenses">
      <p class="set-note">I dati di gioco provengono dagli SRD di Wizards of the Coast, distribuiti con licenza
        <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noreferrer">Creative Commons Attribution 4.0 (CC-BY-4.0)</a>.
        App non ufficiale, compatibile con la quinta edizione (5E compatible).</p>
      ${attr === null ? html`<p class="faint">Caricamento…</p>` : entries.filter(([k]) => attr[k]).map(([k, title]) => html`
        <figure class="set-attr" data-testid=${'attr-' + k.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}>
          <figcaption>${title}</figcaption>
          <blockquote>${attr[k]}</blockquote>
        </figure>`)}
      <figure class="set-attr">
        <figcaption>Carattere EB Garamond — SIL Open Font License 1.1</figcaption>
        <blockquote>Copyright 2017 The EB Garamond Project Authors (https://github.com/octaviopardo/EBGaramond12). Distribuito con licenza SIL Open Font License, versione 1.1.</blockquote>
        ${ofl && html`<details class="set-ofl"><summary>Testo completo della licenza OFL</summary><pre data-testid="ofl-text">${ofl}</pre></details>`}
      </figure>
    </div>
  <//>`;
}

// ------------------------------------------------------------------ vista
export default function SettingsView() {
  const [info, setInfo] = useState(null);
  const [backups, setBackups] = useState([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try { setBackups((await store.listBackups()) || []); } catch (err) { console.error(err); }
  }, []);
  useEffect(() => {
    store.appInfo().then(setInfo).catch(() => {});
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, []);
  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); refresh(); }
  };

  return html`<div class="view set-view" data-testid="settings-view">
    <div class="view-head">
      <h1>Dati e backup</h1>
      ${info?.version && html`<span class="faint">versione ${info.version}</span>`}
    </div>
    <div class="set-layout">
      <div class="set-main">
        <${SyncPanel} />
        <${BackupPanel} backups=${backups} refresh=${refresh} busy=${busy} run=${run} />
      </div>
      <div class="set-side">
        <${StoragePanel} info=${info} />
        <${TransferPanel} busy=${busy} run=${run} />
        <${PrefsPanel} />
      </div>
      <div class="set-full"><${LicensesPanel} /></div>
    </div>
  </div>`;
}
