# Responsive audit — 2026-10-12

Chromium layout checks passed at all seven sizes below. The full isolated unit/API suite passed 101 tests; Playwright passed 53 tests. Three duplicate audit cases were skipped because the audit itself runs its viewport matrix in one project.

| Layout | Viewport |
| --- | --- |
| Narrow phone | 320 × 640 |
| Phone | 393 × 851 |
| Portrait tablet | 768 × 1024 |
| Landscape tablet | 1024 × 768 |
| Laptop | 1280 × 720 |
| Wide desktop | 1536 × 864 |
| Landscape phone | 667 × 375 |

Coverage includes splash, role selection, student/admin login, registration, email confirmation, password recovery/reset, public/signed-in About, connection errors, student home/own posts/search/editor, admin dashboard/profile/search/editor, both compact menus, item details, admin registration, account deletion and report update/deletion dialogs. Verification/reset layout checks render those forms without sending email; the existing workflow tests separately exercise verification and password recovery.

The audit checks horizontal overflow, dialog overflow, editable input text of at least 16px, controls of at least 24px in each dimension, control placement within the viewport, responsive student post-column counts and badge placement near the upper-right corner. It uses long names, descriptions and contacts. Screenshots were visually reviewed for phone login, registration, own posts and admin editing/profile, tablet search/profile and desktop item details. These checks establish layout and basic usability; they do not replace testing with people or physical devices.

Fixed two issues:

- A tall post with long contact text could expand the adjacent Add post tile beyond its phone grid column. The tile now stays within its column and keeps its square shape.
- A long unbroken administrator name could overflow the admin profile identity line. Names and email addresses now wrap.

Run the audit with `npm.cmd run test:e2e -- tests/e2e/responsive.spec.js --project=desktop-chromium`. Screenshots and `layout-audit.json` are generated in ignored `test-results/`. All records are temporary fixture data and are cleaned up.

Next acceptance check: on a physical phone and tablet, try login, registration, search and posting with the on-screen keyboard open; rotate the device; open long post details; verify menu/back controls and scrolling. Also check iPhone Safari and desktop browser zoom. Those checks have not been performed in this audit.
