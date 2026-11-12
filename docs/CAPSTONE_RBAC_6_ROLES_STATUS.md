# GCN MONITOR — 6-role RBAC implementation notes (2026-11-12)

Status: IMPLEMENTED IN FEATURE BRANCH; NOT DEPLOYED; NOT TESTED. Academic student-lite system only.

## Roles
- super_admin: manage accounts/roles/status; view projects; project administration; does NOT approve expenses.
- management: read-only view of all projects, expenses, invoices and financial reports; no mutation permissions.
- admin: project administration, expense submission, invoice and payment entry; cannot create or elevate users.
- project_manager: assigned projects, progress update, independent expense approval.
- project_staff: assigned-project read access.
- finance_staff: assigned-project read access, expense submission, invoice and payment entry.

## Security
- User role CHECK migration performed at server startup using a transactional table rebuild; run DB backup BEFORE deploying.
- Only super_admin can create users or change role/status via POST/PATCH /api/admin/users.
- The last active super_admin cannot be deactivated/demoted; self-demotion blocked.
- Authorization is server-side; UI visibility is not sufficient.
- Approval remains restricted to assigned project_manager; submitter cannot self-approve.
- Existing /api/admin/audit-logs is super_admin-only.
- Existing /api/admin/users list remains readable by admin for staff assignment but filters super_admin accounts.

## Known limitations / must verify
1. **No tests have been executed for this branch.** Run npm run check and npm test in a Node >=20 environment.
2. Execute backup and verify restore before attempting the SQLite migration on a copy of production data.
3. Test fresh DB and legacy DB migration, including foreign key integrity and existing user logins.
4. Test each role against all GET and mutation routes (403 for forbidden actions).
5. Test management dashboard and invoice/expense read-only behavior.
6. Test Admin -> receipt upload -> submit -> assigned PM approve/reject; actual failure reported by user remains UNRESOLVED until reproduced.
7. Verify frontend in browser, especially mobile Android receipt upload.
8. Do not deploy or claim passing tests until evidence is captured.

## Operational notes
- Existing users are NOT automatically promoted. Create a separate super_admin account with `npm run create-user` only AFTER running the server once so the legacy schema is migrated.
- Never put passwords or secrets into issue trackers, documents or chat.
- Branch: `feature/capstone-six-role-rbac`.
- Production ERP is out of scope.
