# Access control and SQL safety

Implemented 2026-10-08. The trusted principal comes from a hashed, unexpired database session joined to the current user record. Request role, owner IDs, query filters and browser controls never grant permissions.

## Permission and row policy

| Operation | Student | Administrator |
| --- | --- | --- |
| Shared report feed/search | Read all reports | Read all reports |
| Own report list | Rows with signed-in user ID | Rows with signed-in user ID |
| Create report | Create under signed-in ID | Denied |
| Individual management read/edit/status/delete | Denied, including own reports | Any report |
| Registered users and status totals | Denied | Read |
| Register another administrator | Denied | Allowed |
| Current account/logout | Own account/session | Own account/session |

`access-control.js` defines a deny-by-default permission map and supported protected routes/methods. Unknown roles/actions are rejected. Route permission checks precede individual report lookup, so students cannot probe whether management IDs exist. User/session IDs always come from server authentication.

This SQLite implementation provides **application-enforced row access**, not native database RLS policies. Own-report reads bind the signed-in ID; creation derives ownership from that ID. Management queries and mutations, registered-user reads and totals include SQL predicates checking the current stored administrator role. Mutations reject zero-row authorization outcomes. Public report projections explicitly select approved report fields; users never receive password hashes or session tokens. Shared feed visibility remains intentional.

Body streaming can yield execution. Protected creation/edit/status/admin-registration requests authenticate and authorize again after reading the body, including verifying that session identity has not changed. Revocation or role changes during that interval prevent the write. Local administrator/setup/recovery scripts and migrations are trusted maintenance operations with direct database access, outside web permissions. Anyone with filesystem/database access can bypass application row policies; restrict that access in deployment. Native database RLS would require a separately planned database-engine change.

## SQL injection defenses

All request values use bound parameters in prepared statements. Dynamic search predicates and role scopes consist only of server-owned SQL fragments. Status/type options are validated against fixed values, and user-supplied identifiers or sort expressions are never interpolated into SQL. SQL-like text is allowed as literal report content, rather than being blocked by a keyword filter. `db.exec` is reserved for constant transaction/configuration commands and trusted published migrations.

Source image backups under `public/assets/originals/` are explicitly denied by static serving, in addition to being excluded from Git. SQLite files and retired records are outside the public asset root and have no HTTP query endpoint.

## Verification

Isolated regression tests cover invalid principals/permissions, student denial for owned/other/missing management rows, forged owner/role/status fields, own-list isolation, intentional shared reads, literal SQL payload insertion/search, login/identifier/status injection attempts, database integrity, streamed role changes and session revocation. Existing authentication, rollback, schema and browser tests also run. These checks provide targeted evidence, not a complete security audit or a guarantee against all attacks.

Design references: [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [OWASP SQL injection prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html), and [SQLite's omitted SQL features](https://www.sqlite.org/omitted.html).

Account deletion: `DELETE /api/users/:id` requires `users.delete` (admin only), rechecks the session after reading the confirmation body, and uses the stored-admin SQL scope. `confirmEmail` must match the target. Self-deletion is denied. Foreign-key cascades atomically remove target reports/sessions; this destructive behavior was explicitly requested by the user.
