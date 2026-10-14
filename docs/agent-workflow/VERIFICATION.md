# Verification guide

Use the checks in `PROJECT_CONTEXT.md` and the scripts actually defined by `package.json` and `.github/workflows/tests.yml`. Do not import commands or test thresholds from another project.

## Verification layers

1. **Structural:** `npm.cmd run verify:workflow` checks repository handoff files and unresolved context markers. It does not test RETURNO behavior.
2. **Focused:** run the narrowest relevant Node or Playwright test while iterating.
3. **Full automated:** run `npm.cmd test`; for UI, authentication, navigation, or report workflow changes, also run `npm.cmd run test:e2e -- --trace off`.
4. **Repository review:** run `git diff --check`, inspect staged file names and diff, confirm no secrets/data are staged, and verify the intended commit.
5. **Human/operational:** browser tests do not prove physical-device behavior, inbox delivery, legal correctness, native RLS, backup restoration, load capacity, or deployment safety. Verify these directly when relevant.

CI runs Node 24 jobs on Windows and Linux. Local success is not proof that the hosted workflow for a commit has completed. Report the run only after checking GitHub Actions for that commit.

Expected injected error logs from passing rollback/failure tests are not test failures; rely on the final test summary and exit code.
