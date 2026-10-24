// Pannello "Sincronizza dispositivi": invia/ricevi un file che unisce i dati tra PC, telefono e portatile.
import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { Panel, Button, Modal, TextField, toast } from '../../components/ui.js';
import * as store from '../../lib/store.js';
import { describeSummary } from '../../lib/sync.js';
import { canShareFiles, shareText, downloadText, pickText } from '../../lib/files.js';
import { useCollection } from '../../lib/hooks.js';

const LABELS = { characters: 'Personaggi', campaigns: 'Campagne', sessions: 'Sessioni', journal: 'Diario', notes: 'Note', encounters: 'Incontri', homebrew: 'Homebrew e voci completate' };
const when = (iso) => (iso ? new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'mai');

export function SyncPanel() {
  ['characters', 'sessions', 'journal', 'homebrew', 'deleted'].forEach((c) => useCollection(c)); // aggiorna il contatore
  const [info, setInfo] = useState(store.syncInfo());
  const [dev, setDev] = useState(store.deviceInfo());
  const [preview, setPreview] = useState(null); // { merge, fileName }
  const [busy, setBusy] = useState(false);
  const share = canShareFiles();
  const pending = store.changesSinceLastSend();
  useEffect(() => { setInfo(store.syncInfo()); }, [preview]);

  const send = async (mode) => {
    setBusy(true);
    try {
      const { filename, text, count } = await store.syncExport();
      const r = mode === 'share' ? await shareText(filename, text) : downloadText(filename, text);
      if (r.ok) { store.markSent(); setInfo(store.syncInfo()); toast(`Pronto: ${count} elementi in «${filename}». Ora aprilo con «Ricevi e unisci» sull'altro dispositivo.`, 'good'); }
      else if (!r.canceled) toast('Invio non riuscito: ' + (r.error || 'errore'), 'bad');
    } finally { setBusy(false); }
  };
  const receive = async () => {
    const f = await pickText();
    if (!f) return;
    try { setPreview({ merge: store.syncPreview(f.text), fileName: f.name }); }
    catch (err) { toast(String(err.message || err), 'bad'); }
  };
  const apply = async () => {
    setBusy(true);
    try {
      const r = await store.syncApply(preview.merge);
      if (r.ok) toast(`Dati uniti: ${r.totals.added} nuovi, ${r.totals.updated} aggiornati, ${r.totals.removed} eliminati. Lo stato precedente è in un backup.`, 'good');
      else toast(r.error || 'Unione non riuscita', 'bad');
      setPreview(null);
    } finally { setBusy(false); }
  };

  const m = preview?.merge;
  const lines = m ? describeSummary(m, LABELS) : [];
  return html`<${Panel} title="Sincronizza dispositivi" className="set-sync">
    <div data-testid="sync-panel">
      <p class="set-note">Per avere gli stessi dati su PC, telefono e portatile: su un dispositivo premi <b>Invia</b>, sull'altro <b>Ricevi e unisci</b>.
        Per ogni scheda, sessione o nota viene tenuta la versione modificata più di recente; niente viene cancellato senza un backup.</p>
      <div class="sync-status">
        <div><span class="set-k">Questo dispositivo</span>
          <${TextField} value=${dev.name} onInput=${(v) => { store.setDeviceName(v); setDev(store.deviceInfo()); }} data-testid="sync-device-name" /></div>
        <div><span class="set-k">Ultimo invio</span><b>${when(info.lastSentAt)}</b></div>
        <div><span class="set-k">Ultima ricezione</span><b>${when(info.lastReceivedAt)}</b>${info.lastReceivedFrom && html`<small class="faint"> da ${info.lastReceivedFrom}</small>`}</div>
        <div><span class="set-k">Modifiche da inviare</span><b class=${pending ? 'sync-pending' : ''} data-testid="sync-pending">${pending}</b></div>
      </div>
      <div class="sync-actions">
        ${share && html`<${Button} variant="primary" disabled=${busy} onClick=${() => send('share')} data-testid="sync-share">Invia (Quick Share, Drive, WhatsApp…)<//>`}
        <${Button} variant=${share ? '' : 'primary'} disabled=${busy} onClick=${() => send('download')} data-testid="sync-send">${share ? 'Salva file' : 'Invia ad altro dispositivo (salva file)…'}<//>
        <${Button} disabled=${busy} onClick=${receive} data-testid="sync-receive">Ricevi e unisci…<//>
      </div>
      <details class="sync-help"><summary>Come si fa, passo per passo</summary>
        <ol>
          <li>Sul dispositivo dove hai giocato per ultimo premi <b>Invia</b> e manda il file all'altro (Quick Share, Drive, WhatsApp a te stesso, cavo USB…).</li>
          <li>Sull'altro dispositivo apri <b>Dati e backup → Ricevi e unisci</b> e scegli il file: vedrai cosa cambia prima di confermare.</li>
          <li>Se hai modificato cose anche sul secondo dispositivo, rifai il giro al contrario: così entrambi hanno tutto.</li>
        </ol>
        <p class="faint">Le impostazioni (unità, sezione aperta…) restano proprie di ogni dispositivo. Se modifichi la stessa scheda su due dispositivi senza sincronizzare in mezzo, vince la modifica più recente.</p>
      </details>
    </div>
    <${Modal} open=${!!preview} title="Unire i dati ricevuti?" onClose=${() => setPreview(null)}>
      ${m && html`<div data-testid="sync-preview">
        <p>File <b>${preview.fileName}</b>${m.from?.name ? html` da <b>${m.from.name}</b>` : ''}${m.exportedAt ? ` (${when(m.exportedAt)})` : ''}.</p>
        ${lines.length ? html`<ul class="sync-lines">${lines.map((l) => html`<li>${l}</li>`)}</ul>`
          : html`<p class="faint">Nessuna differenza: i dati sono già allineati.</p>`}
        <p class="faint">${m.totals.kept} elementi restano come sono. Prima di unire viene creato un backup automatico.</p>
        <div class="row"><span class="spacer"></span>
          <${Button} variant="ghost" onClick=${() => setPreview(null)}>Annulla<//>
          <${Button} variant="primary" disabled=${busy || !lines.length} onClick=${apply} data-testid="sync-apply">Unisci<//></div>
      </div>`}
    <//>
  <//>`;
}
