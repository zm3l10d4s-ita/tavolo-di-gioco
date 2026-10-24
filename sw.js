// Service worker di Tavolo di Gioco (generato da scripts/build-web.mjs — non modificare web/sw.js a mano).
// Tiene in cache tutta l'app e i dati SRD, così funziona senza connessione.
// I dati dell'utente NON passano di qui: stanno in IndexedDB sul dispositivo.
const VERSION = '95a50c3e3d14';
const CACHE = 'tavolo-' + VERSION;
const FILES = ["./","data/catalog/backgrounds.json","data/catalog/classOptions.json","data/catalog/classes.json","data/catalog/feats.json","data/catalog/magicItems.json","data/catalog/races.json","data/catalog/spells.json","data/catalog/subclasses.json","data/seed/seed-fjellbjorn.json","data/srd/abilities.json","data/srd/backgrounds.json","data/srd/classes.json","data/srd/conditions.json","data/srd/damageTypes.json","data/srd/equipment.json","data/srd/feats.json","data/srd/languages.json","data/srd/levels.json","data/srd/magicItems.json","data/srd/monsters.json","data/srd/races.json","data/srd/rules.json","data/srd/skills.json","data/srd/spells.json","data/srd/subclasses.json","data/srd/subraces.json","data/srd/tables.json","data/srd/weaponProperties.json","index.html","src/app.js","src/components/global-search.js","src/components/icons.js","src/components/paste-import.js","src/components/pick-character.js","src/components/prose.js","src/components/statblock.js","src/components/ui.js","src/fonts/OFL-EB-Garamond.txt","src/fonts/eb-garamond-latin-400-italic.woff2","src/fonts/eb-garamond-latin-400-normal.woff2","src/fonts/eb-garamond-latin-500-normal.woff2","src/fonts/eb-garamond-latin-600-normal.woff2","src/fonts/eb-garamond-latin-700-normal.woff2","src/icons/apple-touch-icon.png","src/icons/icon-192.png","src/icons/icon-512.png","src/icons/maskable-512.png","src/index.html","src/lib/campaign.js","src/lib/catalog.js","src/lib/combat.js","src/lib/files.js","src/lib/hooks.js","src/lib/links.js","src/lib/parse-text.js","src/lib/pwa.js","src/lib/router.js","src/lib/rules.js","src/lib/session-core.js","src/lib/srd.js","src/lib/store.js","src/lib/sync.js","src/lib/util.js","src/lib/web-backend.js","src/manifest.webmanifest","src/styles/app.css","src/styles/bestiary.css","src/styles/characters.css","src/styles/compendium.css","src/styles/equipment.css","src/styles/journal.css","src/styles/mobile.css","src/styles/session.css","src/styles/settings.css","src/styles/spells.css","src/vendor/preact-htm.js","src/views/bestiary/editor.js","src/views/bestiary/filter.js","src/views/bestiary/homebrew.js","src/views/bestiary/index.js","src/views/characters/api.js","src/views/characters/index.js","src/views/characters/levelup.js","src/views/characters/list.js","src/views/characters/logic.js","src/views/characters/rest.js","src/views/characters/sheet.js","src/views/characters/tab-combat.js","src/views/characters/tab-features.js","src/views/characters/tab-inventory.js","src/views/characters/tab-main.js","src/views/characters/tab-spells.js","src/views/characters/tab-story.js","src/views/characters/widgets.js","src/views/characters/wizard.js","src/views/compendium/index.js","src/views/equipment/editor.js","src/views/equipment/format.js","src/views/equipment/index.js","src/views/journal/encounters.js","src/views/journal/entries.js","src/views/journal/index.js","src/views/journal/notes.js","src/views/session/actions.js","src/views/session/campaign.js","src/views/session/detail.js","src/views/session/index.js","src/views/session/log.js","src/views/session/pc.js","src/views/session/tracker.js","src/views/settings/index.js","src/views/settings/sync.js","src/views/spells/editor.js","src/views/spells/format.js","src/views/spells/index.js"];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // a blocchi per non saturare la rete del telefono
    for (let i = 0; i < FILES.length; i += 20) {
      await cache.addAll(FILES.slice(i, i + 20).map((f) => new Request(f, { cache: 'reload' })));
    }
  })());
  // non si attiva da solo: aspetta che l'utente prema "Aggiorna" (vedi app.js)
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('tavolo-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') {
        const shell = await cache.match(new URL('src/index.html', self.registration.scope));
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
