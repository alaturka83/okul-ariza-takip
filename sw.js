/* ============================================================
   SERVICE WORKER — "Ana ekrana / Masaüstüne ekle" (PWA) için
   Strateji: önce ağ, olmazsa önbellek. Arıza kayıtları BURADA
   önbelleklenmez; sadece uygulama kabuğu (HTML/manifest/simgeler)
   çevrimdışıyken de açılabilir kalsın diye var.

   v4 — ERR_FAILED düzeltmesi:
   • respondWith() artık hiçbir durumda "undefined" döndürmüyor;
     tarayıcı bu yüzden "Bu siteye ulaşılamıyor / ERR_FAILED" basıyordu.
   • Sayfa (navigation) istekleri ayrı ele alınıyor; ağ yoksa her zaman
     index.html'e düşülüyor, o da yoksa gerçek bir Response üretiliyor.
   • Yönlendirmeli (redirected / opaqueredirect) cevaplar önbelleğe
     alınmıyor ve olduğu gibi tarayıcıya bırakılıyor.
   • Kurulumda tek bir simge dosyası inmese bile SW kurulumu çökmüyor.
============================================================ */
const ONBELLEK = 'okul-ariza-takip-kabuk-v4';
const INDEX = new URL('./index.html', self.location.href).href;
const KABUK = [
  INDEX,
  new URL('./manifest.json', self.location.href).href,
  new URL('./icon-192.png', self.location.href).href,
  new URL('./icon-512.png', self.location.href).href,
  new URL('./icon-maskable.png', self.location.href).href
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(ONBELLEK).then(c =>
      // addAll yerine tek tek: bir dosya inmezse tüm kurulum iptal olmasın
      Promise.all(KABUK.map(u => c.add(u).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(adlar => Promise.all(adlar.filter(a => a !== ONBELLEK).map(a => caches.delete(a))))
      .then(() => self.clients.claim())
  );
});

function cevrimdisiSayfa() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Çevrimdışı</title><body style="font-family:sans-serif;padding:24px;text-align:center">' +
    '<h2>Bağlantı yok</h2><p>Arıza Takip açılamadı. İnternet bağlantınızı kontrol edip sayfayı yenileyin.</p>' +
    '<p><a href="./">Yeniden dene</a></p></body>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

self.addEventListener('fetch', e => {
  const istek = e.request;
  if (istek.method !== 'GET') return;
  const url = new URL(istek.url);
  if (url.origin !== self.location.origin) return; // CDN (React/Firebase/Tailwind) istekleri karışmadan geçer

  // ---- Sayfa açılışı (navigation): ağ → önbellekteki index.html → çevrimdışı sayfası
  if (istek.mode === 'navigate') {
    e.respondWith(
      fetch(istek)
        .then(cevap => {
          if (cevap && cevap.ok && !cevap.redirected && cevap.type === 'basic') {
            const kopya = cevap.clone();
            caches.open(ONBELLEK).then(c => c.put(INDEX, kopya)).catch(() => {});
          }
          return cevap; // opaqueredirect dahil, tarayıcı kendisi halleder
        })
        .catch(() => caches.match(INDEX).then(c => c || cevrimdisiSayfa()))
    );
    return;
  }

  // ---- Diğer aynı-kaynak istekler (manifest, simgeler vb.)
  e.respondWith(
    fetch(istek)
      .then(cevap => {
        if (cevap && cevap.ok && !cevap.redirected && cevap.type === 'basic') {
          const kopya = cevap.clone();
          caches.open(ONBELLEK).then(c => c.put(istek, kopya)).catch(() => {});
        }
        return cevap;
      })
      .catch(() => caches.match(istek).then(c => c || new Response('', { status: 504, statusText: 'Offline' })))
  );
});
