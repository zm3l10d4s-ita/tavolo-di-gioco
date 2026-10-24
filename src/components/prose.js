// Rendering sicuro (senza innerHTML) dei testi SRD: paragrafi separati da \n\n, elenchi "- ", tabelle markdown,
// **grassetto** e *corsivo*. Converte le distanze in metri se units = 'm'.
//   <${Prose} text=${spell.desc} units=${units} />
import { html } from '../vendor/preact-htm.js';
import { convertDistancesInText } from '../lib/rules.js';

function inline(text) {
  const out = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(html`<b>${m[1]}</b>`);
    else out.push(html`<i>${m[2] || m[3]}</i>`);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function table(lines) {
  const rows = lines.filter((l) => !/^\|?[\s:|-]+\|?$/.test(l.trim()))
    .map((l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
  if (!rows.length) return null;
  const [head, ...body] = rows;
  return html`<table class="prose-table"><thead><tr>${head.map((c) => html`<th>${inline(c)}</th>`)}</tr></thead>
    <tbody>${body.map((r) => html`<tr>${r.map((c) => html`<td>${inline(c)}</td>`)}</tr>`)}</tbody></table>`;
}

export function Prose({ text, units = 'm', className = '' }) {
  if (!text) return null;
  const src = convertDistancesInText(String(text), units);
  const blocks = src.split(/\n{2,}/);
  const nodes = [];
  for (const b of blocks) {
    const lines = b.split('\n').filter((l) => l.trim() !== '');
    if (!lines.length) continue;
    if (lines.every((l) => l.trim().startsWith('|'))) { nodes.push(table(lines)); continue; }
    if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) {
      nodes.push(html`<ul>${lines.map((l) => html`<li>${inline(l.replace(/^\s*[-•*]\s+/, ''))}</li>`)}</ul>`);
      continue;
    }
    if (/^#{1,4}\s/.test(lines[0])) {
      nodes.push(html`<h4>${inline(lines[0].replace(/^#+\s*/, ''))}</h4>`);
      if (lines.length > 1) nodes.push(html`<p>${inline(lines.slice(1).join(' '))}</p>`);
      continue;
    }
    // Paragrafo con eventuali righe di elenco in coda
    const para = [], items = [];
    for (const l of lines) (/^\s*[-•]\s+/.test(l) ? items : para).push(l);
    if (para.length) nodes.push(html`<p>${inline(para.join('\n'))}</p>`);
    if (items.length) nodes.push(html`<ul>${items.map((l) => html`<li>${inline(l.replace(/^\s*[-•]\s+/, ''))}</li>`)}</ul>`);
  }
  return html`<div class="prose ${className}">${nodes}</div>`;
}

/** Testo libero dell'utente (diario, note): mantiene gli a capo. */
export function PlainText({ text, className = '' }) {
  if (!text) return null;
  return html`<div class="plain-text ${className}">${String(text).split(/\n{2,}/).map((p) => html`<p>${p}</p>`)}</div>`;
}
