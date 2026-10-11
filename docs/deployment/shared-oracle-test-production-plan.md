# Shared Oracle test and production deployment plan

Status: Planned
Updated: 2026-10-11
Owner: ReplyTrail project

## Objective

Run a persistent ReplyTrail testing environment and the first production
environment on one small Oracle Cloud VM. The host may share the operating
system, Docker daemon, PostgreSQL server, RabbitMQ server, Redis server, HTTPS
reverse proxy, and host-level logs, but test and production must remain
logically separate.

This is a cost-minimizing interim design. It is not high availability: one VM
failure, an OS outage, or a shared dependency outage affects both environments.
Move production to its own host or managed services when the product needs
independent availability, maintenance, or scaling.

## Agreed constraints and decisions

- Use Docker Compose and one ARM64 VM. A second orchestration layer is out of
  scope.
- Keep GitHub Codespaces for short interactive checks and GitHub Actions for
  branch/PR verification. Use this persistent host for weekly schedules, stable
  webhook ingress, long-running timers, and restart/recovery verification.
- PostgreSQL remains the source of truth for durable tasks, escalation runs,
  schedules, and notification obligations. Timer callbacks reload current state
  from PostgreSQL after wake-up.
- Preserve existing `alertops` package names, container compatibility names
  where they remain useful, and all `ALERTOPS_*` configuration identifiers.
- Never share production secrets, database volumes, RabbitMQ virtual hosts,
  Redis namespaces, SMTP credentials, or test data with the test environment.
- Do not build images on the Oracle VM. CI builds and scans immutable ARM64
  images; the VM only pulls and runs an approved image digest or commit SHA.

## Target host and capacity

