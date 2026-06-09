# v0.5.6

## Changed

- **Replace custom `request_user_input` UI with built-in `ctx.ui`.** The
  custom `request_user_input` dialog has been replaced by the pi framework's
  built-in `ctx.ui` API, reducing maintenance surface and improving consistency
  with host UI conventions.

- **Enable strict TypeScript type checking.** The TypeScript configuration now
  enforces stricter type rules across the codebase, and all lint violations have
  been resolved.

