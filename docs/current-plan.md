# Current task plan

## Task: Make the home-page theme toggle visible in dark mode

Started: 2026-10-11
Status: Complete

### Goal and scope

Give the public home-page theme toggle the same light, readable treatment as
the other theme controls when dark mode is active. Change only the public
header styling; preserve theme behavior and other pages.

The previous webhook UI redesign is complete. Existing documentation,
deployment, and webhook changes in the working tree were preserved.

### Acceptance criteria and steps

- [x] Add a dark-theme override for the public header toggle.
- [x] Keep the control readable with a visible border and hover state.
- [x] Verify other theme controls are not affected.
- [x] Run UI typecheck, production build, lint, and whitespace checks.

### Verification

UI typecheck and production build pass. UI lint passes with the two existing
flow-editor warnings. `git diff --check` passes. No theme behavior or backend
code changed.
