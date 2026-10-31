# Security Policy

## Supported versions

Only the latest released version of parlo receives security fixes.

| Version | Supported |
| --- | --- |
| 0.1.x | yes |

## Reporting a vulnerability

Please **do not** report security problems in public issues, discussions or pull requests.

Report them privately through GitHub: open [a private security advisory](https://github.com/Krowli/parlo/security/advisories/new) ("Report a vulnerability" on the repository's Security tab). Include:

- the parlo version (`parlo --version`), Node.js version and operating system;
- the agent CLIs involved and their versions (`codex --version`, `claude --version`);
- steps to reproduce, and what an attacker could do.

You will get an acknowledgement within a week. Once a fix is ready we publish it with an advisory and credit you, unless you prefer not to be named.

## What parlo can do on your machine

- **It starts Claude Code and Codex as you.** A colleague runs with your own login, settings, plugins and MCP servers, exactly as if you had started it.
- **A colleague changes files only when asked to.** By default it is read-only: Codex runs with `-s read-only`, Claude Code in `plan` mode. `--write` lets it change files in the directory it was started in; `--worktree` lets it change files in its own git worktree.
- **`parlo connect codex` adds one rule to Codex:** `~/.codex/rules/parlo.rules`, which lets Codex run the `parlo` command — and only that command — outside its sandbox. That is needed because the sandbox has no network and cannot write `~/.parlo`. `parlo disconnect codex` or `parlo uninstall` removes it.
- **`~/.parlo/parlo.db` keeps every message in plain text**, protected only by file permissions. `parlo uninstall --purge` deletes it.

## Scope notes

By design, not vulnerabilities:

- Any process running as you can read `~/.parlo/parlo.db` or call `parlo`. parlo is a tool for one person's own agents, not a boundary between users.
- What a colleague does inside its own permissions (a read-only colleague reading any file you can read) is the colleague CLI's behaviour, not parlo's.

In scope, for example: a colleague getting write access when it was asked read-only, parlo passing the caller's credentials or session tokens to a colleague, `parlo uninstall` or `disconnect` removing files it did not install, or the Codex rule matching commands other than `parlo`.
