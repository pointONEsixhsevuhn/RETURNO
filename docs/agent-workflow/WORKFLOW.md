# RETURNO agent workflow

`AGENTS.md` is the canonical project policy. This document describes a practical task loop and must remain consistent with it.

## 1. Orient

Read `PROJECT_CONTEXT.md`, `docs/PROJECT-ROADMAP.md`, and the task-specific requirements. Inspect relevant routes, source, tests, dependencies, styles, migrations, CI, and ownership/security notes. Confirm that commands and tools exist before using them. Preserve user edits and avoid reading secrets such as `.env`.

## 2. Frame

Define one task, the affected user and journey, constraints, acceptance checks, and expected exit/back path. Use current RETURNO product decisions; student claim features remain excluded. Ask a concise question only if the answer changes behavior, data access, permissions, privacy, or irreversible outcomes. Otherwise state a safe assumption and proceed.

## 3. Design and implement

Follow current design tokens and architecture. Cover relevant loading, empty, success, validation, error, disabled, permission-denied, and recovery states. Preserve form input after recoverable errors. Keep the change focused; do not add a framework, dependency, service, skill, hook, or workflow without a verified need.

## 4. Verify

Run the focused check, then the repository-required full suite. Frontend, authentication, and report-workflow changes also require the isolated Playwright suite. Review desktop and narrow-phone layouts, keyboard operation, focus, and the principal interaction where applicable. Record commands and outcomes precisely; a structural verifier is not an application correctness or security test.

## 5. Review and hand off

Run `git diff --check`, inspect the staged diff, and stage only files for this task. Keep independent changes in separate commits and push passing commits to the configured remote as required by `AGENTS.md`. Report behavior, changed paths, tests, known limits, commit and push result, and the recommended next task.
