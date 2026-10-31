# GCN Monitor — Matriks Pengujian

Tanggal paket: 28 Oktober 2026. Status di bawah membedakan pemeriksaan yang dapat diulang di lingkungan build dari pengujian manual yang belum dilakukan.

| ID | Modul | Skenario | Hasil yang diharapkan | Hasil aktual | Status | Bukti/catatan |
|---|---|---|---|---|---|---|
| AUTH-01 | Login | Kredensial valid | Sesi dibuat dan dashboard dibuka | Belum diuji end-to-end pada browser | NOT TESTED | Perlu `npm install`, buat akun, jalankan server |
| AUTH-02 | Login | Password salah | HTTP 401, pesan generik | Belum diuji runtime | NOT TESTED | Implementasi ada di `server.js` |
| AUTH-03 | Login | Input kosong | Validasi UI/backend menolak | Validasi ada pada kode, belum diuji browser | NOT TESTED | `login.js`, `server.js` |
| AUTH-04 | Logout | Logout lalu akses halaman | Sesi dihapus, halaman mengarah ke login | Belum diuji runtime | NOT TESTED | `session-ui.js`, `server.js` |
| AUTH-05 | Session | Cookie HttpOnly, SameSite=Lax | Browser tidak dapat membaca cookie melalui JS | Konfigurasi kode tersedia | NOT TESTED | Perlu inspeksi cookie browser |
| AUTH-06 | Rate limit | Percobaan login berulang | Pembatasan 8 kali/15 menit/IP | Konfigurasi kode tersedia | NOT TESTED | In-memory limiter; reset saat restart |
| RBAC-01 | Otorisasi | Role non-admin akses endpoint admin | HTTP 403 | Belum diuji runtime | NOT TESTED | `requireRole()` di `server.js` |
| RBAC-02 | Otorisasi | Tanpa sesi akses API terlindungi | HTTP 401 | Belum diuji runtime | NOT TESTED | `requireAuth()` di `server.js` |
| DATA-01 | Proyek/keuangan | CRUD dan refresh | Data konsisten | UI lama tetap menyimpan ke localStorage | NEEDS CONFIRMATION | Belum dipindahkan ke API/database server |
| DATA-02 | Keuangan | Pembayaran melebihi saldo | Ditolak secara atomik | Belum tersedia pada backend | BLOCKED | Perlu implementasi modul keuangan server |
| CSV-01 | CSV | delimiter, BOM, quote, CRLF | CSV dapat dibaca sesuai regional | Tes sintetis terdahulu lulus | PASS (synthetic) | Excel desktop belum diuji |
| SEC-01 | XSS | Payload teks ditampilkan | Teks di-escape, tidak dieksekusi | Audit lama mencatat escape pada beberapa output | NEEDS CONFIRMATION | Uji semua field di browser |
| SEC-02 | Secret | Cari kredensial dalam source | Tidak ada password demo hardcoded | Tidak ada password default di kode baru | PASS (code inspection) | Buat akun melalui CLI |
| DB-01 | Database | SQLite auth dibuat saat server start | Tabel users/audit_logs tersedia | Kode inisialisasi tersedia | NOT TESTED | Butuh dependency terinstal |
| DB-02 | PostgreSQL | Jalankan skema target | Tabel bisnis + constraint tersedia | Skema proposal ditulis | NOT TESTED | Belum dijalankan pada PostgreSQL |
| UI-01 | Login | Responsif desktop/tablet/mobile | Form terbaca dan dapat dipakai | CSS responsive dibuat; belum browser-tested | NOT TESTED | Perlu screenshot uji ukuran layar |
| PPT-01 | Presentasi | Selaras dengan implementasi | Klaim login/database akurat | PPT lama belum diperbarui pada paket ini | BLOCKED | Perlu finalisasi berdasarkan hasil runtime |

## Tes yang harus dilakukan manual

1. Jalankan `npm install`, lalu `npm run check`.
2. Buat akun admin melalui `npm run create-user`.
3. Jalankan server dan uji login benar/salah, logout, refresh, serta membuka `/` tanpa sesi.
4. Buat akun role staf dan pastikan endpoint `/api/admin/users` mengembalikan 403.
5. Periksa cookie sesi dan respons header pada browser.
6. Uji halaman login di desktop dan mobile.
7. Uji semua alur proyek/biaya/invoice dan CSV pada browser.
8. Jangan mengimpor data perusahaan sebelum migrasi, otorisasi data bisnis, dan backup diuji.
