# GCN Monitor — Capstone MVP dengan Login

Aplikasi demonstrasi monitoring proyek dan keuangan untuk Capstone PT Gega Cahaya Nusantara. Seluruh data proyek/biaya/invoice bawaan adalah **data simulasi**, bukan data aktual perusahaan.

## Status arsitektur

- UI: HTML, CSS, JavaScript, dengan layout responsif untuk desktop, tablet, dan smartphone.
- Login: backend Node.js/Express; password di-hash menggunakan bcrypt; sesi disimpan dalam cookie HttpOnly, SameSite=Lax; halaman dan API memerlukan sesi server.
- Database autentikasi/audit: SQLite lokal (`data/gcn-monitor.sqlite`) dibuat otomatis saat server pertama berjalan.
- Role: `admin`, `project_manager`, `project_staff`, `finance_staff`. Pemeriksaan role server tersedia untuk endpoint admin.
- Data modul proyek/keuangan di UI lama masih disimpan di `localStorage` per browser. Data ini **belum dipindahkan** ke database server, belum tersinkron antar pengguna, dan belum memiliki otorisasi per-record di backend.
- `database/schema-postgresql-proposal.sql` adalah rancangan target PostgreSQL, **bukan database yang sudah diterapkan**. RLS dan aturan transaksi pembayaran belum aktif.

Ini adalah fondasi demo lokal untuk pengembangan dan pembelajaran, bukan deployment produksi.

## Persyaratan

- Node.js 20 atau lebih baru
- npm

## Menjalankan di komputer lokal

1. Ekstrak ZIP, lalu buka folder `gcn-monitor-mvp` di VS Code.
2. Jalankan terminal pada folder tersebut.
3. Instal dependensi: `npm install`
4. Buat akun pertama: `npm run create-user` lalu masukkan email, nama, role `admin`, dan password minimal 12 karakter. Password tidak dicetak atau disimpan dalam plaintext.
5. Jalankan aplikasi: `npm start`
6. Buka `http://localhost:3000/login`.
7. Untuk menghentikan server, tekan `Ctrl+C`.

Akun tidak dibuat otomatis dan tidak ada password demo yang ditanamkan ke source code.

## Konfigurasi lingkungan

Untuk demo lokal, aplikasi dapat berjalan tanpa `.env`; server membuat secret sesi acak saat start. Untuk deployment, gunakan secret yang tetap dan kuat melalui environment variable, misalnya `SESSION_SECRET`, serta `NODE_ENV=production`. Jangan commit `.env` atau database lokal. HTTPS wajib pada deployment production.

Contoh membuat secret secara lokal dengan Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Masukkan hasilnya ke environment variable `SESSION_SECRET` di platform deployment, bukan ke source code.

## Pengujian

- Pemeriksaan sintaks: `npm run check`
- Health check: `GET /health`
- Login: `POST /api/auth/login`
- Sesi aktif: `GET /api/auth/me`
- Logout: `POST /api/auth/logout`
- Daftar akun dan audit log: endpoint admin `GET /api/admin/users` dan `GET /api/admin/audit-logs`.

Login dibatasi 8 percobaan per 15 menit per IP pada proses server ini. Akun tidak aktif ditolak. Pesan login salah tidak membedakan email yang tidak terdaftar dari password yang salah.

## Keterbatasan keamanan yang harus dibereskan sebelum deployment

- `express-session` menggunakan MemoryStore bawaan, hanya layak untuk demo lokal. Ganti dengan session store persisten.
- SQLite adalah database lokal pada satu host. Untuk penggunaan tim, migrasikan autentikasi dan data bisnis ke PostgreSQL terkelola atau server database yang dikelola dengan baik.
- Modul proyek/keuangan UI masih memakai `localStorage`; sesi login tidak membuat data tersebut menjadi data server yang aman. Jangan masukkan data sensitif atau data transaksi nyata.
- Endpoint admin saat ini contoh RBAC untuk metadata pengguna dan audit log. Endpoint bisnis belum dibangun, sehingga role belum membatasi operasi proyek/keuangan.
- Skema PostgreSQL adalah proposal. RLS, transaksi pembayaran, audit trail bisnis, backup/restore, monitoring, reset password dan pemulihan akun belum diimplementasikan.
- Terapkan HTTPS, session store persisten, CSRF protection yang sesuai, kebijakan password/akun, backup terenkripsi, dan uji keamanan independen sebelum production.
- Uji browser lintas perangkat dan kompatibilitas Excel desktop masih perlu dilakukan.

## Struktur file

- `server.js` — server, session, login/logout, pembatasan percobaan, RBAC admin, audit login.
- `login.html`, `login.css`, `login.js` — UI login responsif.
- `index.html`, `styles.css`, `app.js` — UI MVP dengan navigasi mobile dan penanganan interaksi yang kompatibel dengan CSP.
- `session-ui.js` — menampilkan akun aktif dan logout.
- `scripts/create-user.js` — membuat akun dengan hash bcrypt.
- `data/schema-auth.sql` — skema SQLite autentikasi/audit.
- `database/schema-postgresql-proposal.sql` — rancangan target database bisnis.
- `QA_TEST_MATRIX.md` — hasil tes dan daftar tes manual yang tersisa.
