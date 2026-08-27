## Findings

### [P2] Preserve the availability check for existing helper callers

**Location:** `/home/milanglacier/Desktop/personal-projects/pi-plan-mode/request-user-input.ts:248-255`

The shipped `registerRequestUserInputTool` helper still accepts the previous `getState` dependency for compatibility but now ignores it and removes the execution-time guard. An existing subpath consumer that registers the tool with an inactive plan state will therefore have it auto-activated by `registerTool()` and can open the dialog outside plan mode; retain the old guard when this dependency is supplied, or replace it with an explicit availability predicate that also supports the new normal-mode setting.

## Overall assessment

**Verdict:** Patch needs revision.

**Explanation:** The internal toggle flow and test suite pass, but the retained public registration signature no longer preserves its prior availability behavior. Existing callers can expose `request_user_input` while their supplied state says it is disabled.

---

## Update after user decision

**User's decision:** External deep-import callers are not considered part of the supported API, so the compatibility concern above is outside the review scope and is withdrawn.

No repository-internal failure remains after removing that unsupported assumption.

**Updated verdict:** Patch is correct.
