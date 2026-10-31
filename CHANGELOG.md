# Changelog

## 0.1.0 — unreleased

- `parlo ask <claude|codex>`: ask a colleague, read its steps in `/tasks`, get its reply.
- Threads: `--thread`, `parlo threads`, `parlo show`.
- Limits: depth 2, 3 live colleagues, 20 messages per thread, 256 KiB per message, 30-minute deadline.
- `parlo stop`; stopping `parlo ask` stops its colleague.
- `parlo connect` / `disconnect` for Claude Code and Codex; `parlo uninstall` removes everything parlo installed.
- Codex callers: `parlo ask --detach` and `parlo wait`.
