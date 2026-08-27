# Review and resolution

## Initial review

## Findings

### [P1] Raise the minimum Pi peer version

**Location:** `/home/milanglacier/Desktop/personal-projects/pi-plan-mode/config.ts:1`

`package.json` still permits `@earendil-works/pi-coding-agent >=0.78.1`, but version 0.78.1 does not export `CONFIG_DIR_NAME` from its package root. Installing with that supported version therefore fails to load the extension with a missing named-export error. Raise the minimum peer version to the first compatible release or avoid this export.

### [P2] Ignore project keybindings until the project is trusted

**Location:** `/home/milanglacier/Desktop/personal-projects/pi-plan-mode/index.ts:197-200`

A globally installed extension reads `.pi/pi-plan-mode.jsonc` even when the current repository is untrusted, allowing that repository to disable the user's global shortcut or bind plan mode to ordinary input such as `p`. Pi explicitly requires checking `ctx.isProjectTrusted()` before honoring project-local extension configuration (`/home/milanglacier/.local/share/pi/docs/extensions.md:976-980`); load only the global configuration when this check is false.

### [P2] Reject unknown keybinding modifiers

**Location:** `/home/milanglacier/Desktop/personal-projects/pi-plan-mode/config.ts:164-170`

Validation accepts every non-empty string before casting it to `KeyId`, while Pi's parser ignores unknown modifier tokens. Consequently, a typo such as `crtl+p` is interpreted as bare `p`, causing normal typing to invoke plan mode and consume the character. Validate the complete shortcut against the supported modifiers and keys documented in `/home/milanglacier/.local/share/pi/docs/keybindings.md:11-21`, warning and falling back when invalid.

### [P2] Isolate the default-shortcut test from user configuration

**Location:** `/home/milanglacier/Desktop/personal-projects/pi-plan-mode/tests/index.test.ts:29-35`

This test uses the real agent directory and repository working directory, so it fails whenever the developer has configured the newly advertised global or project-local shortcut. Point both configuration locations at temporary empty directories so the default behavior is tested independently of the user's environment.

## Overall assessment

**Verdict:** Patch is incorrect.

**Explanation:** The feature works with current dependencies and a clean environment, but it breaks supported older Pi versions and improperly honors untrusted or malformed configuration. The new default test is also non-hermetic.

## Fix summaries

1. **Peer compatibility:** Raised the minimum `@earendil-works/pi-coding-agent` peer version to `0.79.7`, the first release that exports `CONFIG_DIR_NAME`, and synchronized `package-lock.json`.
2. **Project trust:** Project-local keybinding configuration is now loaded only when `ctx.isProjectTrusted()` returns true. Global configuration and the default shortcut remain available for untrusted projects.
3. **Keybinding validation:** Added complete modifier and base-key validation before registration. Unknown or duplicate modifiers and unsupported keys now produce a warning and fall back to the next valid configuration source instead of becoming unintended shortcuts.
4. **Hermetic tests:** Extension configuration tests now use temporary global and project directories, restore environment changes, and cover untrusted projects and malformed modifiers. The runtime harness now models `isProjectTrusted()`.

## Verification

- `npm run check` — typechecking passed; 10 test files and 73 tests passed
- `tests/index.test.ts` also passed with an external `PI_CODING_AGENT_DIR` containing a non-default shortcut, confirming test isolation
