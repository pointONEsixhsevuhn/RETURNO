# NVSU RETURNO — Lost & Found System

Version 1.3.0: HTML/CSS/JavaScript frontend, Node.js backend, persistent SQLite database. No npm dependencies or build step.

## Start on Windows / VS Code

1. Install **Node.js 24 or newer**.
2. Extract the ZIP. Open the `retorno` folder in VS Code.
3. Run `npm start` in its terminal.
4. Open **http://localhost:3000** (or the URL printed in the terminal).

On Windows, you can instead double-click **start.cmd**. It starts the server and opens the system in your browser. Keep that terminal running.

**Do not use VS Code Live Server or double-click public/index.html.** Those do not run the account/database backend. The application now detects missing/wrong backend responses and explains how to connect. Run frontend and backend through the same Node server.

## Updating your earlier copy

Stop the running server. Replace the source files with this version, preserving your existing **data/** folder. The ZIP contains no database and does not delete existing accounts or posts. Restart with `npm start`; refresh the browser (Ctrl+F5 if needed).

## What changed

- Removed the Organization screen. Flow: Splash → Student / Admin → Login / Register.
- Made registration and session creation one database transaction, preventing incomplete accounts when session creation fails.
- Added startup backend checks, meaningful fetch/response errors, and the Windows launcher.
- Admin login has no public Register link. An authenticated admin can register another verified admin from the admin dashboard.
- Admin and student portals have separate home destinations and permissions.
- Search checks names, descriptions, locations, dates, report types, statuses, and poster names. Suggestions reappear when the search field is cleared.
- In-app navigation stacks screens so browser Back returns to the previous screen. Use Home and Profile controls to jump directly to either destination.
- Made layouts responsive with readable controls; posts automatically wrap to fill the available screen width.
- Kept active Lost / Found status consistent with the report type.
- Added requirements, workflow, architecture and schema verification in **docs/SYSTEM-DESIGN.md**.

Latest update: student and admin portals are separate. Students can submit and view posts; admins manage them and can register further admins from the portal. Search scans all post fields and restores suggestions when cleared. Browser Back returns to the previous screen; Home and Profile remain direct shortcuts. Replace `server.js`, `public/app.js`, and `public/styles.css`, restart the server, and refresh the browser.

The original fetch failure on your computer was not directly reproduced. Registration passes automated tests through the supplied backend. Connection failures still require the server to be running; the new startup flow detects and explains them.

## Accounts

Use **Log out** in the student or administrator page header to end the current session and return to role selection. If the server cannot be reached, reconnect and retry logout.

If your session expires while searching, posting, or managing records, the app clears private page data and returns to your role's login screen. Log in again before retrying your action; unsaved form content is cleared.

Choose Student → Register to create an account. New students are signed in automatically. Returning users choose the correct role and log in.

Create the first administrator in the project terminal:

```sh
npm run admin
```

Enter the email, full name and password. The password is visible in the terminal prompt. Alternatively use `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD` environment variables. The Admin login has no public registration link. Later, an authenticated admin can choose **Register admin** on the admin dashboard and create another verified admin. Student registration cannot grant admin rights.

To list the administrator accounts in this local database and reset one forgotten password, run `npm run admin:reset`. Choose the displayed admin email and enter a new password. This also signs that admin out of existing sessions.

For an optional demonstration **on a fresh database only**:

```sh
npm run demo
npm start
```

| Role | Email | Password |
| --- | --- | --- |
| Student | student@example.com | RetornoDemo123! |
| Admin | admin@example.com | RetornoDemo123! |

Demo credentials are for local testing only. The command refuses to modify a database that already has users. It provides the pictured sample names and blank item cards. Normal startup does not insert demo records.

## Use

Feed, own posts, search, and administrator lists show loading and empty-result messages. If a list cannot load, use **Retry** or **Retry search** after reconnecting; the current filter or query is preserved. Retries reload lists only and do not automatically resubmit forms.

Report dates and times use **Philippine campus time (PHT, UTC+08:00 / Asia/Manila)**. Enter the time at the campus, even if your device is in another timezone. Forms, post previews, and details use the same convention. The API stores `event_at` as `YYYY-MM-DDTHH:mm` without converting it using the server timezone. Impossible dates are rejected, including invalid leap days. Existing reports retain their original values; audit previously entered dates if needed.

- Logo: feed. Magnifier: search. Profile: Your post for students; management for admins.
- Student + card: submit a new lost/found post, then return directly to the homepage. Cancel exits the form without submitting and returns to the feed. Students have no ellipsis, edit, review, update, or delete controls.
- Every post card has the same height. Long preview details end in an ellipsis; clicking a card opens its complete details.
- Admin ellipsis: review details, edit, update status, or delete. These restrictions are enforced by the backend too.
- Admin list: view details, edit, update status or delete; counts are computed from saved records.
- Registered users: the admin dashboard lists account names, email addresses, and roles.
- Images: PNG, JPEG or WebP, up to 2 MB; optional. Item name, local date/time, location and description are required.
- Leaving the post form replaces its history entry; Browser Back does not reopen a submitted form. Session expiry is seven days; no additional logout button has been added to the supplied UI.

## Project structure

| Path | Purpose |
| --- | --- |
| public/index.html | HTML entry point |
| public/styles.css | Responsive design |
| public/app.js | Screens and interactions |
| public/api.js | API requests and connection handling |
| public/assets/ | Your supplied logo and category artwork |
| server.js | HTTP server, API and authorization |
| db.js / schema.sql | SQLite and password hashing |
| scripts/start.js / start.cmd | Startup |
| scripts/admin.js / demo.js | Account setup / optional demo |
| tests/ | Automated tests |
| docs/SYSTEM-DESIGN.md | Requirements, workflow, architecture and schema audit |

## Data and configuration

Data is created automatically at `data/retorno.sqlite`. Images are stored with posts. Back up the whole `data/` folder while the server is stopped.

Environment variables: `PORT` (default 3000), `HOST` (default 127.0.0.1), `DATA_DIR` (default project data folder), `COOKIE_SECURE=true` when served over HTTPS. Keep the same URL/hostname when using a session. For access from another device, a reachable server address is required; `localhost` on a phone refers to the phone itself.

## Verification

```sh
npm test
```

Automated API/client tests cover account creation, login after registration, failed-session rollback, permissions, saved data, CRUD, search, statuses, images, schema constraints, wrong-server responses and network failures. Tests use a disposable database.

Browser visual/device testing was unavailable. Responsive rules target phones, tablets and desktops; the verification checklist is in SYSTEM-DESIGN.md. Original artwork is retained; fonts use available Century Gothic / Avenir Next / Arial, so exact lettering depends on the device. No additional product features or Organization page were added.
