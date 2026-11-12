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

**Automated integration tests lulus 12/12** pada commit `1aea95d` melalui GitHub Actions run 43162856733, termasuk invoice dan pembayaran server-side, backup/restore, dan dry-run/migrasi data simulasi. Browser QA headless Chromium juga **PASS** (run 43162850993), mencakup upload bukti, approval, cancellation, invoice/payment, ekspor backup legacy, progres proyek, tampilan mobile, dan logout. Uji perangkat fisik, hosting HTTPS, dan backup/restore data aktual belum dilakukan. Jangan menyatakan production-ready.

## Batasan data lama

Versi sebelumnya menyimpan proyek, biaya, invoice dan pembayaran di localStorage tiap browser.

- **Data legacy localStorage tidak dihapus otomatis dan belum dimigrasikan pada data aktual.** Ekspor lewat menu Backup Data Lama, lakukan review dan dry-run menggunakan `scripts/import-legacy.js`, lalu minta approval sebelum menerapkan migrasi.
- Pada database server baru, contoh proyek GCN-023 hingga GCN-026 disediakan hanya sebagai simulasi bila belum ada data proyek.
- Biaya simulasi versi lama tidak langsung menjadi APPROVED, karena tidak memiliki bukti atau keputusan PM.
- **Invoice dan pembayaran sekarang tersimpan di SQLite server-side**, tetapi data contoh tetap simulasi dan belum boleh digunakan sebagai catatan keuangan operasional perusahaan.
- Jangan memasukkan data finansial atau bukti transaksi GCN yang nyata sampai evaluasi keamanan, migrasi, backup dan izin operasional selesai.

## Migrasi data browser (tidak dijalankan otomatis)

1. Pada browser dengan data historis, login sebagai admin lalu buka **Backup Data Lama** dan unduh file JSON. Jangan menghapus browser storage.
2. Periksa isi JSON untuk data personal atau komersial sebelum dipindahkan. Jangan commit arsip JSON ke GitHub.
3. Buat akun admin di database tujuan dan pastikan seluruh kode proyek historis memiliki padanan di database; importer sengaja **memblokir proyek baru/tidak cocok**.
4. Jalankan dry-run **read-only**: `node scripts/import-legacy.js --file /lokasi/backup-browser.json --source-id browser01 --user-id <ID_ADMIN>`.
5. Jika dry-run tidak ada error dan pemilik data menyetujui, lakukan migrasi dengan flag `--apply` serta `--backup-output` yang menunjuk file backup baru pada lokasi privat **di luar database sumber**.
6. Biaya historis masuk sebagai **DRAFT**, tidak otomatis mengurangi anggaran; invoice/pembayaran yang valid dimigrasikan tanpa menduplikasi nomor invoice.
7. Setelah migrasi, verifikasi jumlah data, riwayat dan backup. Simpan arsip browser asli sampai seluruh proses diterima.

**Belum ada migrasi data aktual atau akses ke localStorage Codespaces/browser pemilik.**

## Database schema dan persistensi

- SQLite di `DATA_DIR/gcn-monitor.sqlite`, satu instance server, WAL dan foreign key aktif.
- Tabel: `users`, `sessions`, `audit_logs`, `projects`, `project_members`, `expenses`, `expense_receipts`, `expense_events`, `notifications`, `invoices`, `invoice_payments`; `legacy_import_entries` dibuat ketika proses migrasi dijalankan.
- Schema diinisialisasi dengan `CREATE TABLE IF NOT EXISTS` pada startup. Untuk perubahan schema berikutnya, rencanakan versioned migration sebelum implementasi.
- Backup online dengan `npm run backup -- --output /path/backup.sqlite`; verifikasi restore dengan `npm run verify-restore -- --file /path/backup.sqlite`.
- File kuitansi berupa BLOB privat SQLite; backup online turut menyertakan lampiran.

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

## Deployment container

Tersedia Dockerfile dan compose.yaml untuk staging satu instance dengan named volume persisten. Docker Compose perlu SESSION_SECRET yang dibuat di luar source code. Port host dibatasi 127.0.0.1:3000 dan memerlukan reverse proxy HTTPS sebelum akses dari luar. Perintah dasar: docker compose build, docker compose up -d, lalu docker compose run --rm gcn-monitor npm run create-user dengan volume yang sama. CI juga memeriksa build Docker dan persistensi volume setelah container recreation.

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
