## Commit Message Format

- Use Conventional Commits for all commits in this project: `<type>: <subject>`.
- Keep the type lowercase and followed by a colon, for example: `feat: add plan file picker`, `fix: handle missing session file`, `refactor: use static pi-tui imports`.
- Choose the type that matches the change intent. Prefer `refactor:` for behavior-preserving code restructuring; do not label refactors as fixes unless they primarily correct a user-visible bug.
- When the reason for a change is non-obvious, include a commit body explaining the context, the problem with the previous approach, and why the new approach is preferred.
