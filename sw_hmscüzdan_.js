// HMS Cüzdan service worker — bu dosyanın değişmesi gerekmiyor, güncellemeler index.html ile gelir.
const C = 'hms-cuzdan', FONTS = 'hms-fonts';
const F = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(F.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // sadece kendi eski önbelleklerini siler; aynı sitedeki diğer uygulamalara dokunmaz
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('hms-') && k !== C && k !== FONTS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(c => c.match(req).then(r => r || fetch(req).then(res => { c.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== location.origin || url.searchParams.has('check')) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;
  e.respondWith(caches.open(C).then(c =>
    c.match(req.mode === 'navigate' ? './index.html' : req, { ignoreSearch: true }).then(r => r || fetch(req).then(res => {
      if (res.ok && F.some(f => new URL(f, scope).pathname === url.pathname)) c.put(req, res.clone());
      return res;
    }).catch(() => req.mode === 'navigate' ? c.match('./index.html') : Response.error()))
  ));
});

/* ---- arka planda hatırlatma (Android Chrome, ana ekrana yüklüyse) ---- */
function idb() { return new Promise((res, rej) => { const r = indexedDB.open('hms', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function kv(k, v) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('kv', v === undefined ? 'readonly' : 'readwrite'), st = tx.objectStore('kv'); const r = v === undefined ? st.get(k) : st.put(v, k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
const pad = n => String(n).padStart(2, '0');
const ds = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const pd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const diff = (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
const dim = (y, m) => new Date(y, m + 1, 0).getDate();
function step(dt, cyc, anchor) {
  if (cyc === 'week') return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 7);
  const tm = dt.getFullYear() * 12 + dt.getMonth() + (cyc === 'month' ? 1 : 12), y = Math.floor(tm / 12), m = tm - y * 12;
  return new Date(y, m, Math.min(anchor || dt.getDate(), dim(y, m)));
}
const CUR = { TRY: '₺', USD: '$', EUR: '€' };
const money = (a, c) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(a) + ' ' + (CUR[c] || '₺');
const when = n => n === 0 ? 'bugün' : n === 1 ? 'yarın' : n + ' gün sonra';

async function remind() {
  const d = await kv('data'); if (!d || !Array.isArray(d.subs)) return;
  const t = new Date(), td = new Date(t.getFullYear(), t.getMonth(), t.getDate()), key = ds(td);
  const nt = (await kv('notified')) || {}; let ch = false;
  for (const s of d.subs) {
    if (s.paused || !s.next) continue;
    let n = pd(s.next), g = 0; while (diff(n, td) > 0 && g++ < 800) n = step(n, s.cycle, s.day);
    const left = diff(td, n); let msg = '';
    if (s.remind >= 0 && left <= s.remind) msg = `${s.name} ${when(left)} yenileniyor · ${money(s.amount, s.cur)}`;
    if (s.cancelAt) { const c = diff(td, pd(s.cancelAt)); if (c <= 0 && c > -3) msg = `${s.name}: iptal etmeyi unutma!`; }
    if (msg && nt[s.id] !== key) {
      nt[s.id] = key; ch = true;
      await self.registration.showNotification('HMS Cüzdan', { body: msg, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'hms-' + s.id });
    }
  }
  if (ch) await kv('notified', nt);
}
self.addEventListener('periodicsync', e => { if (e.tag === 'hms-remind') e.waitUntil(remind().catch(() => {})); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => cs.length ? cs[0].focus() : clients.openWindow('./')));
});
