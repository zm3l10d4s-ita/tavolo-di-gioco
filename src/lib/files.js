// File da/verso il dispositivo, solo con API del browser (funziona anche in Electron).
// - downloadText: salva un file (Android: cartella Download; Electron: finestra "Salva con nome")
// - shareText: apre il menu di condivisione di Android (Quick Share, Drive, WhatsApp…) se disponibile
// - pickText: apre il selettore di file e ritorna { name, text } (o null se annullato)

export function downloadText(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
  return { ok: true, path: filename };
}

export function canShareFiles() {
  try {
    if (typeof navigator === 'undefined' || !navigator.canShare || !navigator.share) return false;
    return navigator.canShare({ files: [new File(['{}'], 'test.json', { type: 'application/json' })] });
  } catch { return false; }
}

export async function shareText(filename, text, title = 'Tavolo di Gioco') {
  // Alcuni Android riconoscono meglio text/plain o application/octet-stream per i .json
  const file = new File([text], filename, { type: 'application/json' });
  try {
    await navigator.share({ files: [file], title, text: 'Dati di Tavolo di Gioco da importare su un altro dispositivo' });
    return { ok: true };
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: false, canceled: true };
    return { ok: false, error: String(err?.message || err) };
  }
}

/** Selettore file. Va chiamato direttamente dal gestore di un clic (gesto dell'utente). */
export function pickText(accept = '.json,application/json,text/plain') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept; input.style.display = 'none';
    let done = false;
    const finish = (v) => { if (!done) { done = true; input.remove(); resolve(v); } };
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (!f) return finish(null);
      try { finish({ name: f.name, text: await f.text() }); } catch { finish(null); }
    });
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

export function stampForFile(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
