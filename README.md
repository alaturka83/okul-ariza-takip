# Okul Arıza & Bakım Takip Sistemi

Firebase (Firestore, gerçek zamanlı veritabanı) + GitHub Pages (barındırma) + ntfy
(anlık bildirim) ile çalışan okul içi arıza bildirim ve takip uygulaması.

Kurulum adımlarının tam anlatımı için Claude ile yaptığınız sohbete bakın; bu dosya
sadece hızlı bir referans içindir.

## Yerel geliştirme

```bash
npm install
cp .env.example .env   # sonra .env içine Firebase bilgilerinizi yazın
npm run dev
```

## Derleme

```bash
npm run build
```

## Dosya yapısı

- `src/App.jsx` — tüm uygulama mantığı
- `firestore.rules` — Firebase Console'a yapıştırılacak güvenlik kuralları
- `.github/workflows/deploy.yml` — GitHub Pages'e otomatik yayın
- `.env.example` — Firebase yapılandırma şablonu
