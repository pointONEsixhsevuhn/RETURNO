# RETURNO project workflow

The user requests continued guidance and a separate Git commit and GitHub push for every completed feature or independently useful fix.

- Review `docs/PROJECT-ROADMAP.md` before starting project work. Keep its status and test evidence current.
- Work on one agreed feature at a time. Define its behavior and acceptance checks before implementing it.
- Preserve student/admin separation. Students currently create and view posts; admins manage posts and register additional admins. Do not broaden permissions without an explicit product decision.
- The user reversed student claims on 2026-10-08: exclude My claims, student proof submission and student claim APIs. Administrators manage all claim/return processing. Do not reintroduce student claims from older roadmap entries.
- Test each change appropriately. Run the full `npm.cmd test` suite on Windows before committing code changes. Use `npm test` on other platforms.
- For frontend, authentication or report workflow changes, also run `npm.cmd run test:e2e` (Windows) or `npm run test:e2e` after installing test dependencies and Chromium. Browser tests must keep their isolated database/server fixtures.
- Run `git diff --check` and review the staged diff. Stage only files belonging to the current feature; preserve unrelated user edits.
- Give each feature or independently useful fix its own descriptive commit (for example `feat: add logout controls` or `fix: reject impossible event dates`). Avoid combining unrelated features.
- Push completed, passing commits to the configured GitHub remote. Never force-push or rewrite published history without explicit authorization.
- Report implemented behavior, test results, commit hash, push result, and the recommended next task. Do not claim browser, device, deployment, or GitHub Actions checks passed unless actually verified.
- If authentication, network, or permissions prevent a push, keep the local commit, report the blocker, and retry when access is restored.
- Keep passwords, tokens, local databases, and personal records out of Git. Test with isolated temporary databases rather than existing user data.
- Keep posted status badges at the upper-right corner of post cards on all screen sizes, including home, own posts and search results.
- Recommendations are a roadmap, not authorization to implement every future phase at once. Continue with the task the user chooses.

Repository: https://github.com/pointONEsixhsevuhn/RETURNO
