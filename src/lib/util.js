// Utility condivise.
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
export function nowIso() { return new Date().toISOString(); }
export function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
export function slug(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
/** Normalizza testo per la ricerca (minuscole, senza accenti). */
export function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
export function signed(n) { n = Number(n) || 0; return (n >= 0 ? '+' : '') + n; }
export function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

/** Tira dadi da un'espressione tipo "2d6+3", "1d20", "4d6kh3". Ritorna { total, rolls, expr }. */
export function roll(expr) {
  const clean = String(expr).replace(/\s+/g, '').toLowerCase();
  const re = /([+-]?)(\d*)d(\d+)(kh\d+|kl\d+)?|([+-]?)(\d+)/g;
  let m, total = 0; const rolls = [];
  while ((m = re.exec(clean))) {
    if (m[3]) {
      const sign = m[1] === '-' ? -1 : 1;
      const n = Number(m[2] || 1), die = Number(m[3]);
      let r = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * die));
      let kept = r;
      if (m[4]) {
        const k = Number(m[4].slice(2));
        const sorted = [...r].sort((a, b) => b - a);
        kept = m[4].startsWith('kh') ? sorted.slice(0, k) : sorted.slice(-k);
      }
      const sum = kept.reduce((a, b) => a + b, 0) * sign;
      rolls.push({ die: `${n}d${die}${m[4] || ''}`, results: r, sum });
      total += sum;
    } else if (m[6]) {
      total += (m[5] === '-' ? -1 : 1) * Number(m[6]);
    }
  }
  return { total, rolls, expr: String(expr) };
}

/** True su schermi da telefono (stessa soglia di styles/mobile.css). */
export function isNarrow() {
  try { return typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches; } catch { return false; }
}
