// Installazione come app (PWA): registra il service worker e avvisa quando c'è una versione nuova.
// Solo nella versione web: nell'app desktop (Electron) non fa nulla.
import { html, useState, useEffect } from '../vendor/preact-htm.js';
import { flushAll } from './store.js';

let waiting = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn(!!waiting));

export function registerServiceWorker() {
  if (window.dndAPI || !('serviceWorker' in navigator)) return;
  if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return;
  const swUrl = new URL('../sw.js', location.href);
  navigator.serviceWorker.register(swUrl, { scope: new URL('../', location.href).pathname }).then((reg) => {
    const track = (w) => {
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) { waiting = w; notify(); }
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) { waiting = reg.waiting; notify(); }
    track(reg.installing);
    reg.addEventListener('updatefound', () => track(reg.installing));
    // controlla aggiornamenti quando l'app torna in primo piano
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => { /* sw.js assente in sviluppo: nessun problema */ });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading && waiting) { reloading = true; location.reload(); } });
}

export async function applyUpdate() {
  if (!waiting) return;
  await flushAll().catch(() => {});
  waiting.postMessage('SKIP_WAITING');
}

/** Barra "Nuova versione disponibile". */
export function UpdateBar() {
  const [ready, setReady] = useState(!!waiting);
  useEffect(() => { listeners.add(setReady); return () => listeners.delete(setReady); }, []);
  if (!ready) return null;
  return html`<div class="update-bar" role="status" data-testid="update-bar">
    <span>È disponibile una nuova versione dell'app. I tuoi dati restano dove sono.</span>
    <button class="btn sm primary" onClick=${applyUpdate}>Aggiorna</button>
  </div>`;
}
