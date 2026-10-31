---
name: parlo
description: Ask another coding agent (Claude Code or Codex) for a second opinion, a review or a piece of work, and get its answer back. Use when the person asks you to consult, ask or work with Codex or Claude, or when a second agent's view would clearly help.
---

# Asking a colleague with parlo

`parlo ask <claude|codex> "<message>"` starts the other agent as your colleague,
gives it your message, and prints its reply. The colleague sees nothing of
your conversation, only the message.

## Run it

**In Claude Code:** run it with the Bash tool **in the background**
(`run_in_background: true`). The person can watch the colleague in `/tasks`.
When you are told it finished, read its output. The first line names the
thread, and the reply is between `----- reply -----` and `----- end -----`.

**In Codex:** run `parlo ask --detach <claude|codex> "<message>"`. It prints a
thread number at once. Then run `parlo wait <thread>` until it exits 0 with the
reply. Exit code 4 means still working: run `parlo wait <thread>` again.

## Continue the conversation

`parlo ask codex --thread 12 "<follow-up>"` continues thread 12 with the same
colleague, which remembers the thread. Only you, the agent that started it,
can continue it.

## What the colleague may do

- no flag: read only. It changes nothing. Use this to ask, review or discuss.
- `--write`: it may change files in this directory.
- `--worktree`: it changes files in its own git worktree, apart from yours.

Use `--write` or `--worktree` only when the colleague has to change files
and the person wants that.

## Write a good message

Put everything the colleague needs into the message: the goal, the files
involved, what you already tried, and what you want back (a verdict, a diff,
a list).

## When parlo refuses (exit code 3)

It prints why: too many colleagues working, a thread that is full, or a
colleague's colleague asking further. Don't get around a limit with a new
thread or another command. Decide yourself or tell the person.

## Exit codes

`0` reply · `1` the colleague failed (the line says why) · `2` usage ·
`3` refused by a limit · `4` still working (`wait`) · `5` stopped

## Other commands

`parlo threads` lists your threads, `parlo show <thread>` prints one, and
`parlo stop --thread <thread>` stops one and everything under it.

## If `parlo` is not found

Then parlo isn't installed here (this skill can outlive it). Tell the person,
and don't look for another way to reach the other agent.
