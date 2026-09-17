import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// NOT: GitHub Pages'te "https://kullaniciadi.github.io/okul-ariza-takip/" gibi bir
// alt dizinde yayınlayacaksanız base değerini repo adınızla değiştirin.
// Kendi özel alan adınızda (custom domain) veya Firebase Hosting'de yayınlıyorsanız '/' bırakın.
export default defineConfig({
  plugins: [react()],
  base: '/okul-ariza-takip/',
});
