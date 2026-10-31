# parlo

[![CI](https://github.com/Krowli/parlo/actions/workflows/ci.yml/badge.svg)](https://github.com/Krowli/parlo/actions/workflows/ci.yml)
[![License: PolyForm Noncommercial](https://img.shields.io/badge/license-PolyForm%20Noncommercial-orange.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24.11-brightgreen.svg)](#requirements)

**Your coding agents ask each other for help.**

Claude Code asks Codex for a second opinion. Codex asks Claude Code to review its change. You watch the colleague work, and the asking agent gets the reply back and carries on. No app, no server: a command and a skill.

## Quick start

```bash
npm install -g parlo
parlo connect claude      # installs the skill into Claude Code
parlo connect codex       # installs the skill into Codex
```

Then start a new session and tell Claude: *"ask Codex to review this function."*

## What happens

1. Claude runs `parlo ask codex "…"` in the background.
2. parlo starts Codex without its interface (`codex exec`), read-only, and gives it the message.
3. Each step Codex takes is printed as one short line. In Claude Code you read them in `/tasks`.
4. When Codex is done, parlo prints its reply last, between `----- reply -----` and `----- end -----`, and Claude Code wakes Claude up with it.
5. A follow-up, `parlo ask codex --thread 1 "…"`, continues the same Codex session, so Codex remembers the conversation.

<!-- screenshot: /tasks showing a Codex colleague -->

```text
parlo: thread 1 — asking codex (read only)
codex: I'll inspect the project entry point and summarize it in one sentence.
codex: $ sed -n '1,260p' app.py
codex: `app.py` defines a greeting function and prints "hi parlo".
parlo: codex answered on thread 1.
----- reply -----
`app.py` defines a greeting function and prints "hi parlo".
----- end -----
Continue with: parlo ask codex --thread 1 "<message>"
```

## Commands

| Command | What it does |
| --- | --- |
| `parlo ask <claude\|codex> "<message>"` | Start a colleague, give it the message, print its reply. |
| `parlo ask <claude\|codex> - <<'PARLO'` | The same, with the message on stdin: nothing in it is expanded, and it may start with `-`. The skill uses this form. |
| `parlo ask … --thread <id>` | Continue a thread you started; the colleague remembers it. |
| `parlo ask … --write` | Let the colleague change files in this directory. |
| `parlo ask … --worktree` | Let the colleague change files in its own git worktree (Codex: `~/.parlo/worktrees/<thread>`; Claude Code: its own `-w`). |
| `parlo ask --detach …` | Start the colleague and return at once (for Codex as the caller). |
| `parlo wait <thread>` | Wait up to 25 s for the reply; exit `4` means still working. |
| `parlo threads` | List the threads in this agent tree. |
| `parlo show <thread>` | Print a whole thread. |
| `parlo stop --thread <id>` / `--all` | Stop a thread and every colleague under it, or everything. |
| `parlo connect <claude\|codex>` | Install the skill (and, for Codex, its rule). Shows the changes and asks first. |
| `parlo disconnect <claude\|codex>` | Remove what `connect` installed. |
| `parlo uninstall [--purge]` | Stop every colleague and remove everything parlo installed. |

## Limits and safety

parlo enforces these limits itself. The agents can't talk their way past them.

| Limit | Value |
| --- | --- |
| Colleague of a colleague | 2 levels deep, no further |
| Colleagues working at once, per caller | 3 |
| Messages in one thread | 20 |
| One message | 256 KiB |
| Waiting for a reply | 30 minutes, then the colleague is stopped |

- **Read-only by default.** Codex runs with `-s read-only`, Claude Code in `plan` mode. Changing files needs `--write` or `--worktree`.
- **No loops.** A colleague can only answer the agent that called it. It can't start a conversation with its caller, or with anyone above it.
- **Access never widens down the tree.** A colleague asked read-only can only start read-only colleagues.
- **Stopping is total.** Stopping `parlo ask` (from `/tasks`, Ctrl+C, or closing Claude Code) stops its colleague and every command that colleague started.
- When a limit is hit, parlo refuses with one line the agent can act on, and exits `3`.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | the colleague replied |
| `1` | the colleague failed (the line says why) |
| `2` | usage error |
| `3` | refused by a limit |
| `4` | still working (`parlo wait`) |
| `5` | stopped |

## Codex notes

Codex runs every command an agent gives it inside a sandbox, and that sandbox has no network and can't write outside the project. A sandboxed `parlo` could neither record the thread in `~/.parlo` nor let the colleague it starts reach its API. So `parlo connect codex` writes one rule, `~/.codex/rules/parlo.rules`:

```python
prefix_rule(pattern = ["parlo"], decision = "allow")
```

Codex then runs `parlo`, and only `parlo`, outside the sandbox without asking. `parlo disconnect codex` removes the rule.

Know what that allows: a Codex session you started read-only can still ask a colleague with `--write`, and that colleague changes files. parlo stops this for colleagues it started itself (a read-only colleague can only start read-only ones), but it can't see how you started your own Codex. Leave Codex unconnected if that matters to you.

For `--worktree`, parlo makes the worktree itself, in `~/.parlo/worktrees/<thread>`, and runs Codex in it on every turn. A resumed Codex session works in the directory it is started from, so its own `--worktree` would not survive a follow-up. When you no longer need those worktrees, `git worktree prune` in your repository forgets the ones whose folders are gone.

A Codex shell command times out long before a colleague is done, so Codex uses `parlo ask --detach` and then `parlo wait <thread>` until the reply arrives. A detached colleague's steps go to `~/.parlo/logs/<thread>.log`.

The rule matches only a command that starts with `parlo`. So in Codex the skill gives the message as one argument (`parlo ask --detach claude -- '…'`) instead of a heredoc or a pipe: those would stay in the sandbox, where a heredoc can't even be created.

## Requirements

- macOS or Linux.
- Node `^22.19.0 || >=24.11.0`.
- Claude Code and/or Codex, installed and logged in.
- Tested with codex-cli 0.166.0 and Claude Code 2.1.316.

## Troubleshooting

- **`codex is not installed or not on PATH`** (or `claude`): install that CLI, or make sure the shell that runs parlo finds it.
- **An agent says `command not found: parlo`**: npm put `parlo` in `$(npm prefix -g)/bin`, and the agent's shell doesn't have that folder on its PATH. Agents run commands in a login shell, so add it in `~/.zprofile` (zsh) or `~/.bash_profile` (bash): `export PATH="$(npm prefix -g)/bin:$PATH"`, using the folder `npm prefix -g` prints. Check with `zsh -lc 'command -v parlo'`.
- **A colleague fails right away with a login message**: run `codex` or `claude` once yourself and log in.
- **`npm install -g parlo` fails on better-sqlite3**: that's the native SQLite module parlo stores threads with. It comes prebuilt for macOS and Linux on x64 and arm64; if the install still tries to compile it, switch to a supported Node version (see [Requirements](#requirements)) and install again.
- **What is a detached colleague doing?** `tail -f ~/.parlo/logs/<thread>.log`.

## Uninstall

`npm uninstall -g parlo` on its own leaves the skills, the Codex rule and `~/.parlo` behind: npm runs no clean-up. Run this first, while parlo is still installed:

```bash
parlo uninstall            # stops every colleague, removes the skills and the Codex rule; asks first
parlo uninstall --purge    # the same, and also deletes ~/.parlo after a yes in a terminal
npm uninstall -g parlo
```

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free for noncommercial use (personal, research, educational, and more; read the [license](LICENSE) for the exact terms). Commercial use — selling it, or building it into a paid product or service — needs a separate license: write to lionmause999@gmail.com.
