@AGENTS.md

## Claude Code notes

- The two skills in `.claude/skills/` load automatically. Invoke `talking-head-reel` or `podcast-window-reel` for any editing request.
- Use the built-in browser pane (or Claude in Chrome) to open the storyboard dashboard at `http://127.0.0.1:<port>`.
- Send finished exports to the user with SendUserFile, and keep project facts (ports, take choices, open flags) in memory so later sessions can pick up a reel mid-review.
