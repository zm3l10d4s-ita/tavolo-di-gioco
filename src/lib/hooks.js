// Hook Preact per leggere lo store in modo reattivo.
import { useState, useEffect, useRef } from '../vendor/preact-htm.js';
import * as store from './store.js';
import * as srd from './srd.js';

/** Lista reattiva di una collezione (opzionale filtro). */
export function useCollection(collection, filterFn) {
  const [, force] = useState(0);
  useEffect(() => store.subscribe((c) => { if (c === collection) force((x) => x + 1); }), [collection]);
  return store.list(collection, filterFn);
}

/** Singolo documento reattivo. Ritorna [doc, patch] dove patch(obj|fn) salva subito (autosave). */
export function useDoc(collection, id) {
  const [, force] = useState(0);
  useEffect(() => store.subscribe((c, i) => {
    if (c === collection && (i === id || i === null)) force((x) => x + 1);
  }), [collection, id]);
  const doc = id ? store.get(collection, id) : null;
  const patch = (p) => store.update(collection, id, p);
  return [doc, patch];
}

/** Stato di salvataggio per l'indicatore in alto. */
export function useSaveStatus() {
  const [s, setS] = useState(store.getStatus());
  useEffect(() => store.subscribeStatus(setS), []);
  return s;
}

/** Carica un dataset SRD (+ homebrew). Ritorna { items, loading, error }. */
export function useSrd(name) {
  const [state, setState] = useState({ items: srd.cached(name) || [], loading: !srd.cached(name), error: null });
  useEffect(() => {
    let alive = true;
    srd.load(name).then(
      (items) => alive && setState({ items, loading: false, error: null }),
      (error) => alive && setState({ items: [], loading: false, error: String(error) }),
    );
    const off = store.subscribe((c) => {
      if (c !== 'homebrew') return;
      srd.invalidate(name);
      srd.load(name).then((items) => alive && setState({ items, loading: false, error: null }));
    });
    return () => { alive = false; off(); };
  }, [name]);
  return state;
}

/** Valore locale con debounce verso una funzione di commit (utile per textarea lunghe). */
export function useDebouncedCommit(value, commit, ms = 250) {
  const [local, setLocal] = useState(value);
  const t = useRef(null);
  useEffect(() => { setLocal(value); }, [value]);
  const onChange = (v) => {
    setLocal(v);
    clearTimeout(t.current);
    t.current = setTimeout(() => commit(v), ms);
  };
  return [local, onChange];
}
