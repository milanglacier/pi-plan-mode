# Review: replace custom `request_user_input` UI with built-in dialogs

## Finding 1: Show the full question in each built-in dialog

The new collector uses `question.header?.trim() || question.question` as the dialog title, then passes the real question only as the `input()` placeholder and not at all to `select()`. In TUI mode the built-in input component renders the title and ignores the placeholder, so a normal schema-compliant question with a short header like `"Runtime"` shows only `Runtime` (and option labels for selects), not the actual prompt `"Which runtime should we use?"`. This changes `request_user_input` from asking the model's question to showing a short label, which can make open-ended questions impossible to answer and multiple-choice questions ambiguous. Include the question text in the visible title/message passed to both `ctx.ui.input()` and `ctx.ui.select()`.

**Location:** `/home/milanglacier/Desktop/personal-projects/pi-plan-mode/request-user-input.ts`, lines 137–157

---

## Overall assessment

**Verdict:** Needs revision.

**Explanation:** The refactor removes the custom UI and passes tests, but it drops the actual question text from the visible built-in dialogs whenever a header is provided. That is a user-facing regression in the core `request_user_input` flow.

---

## Update after fix

Implemented a fix in `request-user-input.ts` by adding `buildRequestUserInputDialogTitle()`, which combines the short header and full question text for built-in dialogs. Updated `tests/request-user-input.test.ts` so `ctx.ui.input()` and `ctx.ui.select()` expectations assert visible titles such as `Runtime\nWhich runtime?`.

Validation: `npm test` passes — 9 test files, 61 tests.

**Updated verdict:** Correct as revised.

---

# Second round review

## Finding 1: Pass the tool abort signal into dialogs

The tool execution callback receives an abort signal, but the built-in `ctx.ui.input()` and `ctx.ui.select()` calls were made without passing `{ signal }`. Pi's built-in dialogs only auto-dismiss on abort when that option is supplied, so stopping the agent while `request_user_input` is waiting could leave the dialog/request pending until the user also answered or cancelled it. This is especially important for the new RPC-capable path, where it could leave an outstanding `extension_ui_request` after the turn was aborted.

**Location:** `/home/milanglacier/Desktop/personal-projects/pi-plan-mode/request-user-input.ts`, lines 149–177

---

## Second round overall assessment

**Verdict:** Needs revision.

**Explanation:** The first-round title visibility issue was fixed, but the new built-in dialog flow still needed to thread the tool abort signal through each UI prompt so cancellation behaves correctly.

---

## Second round update after fix

Implemented a fix in `request-user-input.ts` by threading the tool execution `signal` through `collectRequestUserInputAnswers()`, `collectSingleRequestUserInputAnswer()`, and each built-in `ctx.ui.input()` / `ctx.ui.select()` call. Updated `tests/request-user-input.test.ts` to assert the abort signal is passed to open-ended, select, and `Other` follow-up dialogs.

Validation: `npm test` passes — 9 test files, 62 tests.

**Updated verdict:** Correct as revised.

---

# Third round review

## Finding 1: Include the question in the Other prompt

The follow-up `ctx.ui.input()` shown after selecting implicit `Other` used only the short header as its title (`"Runtime: Other answer"`). Pi's built-in input renders the title and ignores the placeholder, so the user no longer saw the actual prompt they were answering when entering a custom option. This regressed the old custom UI, where the Other editor stayed under the full question text.

**Location:** `/home/milanglacier/Desktop/personal-projects/pi-plan-mode/request-user-input.ts`, lines 208–211

---

## Third round overall assessment

**Verdict:** Needs revision.

**Explanation:** The earlier title and abort-signal issues were fixed, but the `Other` follow-up dialog still dropped the full question text and could be ambiguous for short-header prompts.

---

## Third round update after fix

Implemented a fix in `request-user-input.ts` by reusing the full dialog title for the `Other` follow-up and appending `Other answer`, so the built-in input now shows both the header and prompt before collecting custom text. Updated `tests/request-user-input.test.ts` to assert the `Other` input title is `Runtime\nWhich runtime?\nOther answer` both with and without an abort signal.

Validation: `npm test` passes — 9 test files, 62 tests.

**Updated verdict:** Correct as revised.

---

# Fourth round review

No additional findings.

## Fourth round overall assessment

**Verdict:** Correct as-is.

**Explanation:** The previously documented issues remain addressed: dialogs show the full prompt, receive the abort signal, and include the prompt in the `Other` follow-up. Validation: `npm test` passes — 9 test files, 62 tests.

**Status:** Completed.
