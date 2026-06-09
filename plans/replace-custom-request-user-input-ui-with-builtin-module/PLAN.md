# Plan: Replace Custom `request_user_input` UI with Built-in `ctx.ui` Dialogs

## Goal

Replace the current `ctx.ui.custom(QnATuiComponent)` implementation used by `request_user_input` with Pi's built-in dialog APIs:

- `ctx.ui.select()` for multiple-choice questions
- `ctx.ui.input()` for open-ended answers and `Other` answers

This keeps the tool behavior while removing the custom TUI dependency for this flow and improving compatibility with RPC mode.

## Current Behavior to Preserve

`request_user_input` currently supports:

1. 1–3 questions.
2. Open-ended questions when `options` is omitted or empty.
3. Multiple-choice questions when `options` is present.
4. An implicit `Other` option for multiple-choice questions.
5. Answer shape:
   - Open-ended: `{ answers: ["user_note: ..."] }`
   - Option: `{ answers: ["Selected label"] }`
   - Other: `{ answers: ["Other", "user_note: ..."] }`
6. Cancellation returns an error result to the model.
7. Existing result summary/rendering helpers remain unchanged.

## Behavior Changes Accepted

The new implementation will use sequential built-in dialogs instead of one custom wizard.

Accepted losses:

- No combined multi-question wizard screen.
- No progress dots.
- No Tab/Shift+Tab navigation between questions.
- No review-before-submit screen.
- No inline `Other` editor.
- Option descriptions may need to be embedded into display strings or omitted.

Accepted gains:

- Less custom TUI code.
- `request_user_input` can work anywhere `ctx.hasUI` is true, including RPC mode.
- Simpler implementation and maintenance.

## Implementation Steps

### 1. Add a built-in-dialog answer collector

Replace `collectRequestUserInputAnswers()` in `request-user-input.ts` with a version that loops through questions sequentially.

Pseudo-flow:

```ts
async function collectRequestUserInputAnswers(ctx, questions) {
  const responses: QnAResponse[] = [];

  for (const question of questions) {
    const response = await collectSingleQuestionAnswer(ctx, question);
    if (!response) return null;
    responses.push(response);
  }

  return buildRequestUserInputResponse(questions, responses);
}
```

### 2. Implement open-ended questions with `ctx.ui.input()`

For questions without options:

```ts
const value = await ctx.ui.input(
  question.header?.trim() || question.question,
  question.question,
);

if (value === undefined) return null;
```

Map to:

```ts
{
  selectedOptionIndex: 0,
  customText: value,
  selectionTouched: value.trim().length > 0,
  committed: true,
}
```

### 3. Implement multiple-choice questions with `ctx.ui.select()`

For questions with options:

- Build display labels from option labels.
- Append an `Other` entry.
- Use `ctx.ui.select(title, labels)`.

Important: avoid relying on labels being globally unique if possible. Since `select()` returns the selected string, use prefixed labels such as:

```ts
const labels = [
  ...question.options.map((option, index) => `${index + 1}. ${option.label}`),
  `${question.options.length + 1}. Other`,
];
```

Then map the returned string back by index.

### 4. Implement `Other` with a follow-up `ctx.ui.input()`

If the selected index equals `question.options.length`, call:

```ts
const value = await ctx.ui.input(
  `${question.header?.trim() || "Other"}: Other answer`,
  "Type your answer",
);

if (value === undefined) return null;
```

Map to:

```ts
{
  selectedOptionIndex: question.options.length,
  customText: value,
  selectionTouched: value.trim().length > 0,
  committed: true,
}
```

Existing `buildRequestUserInputAnswer()` will convert this to:

```ts
{ answers: ["Other", "user_note: ..."] }
```

For empty `Other` text, existing semantics return no answer.

### 5. Preserve selected option mapping

For normal option selection, map to:

```ts
{
  selectedOptionIndex,
  customText: "",
  selectionTouched: true,
  committed: true,
}
```

Existing `buildRequestUserInputAnswer()` will convert this to:

```ts
{ answers: [question.options[selectedOptionIndex].label] }
```

### 6. Relax UI mode guard

Current code checks `ctx.hasUI`, which is already correct for built-in dialogs.

Keep:

```ts
if (!ctx.hasUI) {
  return error: "request_user_input requires interactive mode"
}
```

Optionally update the error text to:

```text
request_user_input requires UI support
```

Do **not** switch to `ctx.mode === "tui"`; built-in dialogs also work in RPC mode.

### 7. Remove custom QnA dependency from `request-user-input.ts`

Remove imports that are only needed by the custom collector:

```ts
import type { QnAResult } from "./qna";
import { QnATuiComponent } from "./qna";
```

Keep `QnAResponse` type if reusing the existing response-building helpers.

### 8. Decide what to do with `qna/`

Options:

1. Keep `qna/` for now if used elsewhere or if tests still cover it.
2. Remove `qna/` and related tests if it becomes unused.

Recommended first step: keep it to minimize scope, then remove in a later cleanup if `rg "QnATuiComponent|./qna"` shows no production usage.

### 9. Update tests

Add/adjust tests around the new collector behavior.

Suggested test cases:

1. Open-ended question returns `user_note: ...`.
2. Option question returns selected label.
3. Option question + `Other` calls input and returns `["Other", "user_note: ..."]`.
4. Cancel at `select()` returns `null` / tool cancellation error.
5. Cancel at `Other` input returns `null` / tool cancellation error.
6. Multiple questions call dialogs in order and produce answers for each id.

If `collectRequestUserInputAnswers()` remains private, consider extracting a small exported helper such as:

```ts
export async function collectSingleRequestUserInputAnswer(...)
```

or test through the registered tool using the extension runtime harness.

### 10. Run validation

Run:

```bash
npm test
```

If available, also run targeted tests first:

```bash
npm test -- request-user-input
```

## Risks / Edge Cases

- `ctx.ui.select()` returns a string, not an index. Prefix options with numbers and map by exact generated label.
- Duplicate option labels are okay if generated labels include unique numeric prefixes.
- Descriptions are not first-class in `ctx.ui.select()`. Either omit them or include compactly in the display label.
- Empty freeform answers should preserve current semantics: no answer entries.
- Built-in dialogs are sequential; users cannot go back to earlier questions before final submission.

## Expected End State

`request_user_input` no longer opens `QnATuiComponent`. It asks questions using Pi's built-in dialogs, preserves the existing answer/result schema, and works in both TUI and RPC UI-capable modes.
