# GCN MONITOR — Capstone STSI4440 Kelompok A

GCN MONITOR adalah aplikasi baru mahasiswa untuk Project Control dan Project Financial Monitoring pada PT Gega Cahaya Nusantara. Sistem ini **bukan** bagian dari ERP produksi GCN. Data contoh adalah simulasi.

## Fitur branch pengembangan

- Login bcrypt + cookie HttpOnly/SameSite dan SQLite-backed session.
- Data proyek, biaya, penugasan PM, notifikasi, lampiran dan audit approval disimpan di SQLite server-side.
- Upload satu bukti pengeluaran per transaksi (PDF, JPG, PNG), maksimum 5 MB, disimpan sebagai BLOB privat SQLite.
- Alur DRAFT -> PENDING_APPROVAL -> APPROVED/REJECTED; APPROVED -> CANCEL_PENDING -> CANCELLED atau APPROVED bila pembatalan ditolak.
- PM yang ditugaskan memeriksa bukti dan mengambil keputusan. Pengaju tidak dapat menyetujui transaksinya sendiri.
- Remaining Budget = Project Budget - biaya berstatus APPROVED atau CANCEL_PENDING.
- Inbox persetujuan, notifikasi, histori keputusan, dan ekspor CSV proyek.

## Role dan izin

| Role | Proyek | Catat Biaya | Approve |
|---|---|---|---|
| admin | Seluruh proyek, mengatur penugasan | Ya | Tidak |
| project_manager | Hanya proyek yang ditugaskan | Tidak | Ya |
| finance_staff | Hanya proyek keanggotaan | Ya | Tidak |
| project_staff | Hanya proyek keanggotaan | Tidak | Tidak |

Admin dapat membuka detail proyek lalu **Tugaskan PM** atau **Tugaskan Staf**. Proyek tanpa PM boleh memiliki draft, tetapi tidak bisa diajukan approval.

## Setup lokal / Codespaces

1. Pastikan Node.js >=20.
2. Instal dependency: npm ci
3. Buat akun admin dan project_manager melalui: npm run create-user
4. Jalankan server: npm start
5. Buka http://localhost:3000/login.
6. Admin login, buka Proyek -> Detail -> Tugaskan PM. Bila finance_staff perlu mencatat biaya, tugaskan dia sebagai anggota proyek.
7. Buka Anggaran & Biaya -> Catat Biaya, masukkan data dan lampiran PDF/JPG/PNG.
8. **Simpan Draft** tidak memengaruhi anggaran; **Ajukan Approval** memerlukan bukti serta PM yang ditugaskan.
9. PM login melalui browser/profil berbeda, buka Persetujuan, periksa bukti, lalu approve/reject.
10. Pengaju dapat mengajukan pembatalan expense APPROVED yang akan kembali membutuhkan PM.

Buat akun dengan password unik dan kuat. Jangan menulis password, secret, atau data asli GCN dalam repository.

## Testing

- npm run check: syntax-check JavaScript terkait.
- npm test: integration test Node, Express, SQLite, file upload, authorization, approval, cancellation, budget, notifikasi, dan persistence setelah restart.
- GitHub Actions: GCN Monitor Capstone QA pada branch ini.

**Automated integration tests lulus 7/7** pada CI branch ini, tetapi UI browser, kompatibilitas smartphone, export CSV desktop, backup/restore dan redeploy hosting belum diuji secara manual. Jangan menyatakan production-ready.

## Batasan data lama

Versi sebelumnya menyimpan proyek, biaya, invoice dan pembayaran di localStorage tiap browser.

- **Data legacy localStorage tidak dihapus otomatis, tetapi belum dimigrasikan.** Ekspor dan tinjau data lama sebelum berpindah lingkungan/versi.
- Pada database server baru, contoh proyek GCN-023 hingga GCN-026 disediakan hanya sebagai simulasi bila belum ada data proyek.
- Biaya simulasi versi lama tidak langsung menjadi APPROVED, karena tidak memiliki bukti atau keputusan PM.
- **Invoice dan pembayaran masih modul demonstrasi localStorage**; belum tersinkron antar-user/device dan tidak aman untuk pencatatan operasional nyata.
- Jangan memasukkan data finansial atau bukti transaksi GCN yang nyata sampai evaluasi keamanan, migrasi, backup dan izin operasional selesai.

## Deployment staging

Jalankan hanya **satu instance Node.js**, dengan volume persisten untuk SQLite dan HTTPS. Variabel konfigurasi:

| Variable | Ketentuan |
|---|---|
| NODE_ENV | production pada staging HTTPS |
| SESSION_SECRET | secret acak minimal 32 karakter, tidak boleh di-commit |
| DATA_DIR | WAJIB ketika production; absolute path persistent volume |
| PORT | default 3000 |
| TRUST_PROXY | 1 hanya jika benar-benar berada di balik 1 reverse proxy HTTPS yang dipercaya |

Akun harus dibuat menggunakan DATA_DIR yang sama dengan server. BLOB lampiran berada dalam database SQLite yang sama, sehingga backup database harus konsisten dengan WAL; gunakan backup API SQLite, dan **uji restore**. Lakukan smoke test 2 akun, restart dan redeploy hosting sebelum mengklaim staging stabil. Belum ada deployment URL yang terverifikasi.

## Security

API mutasi membutuhkan header X-GCN-Request: 1, login terproteksi, akses bukti divalidasi pada backend untuk proyek yang berwenang, dan file divalidasi MIME, signature serta batas ukuran. URL source backend, database dan file privat tidak dilayani oleh static server. Perlindungan ini adalah fondasi MVP; bukan audit keamanan produksi.

## Struktur

- server.js: login, session, security, routing
- expense-api.js: SQLite business schema, receipt, project, approvals, notifications
- app.js / styles.css: UI
- scripts/create-user.js: membuat pengguna
- test/api.test.js: integration testing
- QA_TEST_MATRIX.md: skenario dan status pengujian
- .github/workflows/capstone-qa.yml: CI

**Scope Capstone tetap: Project Control + Project Financial Monitoring.**
