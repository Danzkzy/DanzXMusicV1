# DanzXMusic

Pemutar musik web (PWA) bergaya kaca iOS. Bisa dipasang di iPhone/iPad (Safari → Bagikan → Tambah ke Layar Utama)
dan Android (Chrome → Pasang aplikasi), serta lanjut memutar di latar belakang dengan kontrol layar kunci.

- Sumber lagu: katalog gratis [Audius](https://audius.co) + file lagu milik sendiri (disimpan di perangkat, IndexedDB).
- Tanpa build, tanpa dependensi. Deploy: Netlify, publish directory `public`.
- Ini BUKAN Spotify dan tidak memakai katalog/merek Spotify.

## Deploy
1. Upload isi folder ini ke repo GitHub baru (struktur harus tetap: `netlify.toml` di root, sisanya di `public/`).
2. Netlify → Add new site → Import from Git → pilih repo. Build command kosong, publish directory `public`.
