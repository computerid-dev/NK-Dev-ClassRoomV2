# NK-Dev ClassRoom

Web kelas online: guru buat room dengan jadwal + password sendiri, murid gabung
pakai kode dan menunggu disetujui admin. Dibuat vanilla HTML/CSS/JS + Firebase,
siap jadi PWA dan deploy ke Vercel.

## 1. Setup Firebase (wajib sebelum jalan)

1. Buka https://console.firebase.google.com, buat project baru.
2. **Authentication** → Sign-in method → aktifkan **Email/Password**.
3. **Firestore Database** → buat database (mode production).
4. Project Settings → General → "Your apps" → tambah Web App → copy config-nya.
5. Tempel config itu ke `src/scripts/firebase-config.js`, ganti semua nilai
   `GANTI_DENGAN_...`.

### Firestore Security Rules (contoh awal, sesuaikan lagi nanti)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    match /rooms/{roomId} {
      allow read, write: if request.auth != null;
      match /messages/{messageId} {
        allow read, write: if request.auth != null;
      }
    }
  }
}
```

> Catatan: rules di atas masih longgar (siapa saja yang login boleh baca/tulis
> room manapun) supaya cepat jalan dulu. Untuk produksi, sebaiknya validasi
> `passwordKelas`/`keyKedua` dipindah ke Cloud Function biar tidak bisa dibaca
> langsung dari browser, dan rules dibuat lebih ketat sesuai `members`/`admins`.

## 2. Jalankan lokal

Karena pakai ES module (`type="module"`), harus dibuka lewat server lokal,
tidak bisa langsung buka file HTML dari file explorer.

```bash
npx serve .
# atau
python3 -m http.server 5500
```

## 3. Deploy ke Vercel

```bash
npm i -g vercel
vercel
```

Pilih "Other" sebagai framework (static site), root directory tetap folder ini.

## 4. Struktur folder

```
index.html          -> landing + login/daftar
dashboard.html       -> daftar room, buat room, gabung room
room.html            -> chat + panel admin
manifest.json, sw.js -> PWA
src/styles/main.css
src/scripts/
  firebase-config.js -> ISI CONFIG FIREBASE DI SINI
  firebase-init.js
  auth.js
  dashboard.js
  room.js
  utils.js
  constants.js
assets/icons/         -> ikon PWA (dari logo yang dikirim)
```

## Asumsi yang diambil saat build (cek lagi, koreksi kalau salah)

- Guru & murid sama-sama pakai email + password untuk akun (Firebase Auth),
  karena di alur awal cuma murid yang eksplisit sebut field email/password.
- Guru yang di-accept join sebuah room otomatis masuk ke `admins` (sesuai
  aturan "guru yang join jadi admin, bukan admin utama"), murid masuk ke
  `members` biasa.
- Kirim link Google Drive cukup ditempel sebagai teks biasa di chat, belum
  ada tombol/parsing khusus.
- Field `passwordKelas` disimpan di dokumen room dan belum dipakai untuk
  validasi tambahan saat murid join (murid cuma pakai UID + key kedua) —
  sesuai penjelasan kamu, password kelas ini lebih ke lapisan keamanan/
  dipegang guru. Kalau ternyata password kelas juga harus dicek pas join,
  tinggal bilang, gampang ditambahkan.
