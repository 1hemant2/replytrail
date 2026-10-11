# Current task plan

## Task: Set the controlled Oracle provisioning retry order

Started: 2026-10-11
Status: Complete

### Goal and scope

Document one final, time-bounded Oracle capacity sequence for the shared
ReplyTrail host: try the full 2 OCPU / 12 GB A1 allocation first, then try
1 OCPU / 6 GB, and stop cloud-provisioning work if both fail. Update the
maintained deployment documents and record the decision. Do not change code or
provision additional resources in this documentation task.

### Decision-compliance note

- Keep Docker Compose as the deployment mechanism and keep test and production
  logically isolated on one host when provisioned.
- Preserve PostgreSQL as the durable source of truth and existing `alertops`
  compatibility identifiers.
- Treat 2 OCPU / 12 GB as the preferred Always Free A1 ceiling and 1 OCPU /
  6 GB as the only planned fallback.
- Explicitly exclude repeated fault-domain cycling, E2 Micro, capacity-report
  retries, paid shapes, and another region unless the owner makes a new decision.

### Acceptance criteria

- [x] Update the deployment guide with the two-step provisioning order and stop
  condition.
- [x] Update the shared-host plan with the same order and exclusions.
- [x] Record the current OCI test evidence and no-VM outcome without claiming
  that Mumbai capacity is available.
- [x] Add a concise changelog entry and verify documentation whitespace.

### Verification results

- `git diff --check` passes.
- The documentation now directs the next attempt to 2 OCPU / 12 GB, followed by
  1 OCPU / 6 GB only if needed.
- No application code or cloud resource changed in this task.
