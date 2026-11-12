# GCN Monitor — Matriks QA Expense & Approval v1.1

**Branch**: feature/capstone-expense-receipts-approval

## Verified via GitHub Actions CI

| ID | Uji | Status |
|---|---|---|
| API-01 | Penugasan PM dan pembatasan akses proyek | PASS |
| API-02 | Pembuatan draft dan penolakan submit tanpa bukti | PASS |
| API-03 | Penolakan file tidak valid dan >5 MB | PASS |
| API-04 | Upload, download byte lampiran, hak akses dan HTTP 401/403 | PASS |
| API-05 | Notifikasi submit dan budget tetap sebelum approve | PASS |
| API-06 | PM approve, budget berkurang sekali, duplicate approve ditolak | PASS |
| API-07 | Cancellation pending, approve, budget kembali sekali | PASS |
| API-08 | Rejected expense tidak memengaruhi budget | PASS |
| API-09 | Audit event pembatalan | PASS |
| API-10 | Database/source tidak terekspos melalui static server | PASS |
| API-11 | Session, proyek dan lampiran tetap ada setelah restart | PASS |
| API-12 | Dua approval bersamaan hanya menerima satu keputusan | PASS |
| API-13 | PDF/JPG, penggantian dan penghapusan draft, over-budget rejection | PASS |

Skenario di atas dikelompokkan ke dalam 8 subtest dan 1 parent test; CI menampilkan **9/9 PASS**. Ini adalah hasil pengujian runtime API, bukan bukti pengujian visual.

## Manual QA — belum dilakukan

| ID | Uji | Status |
|---|---|---|
| UI-01 | Field upload muncul setelah Jumlah Biaya | PASS (headless Chromium) |
| UI-02 | Preview PNG di headless Chromium | PASS |
| UI-03 | Mengganti/menghapus lampiran saat draft | NOT TESTED |
| UI-04 | Submit dan approval via dua browser context/akun | PASS |
| UI-05 | Cancellation sampai status CANCELLED | PASS; angka API diuji terpisah |
| UI-06 | Regression menu proyek, invoice, laporan dan CSV | NOT TESTED |
| DEP-01 | Hosting HTTPS dan cookie Secure | NOT TESTED |
| DEP-02 | Lampiran tetap ada setelah redeploy di hosting | NOT TESTED |
| DB-01 | SQLite backup/restore termasuk lampiran | NOT TESTED |
| MIG-01 | Migrasi data custom localStorage | NOT IMPLEMENTED |

**Browser evidence:** GitHub Actions run 43159288033, artifact capstone-browser-screenshots (expense-form, expense-pending, expense-approved, expense-cancelled, expense-mobile). Pengujian browser fisik, preview PDF dan JPG, serta UAT lintas perangkat nyata belum dilakukan. Simpan screenshot beserta catatan pengujian manual setelah benar-benar dijalankan. QA Oktober 2026 adalah dokumen historis untuk prototype sebelum fitur approval.
