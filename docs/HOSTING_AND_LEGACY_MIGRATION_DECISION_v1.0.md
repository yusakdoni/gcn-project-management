# GCN MONITOR — Hosting & Legacy Migration Decision Record v1.0

Date: 2026-11-12
Scope: STSI4440 student-only project monitoring and project financial monitoring
Decision: User approved **reviewing and migrating legacy browser data after export and dry-run**, without deleting source. User requested auditing existing hosting first. **No merge or production deployment** without approval.

## Verified existing hosting (read-only)

Connected Vercel team contains:
- `ut-stsi4440-gcn-capstone`: project exists, framework configured as Next.js, `live=false`, no latest deployment, no custom domains.
- `ut-stsi4440-gcn-capstone-v2`: same findings.

Current GCN MONITOR application is Node.js/Express with `better-sqlite3` and a SQLite database at `DATA_DIR/gcn-monitor.sqlite`. The database also holds private receipt BLOBs and sessions. The existing `Dockerfile` and `compose.yaml` target a single long-running container and persistent volume.

**Hosting decision:** Do not deploy the current SQLite architecture to Vercel functions: ephemeral local filesystem is not a durable SQLite/receipt store. Do not replace SQLite, rewrite into Next.js, or provision paid resources without a separate approved architecture/infrastructure decision. Existing Vercel projects are **not** verified as a running GCN MONITOR staging service.

## Migration gate — real user data not yet accessible

Legacy keys: `gcnP` (projects), `gcnC` (expenses), `gcnI` (invoices/payments). The active application no longer uses these keys for business state, but the **Backup Data Lama** page can export them from the same browser/profile where they were originally stored.

Steps before any real import:
1. User opens the GCN MONITOR instance and **same browser profile/origin** that holds old data, then exports **Backup Data Lama** JSON. Browser localStorage is origin-specific: an export from a new URL may be empty.
2. Keep the original browser data and exported JSON intact. Do not commit JSON or real customer/financial data into GitHub.
3. Review project-code mapping and import conflicts. The current importer deliberately **does not create missing projects** or overwrite existing projects/invoices.
4. Run a **read-only** dry-run on a controlled copy of the intended destination database:
   `node scripts/import-legacy.js --file /private/legacy-export.json --source-id browser01 --user-id <ADMIN_ID>`
5. Review counts, missing project codes, invoice conflicts and malformed records with the user. If issues are reported, STOP.
6. Only after explicit confirmation of the dry-run plan, use `--apply --backup-output /private/pre-import.sqlite`. A backup is mandatory; it must be placed on a separate private path.
7. Verify row counts, project assignments, invoice/payment sums, expense status and restore ability. Imported expenses become **DRAFT** and do not reduce the budget. Never delete original browser data as part of import.

## Unverified / blockers

- Real browser export not supplied: actual row counts and whether old data exists are **UNKNOWN**.
- Existing hosting does not provide a verified persistent volume for the current Express + SQLite application.
- No staging HTTPS URL has been verified.
- Real-data migration, hosting provisioning, merge and production deployment **NOT EXECUTED**.

## Next safe actions

- Obtain a user-generated legacy export from the original browser, or confirm that no legacy records exist.
- Check whether the user already has a persistent Node.js host/VPS in addition to Vercel.
- Perform dry-run, review conflicts and request approval before importing actual data.
- Keep PR #2 draft until acceptance, staging persistence and browser UAT are verified.
