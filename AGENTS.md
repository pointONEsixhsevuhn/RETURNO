# RETURNO project workflow

The user requests continued guidance and a separate Git commit and GitHub push for every completed feature or independently useful fix.

- Review `docs/PROJECT-ROADMAP.md` before starting project work. Keep its status and test evidence current.
- Work on one agreed feature at a time. Define its behavior and acceptance checks before implementing it.
- Preserve student/admin separation. Students currently create and view posts; admins manage posts and register additional admins. Do not broaden permissions without an explicit product decision.
- Test each change appropriately. Run the full `npm.cmd test` suite on Windows before committing code changes. Use `npm test` on other platforms.
- Run `git diff --check` and review the staged diff. Stage only files belonging to the current feature; preserve unrelated user edits.
- Give each feature or independently useful fix its own descriptive commit (for example `feat: add logout controls` or `fix: reject impossible event dates`). Avoid combining unrelated features.
- Push completed, passing commits to the configured GitHub remote. Never force-push or rewrite published history without explicit authorization.
- Report implemented behavior, test results, commit hash, push result, and the recommended next task. Do not claim browser, device, deployment, or GitHub Actions checks passed unless actually verified.
- If authentication, network, or permissions prevent a push, keep the local commit, report the blocker, and retry when access is restored.
- Keep passwords, tokens, local databases, and personal records out of Git. Test with isolated temporary databases rather than existing user data.
- Recommendations are a roadmap, not authorization to implement every future phase at once. Continue with the task the user chooses.

Repository: https://github.com/pointONEsixhsevuhn/RETURNO
