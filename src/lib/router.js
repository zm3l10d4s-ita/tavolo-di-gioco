// Routing con hash: #/<sezione>/<parametri...>
export function navigate(section, ...params) {
  location.hash = '#/' + [section, ...params].map(encodeURIComponent).join('/');
}
export function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { section: parts[0], params: parts.slice(1) };
}
