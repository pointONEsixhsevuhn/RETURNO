# Skill and adapter policy

Skills are optional, task-specific instruction packages. This project does not vendor any skill package or platform adapter.

- Use only skills actually available in the active agent environment and relevant to the user's work. Confirm their current instructions before use.
- Do not install a skill for a one-off task unless its value justifies a maintained dependency.
- Before adding a repository-local skill, confirm the platform supports that location and format. Preserve the complete upstream package, attribution/license, version or commit, source, owner, and refresh date.
- Keep `AGENTS.md` canonical. A skill may add a narrow procedure but must not duplicate or contradict product policy.
- RETURNO uses SQLite and application-enforced row scopes. Supabase-specific skills, Postgres RLS policy, and other stack-specific guidance do not apply unless the architecture is explicitly changed.
- Platform adapters, CI templates, hooks, manifests, and external agent-tool proposals are not installed merely because a handoff package includes examples.
