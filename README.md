# `@milanglacier/pi-plan-mode`

> Structured planning mode for pi — think before you code.

## Fork notice

This repository is a standalone fork of
[`@ifi/pi-plan`](https://github.com/ifiokjr/oh-pi/tree/main/packages/plan),
originally created by [Ifiok Jr.](https://github.com/ifiokjr). The initial
source was imported from
[`ifiokjr/oh-pi@7ef2e7b`](https://github.com/ifiokjr/oh-pi/commit/7ef2e7b073198665fc2492498a085fa3e1eeaced).

## Differences from upstream

- **No planner subagent:** Plan mode is a direct extension of the main
  conversation — it injects a planning prompt and exposes tools on the main
  agent. There is no separate planner agent. If you want orchestrated subagents
  with a dedicated planner, consider
  [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents) instead.
- **Built-in dialogs for `request_user_input`:** The custom TUI wizard was
  replaced with pi's native `ctx.ui` dialogs (`select` and `input`). This means
  the tool works with any pi UI that supports the built-in dialog API — including
  RPC-connected clients — without requiring custom UI adoption.

## Why use this?

Direct implementation works for small tasks, but complex features benefit from planning first:

- **Avoid rework:** Plan the architecture before writing code
- **Capture decisions:** The plan file documents _why_ you made certain choices
- **Resume later:** Planning state persists across sessions

Plan mode turns planning into a first-class pi workflow with its own tools, banners, and file management.

## What planning feels like

```
/plan

┌─ Start Plan Mode ──────────────────────────┐
│                                             │
│  Empty branch    Start a new planning       │
│                  branch from scratch        │
│                                             │
│  Current branch  Continue from where the    │
│                  conversation left off      │
│                                             │
└─────────────────────────────────────────────┘
```

While active, a banner stays visible:

```
┌ PLAN MODE ─ /home/user/projects/app/session-abc.plan.md ─────┐
│ [plan-mode tools are active: request_user_input, set_plan]     │
└───────────────────────────────────────────────────────────────┘
```

Exiting plan mode shows a summary:

```
Plan mode ended.
Plan saved to: /home/user/projects/app/session-abc.plan.md
```

## Installation

```bash
pi install npm:@milanglacier/pi-plan-mode
```

## Commands

| Command             | Action                                              |
| ------------------- | --------------------------------------------------- |
| `/plan`             | Enter plan mode (or show actions if already active) |
| `/plan [file-path]` | Use a specific file as the plan file                |
| `/plan [directory]` | Create a timestamped plan file in that directory    |

## Shortcut

`Alt+P` — toggle plan mode without typing `/plan`.

## Tools available in plan mode

Only while plan mode is active, these tools are exposed:

| Tool                 | Purpose                                                |
| -------------------- | ------------------------------------------------------ |
| `request_user_input` | Ask you clarifying questions with optional choices     |
| `set_plan`           | Overwrite the plan file with the latest full plan text |

When plan mode ends, these tools disappear.

## Customization

The default plan-mode prompt lives at `prompts/PLAN.prompt.md`. Override it globally by creating `~/.pi/agent/PLAN.prompt.md`. If the override file is missing or blank, the bundled prompt is used.

## Plan file management

- Default plan file: replaces the session extension with `.plan.md` in the session directory
- Plan files persist after exiting — resume later with `/plan`
- While active, `/plan <location>` moves the current plan file

## Notes

- Ships raw TypeScript — no build step needed
- Plan mode does not automatically trigger implementation — it's for thinking, not coding
