# Repository agent rules

## Mandatory pre-commit gate

Before every `git commit`, reread this root `AGENTS.md` from disk in the current conversation turn, even if it was read earlier or retained in a conversation summary. Then verify the effective author and committer identity and ensure the planned command changes no global or system Git configuration. Do not commit until this gate is satisfied. This applies to initial commits, subsequent commits, and user-authorized amendments.

## GitHub account

- Use GitHub account `A-TongMY` (numeric user ID `45504842`) for this repository. The exact login is `A-TongMY`, not `ATong-MY`.
- Before a push or another GitHub write, verify the credentials that the operation will use with `gh api user --jq '{login: .login, id: .id}'`. Proceed only when both values match the account above.
- Prefer command-scoped credentials for this account. An unrelated active account is not permission to use it. If the required account is unavailable, stop and ask the user to authenticate; never display or persist tokens in repository files.

## Git configuration boundary

- Global and system Git configuration are off-limits. Never modify them, including through `git config --global`, `git config --system`, direct file edits, or helpers such as `gh auth setup-git` that write global configuration.
- Use command-scoped `git -c` settings for credentials and commit identity where possible. Use `git config --local` only when the user authorizes persistent configuration for this repository.
- For new commits, use author and committer name `A-TongMY` and email `45504842+A-TongMY@users.noreply.github.com`. Verify the resulting identity with `git log -1 --format=fuller`.
- Preserve existing commits and identities; do not amend or rewrite history merely to apply this rule.

## Publishing

- These rules do not authorize commits, pushes, deployments, or force pushes. Follow the user's requested scope and obtain approval when publishing has not been requested.
- After an authorized push, fetch and verify that the intended local branch and remote tracking branch match. Report any divergence or failure explicitly.