Target one `VM.Standard.A1.Flex` instance in the Oracle home region, using
Ubuntu 24.04 ARM64, a 50 GB boot volume, and additional block storage only if
the combined Always Free storage allowance permits it. Oracle documents the
Always Free A1 allowance as up to **2 OCPUs and 12 GB memory total** for
eligible tenancies. See the [Always Free resource
limits](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

The current Mumbai capacity error is a provisioning blocker, not a design
decision. When capacity is worth one more check, use the following controlled
order and then stop if both attempts fail:

1. Try `VM.Standard.A1.Flex` with 2 OCPUs and 12 GB memory.
2. If that fails for capacity, try the same shape with 1 OCPU and 6 GB memory.
3. If the reduced target also fails, pause cloud provisioning and continue
   product work. Do not cycle through more fault domains, use E2 Micro, or
   repeatedly call the capacity report. A paid shape, another region, or
   separate hosts requires a new decision.

Follow [Oracle's out-of-host-capacity
guidance](https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/troubleshooting-out-of-host-capacity.htm)
when the two-step retry is eventually performed. Do not claim deployment
readiness until an ARM64 VM is actually created and the deployed checks below
pass.

### Initial resource envelope

The 12 GB limit is a host ceiling, not an allocation target. Reserve memory for
Ubuntu, Docker, the proxy, log buffers, and filesystem cache before setting
Compose limits. Start with a measured envelope rather than allowing every
container to consume its current local-development maximum:

| Area | Initial policy | Reason |
| --- | --- | --- |
| Production API/UI | Highest CPU and memory priority | Production must remain responsive while tests run. |
| Test API/UI | Explicit lower CPU and memory cap | A load or failed test must not starve production. |
| PostgreSQL/RabbitMQ/Redis | Shared services with bounded memory and persistent volumes | Keep the existing low-volume architecture while protecting the host. |
| Reverse proxy and log collector | Small fixed budget with rotation | Public ingress and diagnostics must remain available. |
| Image builds | Never run on the VM | Builds can exhaust CPU, memory, and disk during tests. |

Measure idle and peak RSS, CPU, disk, queue depth, database connections, and
load-test latency. Increase only the limits that evidence justifies. If the
host cannot sustain production plus the required test load, stop the test stack
or move testing to another host; do not remove production safeguards.

## Logical isolation design

Use one shared-infrastructure Compose project and two application Compose
projects on the same Docker host:

- `replytrail-infra` for PostgreSQL, RabbitMQ, Redis, the reverse proxy, and
  host-facing log configuration.
- `replytrail-prod` for the public production application.
- `replytrail-test` for the persistent functional test application.

The shared infrastructure is one service process per dependency, but each
application receives separate credentials and an explicit namespace:

| Resource | Production | Testing | Isolation rule |
| --- | --- | --- | --- |
| PostgreSQL | `replytrail_prod` database and `replytrail_prod` role | `replytrail_test` database and `replytrail_test` role | Separate databases, roles, passwords, migrations, and backup restore targets. |
| RabbitMQ | `/replytrail-prod` vhost and user | `/replytrail-test` vhost and user | Separate vhosts prevent queue and exchange visibility across environments. |
| Redis | Dedicated logical database and production key prefix | Separate logical database and test key prefix | Add explicit Spring database configuration and prefixes; never rely on the default database. |
| Application | One production container set | One test container set | Separate Compose projects, environment files, networks, ports, and restart policy. |
| Persistent data | Production-prefixed volumes | Test-prefixed volumes | No volume is mounted by both projects. |
| Public routing | `app.example.com` | `test.example.com` | Same proxy and VM, separate upstreams, TLS routes, CORS values, and access policy. |
| Logs | Host-level collection | Host-level collection | Every record carries `environment=prod` or `environment=test`; retention is bounded. |

The test environment must use a test SMTP account and a test webhook secret.
Protect the test UI/API with authentication or an IP allowlist when practical;
do not expose PostgreSQL, RabbitMQ, Redis, or their management ports publicly.

## Implementation phases

### 1. Refactor Compose for the three projects

- Remove fixed `container_name` and fixed service `hostname` values that prevent
  two Compose projects from running together.
- Move shared infrastructure and application settings into a common Compose
  base plus `infra`, `prod`, and `test` overrides.
- Parameterize image reference, project-specific service names, host ports,
  internal network aliases, health checks, restart policy, CPU/memory limits,
  and volume names.
- Create one external private Docker network for the shared dependencies and
  connect only the two application projects and reverse proxy to it. Do not
  make the test and production application networks directly interchangeable.
- Keep dependency ports on the private Docker network. Publish only the reverse
  proxy and, during controlled diagnostics, an explicitly protected test route.
- Add the Redis database setting and key-prefix strategy to the application
  configuration. Add RabbitMQ virtual-host configuration; do not encode either
  environment as a boolean mode.
- Ensure Flyway runs against only the selected environment database and that a
  test migration cannot point at production credentials.

### 2. Create shared dependency namespaces

- Initialize the two PostgreSQL databases and roles with a repeatable,
  idempotent administrative script. Grant each role access only to its own
  database.
- Create the two RabbitMQ vhosts, users, permissions, exchanges, and queues.
  Remove the default shared user from remote access.
- Configure Redis authentication and separate logical databases/key prefixes.
  Verify that a test flush or cache miss cannot affect production keys.
- Create production and test volume names explicitly. Document which volumes
  are included in backups and which are disposable.

### 3. Harden the Oracle host

- Create the VM with the minimum public exposure: SSH from an allowlisted source
  where possible, and HTTPS through the reverse proxy.
- Apply OS security updates, configure a non-root deployment user, disable
  password SSH login, install Docker Engine and the Compose plugin, and enable
  unattended security updates where compatible with the maintenance plan.
- Configure Docker log rotation and host disk alerts. Keep enough free disk for
  one image update, database WAL, RabbitMQ persistence, and diagnostic logs.
- Configure a host firewall so only SSH, HTTP/HTTPS, and required operational
  access are reachable. Bind dependency ports to the Docker network or loopback.

### 4. Configure secrets and domains

- Store `.env.prod` and `.env.test` only on the VM with owner-only permissions.
  Keep them out of Git, Codespaces, image layers, and CI logs.
- Use different JWT secrets, SMTP credentials, webhook secrets, database
  passwords, RabbitMQ passwords, and Redis passwords for the two environments.
- Set production and test UI base URLs, CORS origins, email links, webhook rate
  limits, and SMTP sender identities independently.
- Point DNS records at the proxy only after the test route is protected and the
  production route has a valid certificate. Use the proxy's documented renewal
  mechanism and verify renewal before launch.

### 5. Build the CI/CD path

1. On every pull request and testing-branch push, run the normal backend/UI
   checks and build an ARM64-compatible image in GitHub Actions.
2. Publish the image under the existing repository-derived GHCR name using the
   commit SHA. Keep the branch image separate from production release images.
3. Run disposable Compose smoke checks in CI. Do not treat those checks as the
   weekly-schedule or stable-ingress verification.
4. Require an explicit approval to deploy a chosen SHA to the test project.
   The deployment job pulls that SHA, runs migrations, waits for health, and
   executes the persistent-host smoke checks. No new Git tag is required for
   each test iteration.
5. Promote the exact tested image digest to production after the release
   checks. Production deployment must record the previous digest for rollback.
6. Deploy one Compose project at a time, with production health verification
   before any test resource increase. Keep the test project bounded during
   production rollout.

The deployment mechanism may use an SSH-based runner or a narrowly scoped
deployment agent. It must not place long-lived Oracle credentials in a public
workflow, and it must not log environment files or secret values.

### 6. Add operational safety

- Back up both PostgreSQL databases to storage outside the VM. Test backup
  restoration into a disposable database before relying on it.
- Back up or export RabbitMQ definitions when topology changes. Treat Redis as
  rebuildable cache/workflow state only if the application contract permits it;
  otherwise include its persistence in the recovery plan.
- Add health checks for both app projects and alerts for host memory, disk,
  container restarts, PostgreSQL failures, RabbitMQ queue depth, Redis errors,
  SMTP failures, and certificate expiry.
- Document rollback to the previous image digest and the procedure for stopping
  the test stack without stopping production.
- Schedule maintenance so host reboots are tested against both environments;
  confirm application startup recovery rebuilds pending timers from PostgreSQL.

## Verification matrix

Run these checks on the persistent host after the two projects are deployed:

1. **Isolation:** create data, a webhook event, a queue message, and cache keys
   in test; verify no production database row, queue, cache key, email link, or
   log credential is affected. Repeat in the other direction where safe.
2. **Concurrency:** run three independent escalations concurrently and send
   representative webhook traffic at 5 RPS and then 10 RPS. Record p50/p95
   latency, error rate, queue depth, CPU, memory, and database connections.
3. **Scheduling:** create a short future schedule, a daily schedule, and a
   weekly schedule in test. Leave the host running through the due time and
   confirm only the intended run starts. Verify overlapping recurring runs keep
   independent IDs and state.
4. **Recovery:** restart the test app, shared dependencies, and then the VM at
   separate points while work is pending. Confirm PostgreSQL-backed timers,
   pending notification obligations, RabbitMQ retries, and duplicate-delivery
   protection behave as designed.
5. **Production protection:** saturate the test workload within its cap and
   verify production health, webhook response, and email delivery remain within
   the agreed service threshold.
6. **Backup and rollback:** restore a PostgreSQL backup into a disposable target,
   deploy the previous production image digest, and confirm the test project can
   be stopped and recreated without touching production volumes.
7. **Security:** scan exposed ports from outside the VM, verify dependency
   management interfaces are private, inspect proxy TLS, and confirm secrets do
   not appear in container inspection output or CI logs.

Record the commit/image digest, host shape, Compose project names, test load,
latency, resource peaks, schedule timestamps, restart results, and backup
restore result. Do not record secret values.

## Release gate and limitations

This plan is complete only when the implementation changes, the persistent-host
verification matrix, and the launch checklist evidence are complete. Until
then, Oracle capacity and deployed behavior remain open items.

The shared-host design is acceptable for a low-volume first release only if the
test stack can be stopped independently and production remains protected under
the measured load. It is not a substitute for separate production and staging
hosts when either environment needs independent uptime, scaling, maintenance,
or security boundaries.
