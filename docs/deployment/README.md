# ReplyTrail first-release deployment

The first release will use Docker Compose on one Oracle Cloud Always Free A1
virtual machine in Mumbai, with test and production isolated as separate
Compose projects and data namespaces. The operating system, Docker host,
PostgreSQL, RabbitMQ, Redis, HTTPS reverse proxy, and host logging are shared
to keep the initial cost low. GitHub Codespaces remains the supplemental
short-lived testing environment; the persistent host is required for full
functional testing. See the [shared Oracle test and production deployment
plan](shared-oracle-test-production-plan.md) for the implementation sequence,
isolation rules, CI/CD promotion path, and release gate.

The application images and shared dependencies will use private Docker
networks. The React UI and HTTPS reverse proxy will provide the public entry
point. Email delivery will use an external SMTP provider.

PostgreSQL remains the source of truth for escalation state and schedules.
RabbitMQ delivers ready notification work. Redis stores temporary workflow
intents and supports shared webhook rate limiting. In-memory timers are rebuilt
from saved database state after application startup.

## Existing foundations

The source repository is [1hemant2/replytrail](https://github.com/1hemant2/replytrail).
CI derives its image name from `github.repository`, so new builds target
`ghcr.io/1hemant2/replytrail:<commit-sha>`. The repository rename does not migrate
old container images; verify a successful image publication and package access
before configuring deployment to pull the new name.

- [Dockerfile](../../Dockerfile) builds the backend image.
- [Docker Compose](../../docker-compose.yml) runs the Codespaces test backend and dependencies.
- [UI Dockerfile](../../ui/Dockerfile) builds and serves the React application.
- [GitHub Actions](../../.github/workflows/ci.yml) verifies, scans, and publishes
  backend images on its configured events.
- [Production properties](../../src/main/resources/application-prod.properties)
  read runtime configuration from environment variables.

For the Codespaces prerequisites, branch/PR loop, free-resource limits, and
automated Compose smoke test, see the [Codespaces and CI testing
guide](codespaces-and-ci.md).

## GitHub Codespaces testing plan

Use a personal GitHub Codespaces environment for repeatable integration and load
testing before Oracle production work. The smallest useful machine is the
**2-core / 8-GB RAM / 32-GB storage** Codespaces configuration. GitHub Free
personal accounts include 120 core-hours per month, which is about 60 hours on
that two-core machine, plus 15 GB-month of storage. See GitHub's documentation
for [machine sizes](https://docs.github.com/en/codespaces/about-codespaces/what-are-codespaces)
and [Codespaces billing](https://docs.github.com/en/billing/concepts/product-billing/github-codespaces).

### Prepare the Codespace

1. Create a Codespace from the testing branch or the exact commit under review.
2. Choose the 2-core / 8-GB machine. Keep the idle timeout short enough to avoid
   consuming the monthly allowance after a test session.
3. Confirm that Docker and Docker Compose are available. If this becomes a
   repeated workflow, add a checked-in dev-container configuration that uses
   Compose and forwards the UI port. GitHub supports [Docker Compose in a
   dev-container configuration](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/adding-a-dev-container-configuration/setting-up-your-python-project-for-codespaces).
4. Copy `.env.example` to `.env` inside the Codespace and replace every password
   and the JWT placeholder with test-only values. Store SMTP values in GitHub
   Codespaces secrets or use a dedicated test SMTP account; never copy production
   credentials into the Codespace.
5. Keep the repository's existing `ALERTOPS_*` and `SPRING_*` names. Set the UI
   and CORS values to the forwarded UI origin used by the session.

### Start the test stack

From the repository root:

```bash
docker compose up --build -d
docker compose ps
curl --fail http://localhost:8096/actuator/health/liveness
```

Start the UI in a second terminal:

```bash
npm --prefix ui ci
npm --prefix ui run dev -- --host 0.0.0.0
```

Forward only the UI port `5173` and API port `8096` in the Codespaces Ports
panel. Keep PostgreSQL `5432`, Redis `6379`, RabbitMQ `5672`, and RabbitMQ
management `15672` private. Make the API port public only for a short, controlled
webhook test that requires an external sender, then return it to private access.

The Compose volumes are durable for the lifetime of the Codespace, so stopping
and resuming the Codespace can retain test data. Deleting the Codespace removes
the environment and its local database, broker, and Redis volumes. This is
intentional: do not use the Codespace for production data or as a backup.

### Test sequence and evidence

Run the checks in this order so failures are easy to attribute:

1. Confirm liveness and readiness, Flyway startup, database connectivity,
   RabbitMQ health, and Redis authentication.
2. Register a test user, create a team, create a task and response path, and
   start three escalations concurrently. Use short response-step delays so the
   run reaches notification and acknowledgement states during the session.
3. Send webhook events with unique event IDs at 5 requests per second, then at
   10 requests per second. The default webhook limit is 120 requests per minute,
   so raise `ALERTOPS_WEBHOOK_RATE_LIMIT` for this test or keep the load below
   that per-webhook limit. Use an external load generator through a forwarded
   API port and record response codes, latency, and error rate.
4. Confirm that all three escalations advance independently, duplicate webhook
   deliveries do not create extra runs, acknowledgement prevents later steps,
   and saved run state remains visible in the UI.
5. Stop and restart the app and dependency containers while pending timers and
   retryable work exist. Confirm that PostgreSQL state rebuilds the timers and
   RabbitMQ/notification recovery does not duplicate completed work.
6. Save the test commit, Codespaces machine size, environment variables that
   affect behavior, request rate, duration, p50/p95 latency, error count,
   escalation outcomes, and restart result. Do not save secret values.

The testing target is three concurrent escalations and 5–10 requests per second
for a representative short run, such as 15 minutes. It is a capacity check for
the current implementation, not a production performance guarantee. A Codespace
stopping, sleeping, or being deleted invalidates any claim that timers ran while
the environment was unavailable.

### Stop and clean up

After each session, save the evidence and run `docker compose down` to stop the
containers while retaining the session's volumes. Delete the Codespace when the
test data is no longer needed. Use `docker compose down -v` only when the test
database, RabbitMQ state, and Redis data should be removed immediately. Stop the
Codespace itself to stop consuming compute hours.

### Codespaces limitations

- The free allowance is time-based and resets monthly; it is not an always-on
  staging server.
- A forwarded port is suitable for controlled testing, but it is not the public
  production ingress or a durable webhook endpoint.
- Codespaces storage and Compose volumes are not an external backup.
- The Codespaces machine architecture may differ from Oracle A1 ARM64. Its
  results do not prove that the application image and dependency images work on
  the production host.
- A Codespaces test does not verify production HTTPS, DNS, firewall rules,
  external backups, Oracle capacity, SMTP sender reputation, or host recovery.

The Codespaces check is complete when the documented sequence has recorded a
successful three-escalation run, the 5–10 request/second result, duplicate and
acknowledgement behavior, and short-session restart recovery. Full functional
readiness additionally requires a persistent test host, including a weekly
schedule and long-running timer check.

## Remaining deployment work

The existing Compose file is a test stack. The production configuration has not
been implemented or deployed yet. Before release:

- Run separate `replytrail-prod` and `replytrail-test` Compose projects without
  fixed container names, shared volumes, or shared credentials.
- Create separate PostgreSQL databases/roles, RabbitMQ virtual hosts/users, and
  Redis logical databases/key prefixes for the two projects.
- Pull immutable ARM64-compatible application images from GHCR instead of
  building on the server.
- Publish ARM64-compatible images for Oracle A1 and verify dependency image support.
- Serve the UI and API through the public domain with HTTPS.
- Keep database, broker, and Redis ports private.
- Supply production credentials, JWT configuration, email links, and SMTP settings.
- Configure persistent, environment-prefixed volumes, restart policies, resource
  limits, and log rotation for the services.
- Back up both PostgreSQL databases outside the VM and verify restoration.
- Verify health, email delivery, scheduling, and recovery after a host restart.
- Verify that a bounded test load cannot starve production and that the test
  project can be stopped independently.

One machine is a single point of failure. Persistent volumes do not replace
external backups. Deployment and end-to-end verification remain the final release
step; readiness is tracked in the [product launch checklist](../product-launch-readiness.md#release-check).

## Oracle shared-host resource target

Use the ReplyTrail network in the Mumbai home region and the root compartment
for the shared host. The target is one `VM.Standard.A1.Flex` instance with up
to 2 OCPUs and 12 GB RAM total, a 50 GB boot volume, and Ubuntu 24.04 ARM64.
Oracle's [Always Free resource
limits](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
describe this A1 allowance for eligible tenancies. This is a host ceiling, not
a throughput guarantee: reserve capacity for the OS, Docker, proxy, logs, and
both application projects, and set explicit Compose limits so test traffic
cannot starve production.

The detailed implementation is in the [shared Oracle test and production
deployment plan](shared-oracle-test-production-plan.md). The initial 3-escalation
and 5–10 RPS target must be measured on the persistent host, together with a
weekly schedule, restart recovery, backup restore, and production-protection
check.

The old OKE cluster, worker pool, two workers, and three 47 GB boot volumes were
removed with the owner's approval. Their boot-volume data was permanently deleted.
The compartment and network were retained.

### Controlled provisioning order

When Mumbai capacity is worth one more check, use only this sequence:

1. Try `VM.Standard.A1.Flex` with **2 OCPUs and 12 GB RAM**. This uses the full
   eligible Always Free A1 allocation and is the preferred shared-host target.
2. If that fails for capacity, try the same shape with **1 OCPU and 6 GB RAM**.
   This is the smallest planned host for the combined test and production
   stack, so Compose limits and the test workload must be conservative.
3. If both attempts fail, stop the provisioning work and continue product work
   elsewhere. Do not spend more time cycling fault domains, trying E2 Micro, or
   repeatedly calling the capacity report. A paid shape, another region, or
   separate hosts requires a new decision.

The earlier 1 OCPU / 4 GB and 1 OCPU / 2 GB experiments failed with capacity
errors. On 2026-10-11, 1 OCPU / 6 GB attempts reported no capacity in FD-1 and
FD-2; FD-3 and the E2 Micro check were inconclusive because OCI rate-limited
the repeated create requests. No new VM was created, and ReplyTrail is not
deployed. The next retry must follow the two-step order above.

The dedicated SSH key is stored locally at
`/Users/hemant/.ssh/replytrail_oci_test`; never commit or publish its private key.
Use profile `REPLYTRAIL` with `--auth security_token` for local Oracle CLI access.
When the session expires, run:

```bash
oci session authenticate --region ap-mumbai-1 --profile-name REPLYTRAIL
```

The browser callback requires local port 8181. SeaweedFS is currently stopped at
the owner's request to leave that port available. Keep test data, credentials,
queues, and volumes separate from production. CI/CD automation follows successful
manual deployment and recovery checks.
