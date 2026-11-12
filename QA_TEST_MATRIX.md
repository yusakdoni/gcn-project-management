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

Catatan: daftar API-01 hingga API-13 adalah kumpulan skenario, bukan jumlah subtest Node. Pada commit `1aea95d`, GitHub Actions run 43162856733 membuktikan **12/12 test PASS** (11 subtest + 1 parent).

## Manual QA — belum dilakukan

| ID | Uji | Status |
|---|---|---|
| UI-01 | Field upload muncul setelah Jumlah Biaya | PASS (headless Chromium) |
| UI-02 | Preview PNG di headless Chromium | PASS |
| UI-03 | Mengganti/menghapus lampiran saat draft | NOT TESTED |
| UI-04 | Submit dan approval via dua browser context/akun | PASS |
| UI-05 | Cancellation sampai status CANCELLED | PASS; angka API diuji terpisah |
| UI-06 | Regression proyek dan invoice/payment di browser otomatis | PASS untuk fitur tersebut; CSV/laporan lengkap NOT TESTED |
| DEP-01 | Hosting HTTPS dan cookie Secure | NOT TESTED |
| DEP-02 | Lampiran tetap ada setelah redeploy di hosting | NOT TESTED |
| DB-01 | SQLite backup/restore termasuk lampiran pada DB simulasi | PASS (CI) |
| MIG-01 | Dry-run, migrasi simulasi dan idempotensi | PASS (CI), data aktual NOT MIGRATED |

**Browser evidence:** GitHub Actions run 43159288033, artifact capstone-browser-screenshots (expense-form, expense-pending, expense-approved, expense-cancelled, expense-mobile). Pengujian browser fisik, preview PDF dan JPG, serta UAT lintas perangkat nyata belum dilakukan. Simpan screenshot beserta catatan pengujian manual setelah benar-benar dijalankan. QA Oktober 2026 adalah dokumen historis untuk prototype sebelum fitur approval.

## Verifikasi terbaru

- API + backup/restore + legacy dry-run/import simulasi: https://github.com/yusakdoni/gcn-project-management/actions/runs/43162856733
- Browser QA (invoice, pengeluaran, approval, proyek, mobile, logout): https://github.com/yusakdoni/gcn-project-management/actions/runs/43162850993
- Staging HTTPS dan data historis pemilik belum dapat diverifikasi dari GitHub. Jangan menganggap PASS simulasi sebagai izin migrasi data aktual.
