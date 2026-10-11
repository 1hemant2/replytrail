# Codespaces and CI testing

This document describes the supplemental Codespaces and CI testing path for
ReplyTrail. Codespaces are for short-lived smoke, load, and interactive checks;
they are not the full functional environment. Oracle Cloud remains the planned
production host, and production deployment must use the separate [deployment
guide](README.md).

## The testing workflow

Use source branches and pull requests for testing. A tag is not required for a
test run, and the test workflow does not publish an image or change the Oracle
environment.

| Path | Starts when | Builds | Best for |
| --- | --- | --- | --- |
| GitHub Actions | Any branch push, pull request to `master`, or manual run | Maven, UI, and a fresh Docker Compose stack | Fast repeatable checks on every change |
| GitHub Codespaces | You create a Codespace from a branch or commit | The backend image in the Codespace and the UI in dev mode | Short interactive checks, webhook calls, logs, and the three-escalation load check |
| Persistent test host | An explicitly provisioned test VM | Docker Compose with persistent volumes and stable ingress | Weekly schedules, long-running timers, email/webhook journeys, and restart recovery |
| Production release | An explicitly approved production change | An immutable image and the production Compose configuration | Oracle deployment after testing evidence is accepted |

The CI workflow is [`.github/workflows/codespaces-compose.yml`](../../.github/workflows/codespaces-compose.yml).
It runs from branch source and uses disposable credentials. The existing
[`ci.yml`](../../.github/workflows/ci.yml) continues to run Maven verification
and image scanning. Its image publication remains separate from this test path.

The full functional test environment is a separate, always-on test host. It must
remain available across a week, provide a stable HTTPS/webhook URL, retain
PostgreSQL data and Compose volumes, support SMTP testing, and allow controlled
restart and recovery checks. Do not treat a Codespace or a CI runner as that
host.

## What is needed on the local computer

The local computer is only used to access GitHub and open the Codespace. It
needs:

- Git and access to the ReplyTrail repository.
- A browser with access to GitHub Codespaces.
- The [GitHub CLI](https://cli.github.com/) is optional. It is useful for
  creating, listing, stopping, and connecting to Codespaces from a terminal.

Do not install Docker, Java, Node.js, Maven, or a load generator on the local
computer for this workflow. The backend, dependencies, UI, health checks, and
load generator all run inside the Codespace or on a GitHub Actions runner.

## One-time repository and account setup

1. Push the current work to a branch. Use a pull request to `master` when the
   change should receive the full review and CI path.
2. Open **Code → Codespaces** in the repository and create a Codespace from the
   branch or exact commit under test. Select the smallest machine that can run
   the Compose stack: 2 cores, 8 GB RAM, and 32 GB storage.
3. Set a short idle timeout. Stop the Codespace after testing and delete it
   when its database and broker data are no longer needed.
4. Add only test credentials as Codespaces secrets if email testing is needed.
   Use names such as `SPRING_MAIL_HOST`, `SPRING_MAIL_USERNAME`,
   `SPRING_MAIL_PASSWORD`, and `ALERTOPS_EMAIL_FROM`. Do not add production
   database, JWT, SMTP, or webhook credentials.

The test workflow in GitHub Actions does not need repository secrets. It creates
ephemeral database, broker, Redis, and JWT values for each run. SMTP is empty in
CI, so a CI pass proves startup and service connectivity but does not prove real
email delivery.

## What the free Codespaces plan can cover

The free plan is suitable for short, intermittent testing. It is not enough for
the full functional environment or an always-on staging server.

The target Codespace is the smallest available machine with at least 2 cores,
8 GB RAM, and 32 GB storage. Check the [available machine
types](https://docs.github.com/en/codespaces/customizing-your-codespace/changing-the-machine-type-for-your-codespace)
when creating it because availability can vary by repository and account. The
current Compose memory limits cap PostgreSQL, RabbitMQ, Redis, and the backend
at about 2.25 GB combined, leaving headroom for the Codespace tools, UI, Docker
overhead, and a small load generator. Two cores should be treated as a test
target, not a performance guarantee; the 5–10 RPS result must be measured.

For a personal GitHub Free account, GitHub currently includes 120 Codespaces
core-hours and 15 GB-month of storage. A 2-core Codespace consumes two
core-hours for each active hour, which is approximately 60 active Codespace
hours per month before storage and other usage are considered. A 15-minute test
session uses approximately 0.5 core-hours of compute. These allowances are
monthly quotas, not a promise of continuous availability. Free Codespaces are
included with personal accounts; organization accounts may have different
billing arrangements.

Codespaces also stop after the configured idle timeout, which defaults to 30
minutes, and each Codespace has a maximum lifetime of 12 hours. Stop the
Codespace after each test and delete unused Codespaces to control storage. Check
the current allowance and billing rules in GitHub's [included usage
table](https://docs.github.com/en/billing/reference/product-usage-included),
[Codespaces usage guidance](https://docs.github.com/en/codespaces/troubleshooting/troubleshooting-included-usage),
and [Codespace lifecycle documentation](https://docs.github.com/en/codespaces/about-codespaces/understanding-the-codespace-lifecycle).

The conclusion for this project is:

- Three concurrent escalations and a short 5–10 RPS test should fit in the
  smallest 2-core / 8-GB Codespace.
- Run the test for a defined window, such as 15 minutes, and record latency,
  errors, and memory behavior.
- A weekly schedule can be checked for its first occurrence and persistence,
  but the next real occurrence cannot be observed by leaving a free Codespace
  running for seven days.
- Do not use one Codespace as a continuously running staging environment or a
  durable webhook endpoint.
- Set a GitHub spending limit that stops usage when the included quota is
  exhausted if the account must remain free.

Use deterministic CI tests with an injected clock for the seven-day recurrence,
then use the persistent test host for the real elapsed-time and recovery check.

## Full functional test host requirements

Before calling the product functionally verified, provision a separate test
host with the following properties:

- Runs the same Docker Compose services continuously for at least one weekly
  cycle.
- Has persistent PostgreSQL, RabbitMQ, and Redis volumes plus a tested database
  backup and restore procedure.
- Provides a stable HTTPS UI and webhook endpoint with test-only credentials.
- Has a verified SMTP account for registration, acknowledgement, and escalation
  email journeys.
- Supports controlled application and host restarts while scheduled and pending
  work exists.
- Keeps test data and credentials separate from production.

The planned Oracle A1 production host is currently blocked by Mumbai capacity.
When a VM becomes available, use a separate test VM or an isolated test
deployment before treating it as production. Codespaces evidence can support
that rollout, but cannot replace the persistent-host checks.

## Start a Codespace test environment

Run these commands from the repository root inside the Codespace. The default
Codespace image should provide the required developer tools; if a command is
missing, install it in the Codespace or add a repository dev-container
configuration. Nothing needs to be installed on the local computer.

```bash
cp .env.example .env
```

Edit `.env` and replace every `replace-with-a-local-password` value. Generate a
JWT value and paste it into `JWT_SECRET_BASE64`:

```bash
openssl rand -base64 32
```

Use test-only SMTP settings when email links must be exercised. Keep the
repository's existing `ALERTOPS_*` and `SPRING_*` names. Do not commit `.env`.

Start the backend and its dependencies:

```bash
docker compose up --build -d
docker compose ps
curl --fail http://localhost:8096/actuator/health/liveness
curl --fail http://localhost:8096/actuator/health/readiness
```

Start the UI in a second terminal. Leave `VITE_API_BASE_URL` empty so Vite
proxies `/api` and `/actuator` to the backend inside the Codespace:

```bash
npm --prefix ui ci
npm --prefix ui run dev -- --host 0.0.0.0
```

Forward only these ports in the Codespaces Ports panel:

- `5173` for the UI.
- `8096` for short, controlled API or webhook tests.

Keep PostgreSQL `5432`, RabbitMQ `5672` and `15672`, and Redis `6379` private.
Codespaces forwards the UI request to the Vite server, and Vite proxies API
requests to the backend. A forwarded API port is not a durable public webhook
endpoint.

Set `ALERTOPS_UI_BASE_URL` in `.env` to the forwarded UI origin when email links
must open the Codespace UI. Compose passes this existing setting to the app for
the session. Do not use a forwarded Codespace URL in production configuration.

## Repeatable functional and load check

Run the checks in this order:

1. Confirm liveness, readiness, Flyway startup, PostgreSQL, RabbitMQ, and Redis.
2. Register a test user, create a team, create a task and response path, and
   start three escalations concurrently.
3. Send webhook events with unique `eventId` values at 5 requests per second,
   then 10 requests per second. The default per-webhook limit is 120 requests
   per minute, so set a higher test-only `ALERTOPS_WEBHOOK_RATE_LIMIT` in `.env`
   when the load generator needs more than that. Compose passes this existing
   setting to the app for the session.
4. Record HTTP status, p50/p95 latency, errors, escalation outcomes, duplicate
   event behavior, acknowledgement behavior, and the test duration.
5. Stop and restart the app while timers or retryable work are pending. Confirm
   that saved PostgreSQL state rebuilds timers and completed work is not
   duplicated.
6. Save only non-secret evidence: commit SHA, Codespace size, effective test
   settings, request rate, duration, latency, error count, and restart result.

The minimum acceptance target is three concurrent escalations and 5–10 requests
per second for a short representative run, such as 15 minutes. This is a test
of the current implementation, not a production capacity guarantee.

Clean up after the session:

```bash
docker compose down
```

Use `docker compose down -v` only when the test database, RabbitMQ state, and
Redis data should be deleted immediately. Stop or delete the Codespace so it no
longer consumes compute time.

## Branch and pull-request loop without tags

Use this loop for normal changes:

```bash
git switch -c test/my-change
git add <changed-files>
git commit -m "Describe the change"
git push --set-upstream origin test/my-change
```

The Compose smoke workflow runs on the branch push. Open a pull request to
`master` for review; the workflow runs again for the pull request. If the check
passes, create a Codespace from `test/my-change` for interactive verification.
The Codespace builds the current source with `docker compose up --build`; it
does not wait for a tag and does not pull a previously published production
image.

For a quick iteration, push another commit to the same branch. CI runs again
without a new tag, image release, or Oracle deployment. Use **Actions → Compose
smoke test → Run workflow** when a manual run is more convenient. The existing
image publication job remains limited to its configured non-PR branch events;
the testing workflow never pushes to GHCR.

## What CI proves and what it does not

The automated workflow performs these checks on a clean runner:

- Installs Node.js dependencies and builds and lints the UI.
- Builds the backend image from the branch source.
- Starts PostgreSQL, RabbitMQ, Redis, and the backend with Docker Compose.
- Waits for the backend liveness endpoint and collects service logs on failure.
- Removes all Compose containers and volumes after the run.

It does not prove real SMTP delivery, Codespaces port forwarding, long-running
timers while a Codespace is stopped, Oracle ARM64 compatibility, production
HTTPS, external backups, or host recovery. Those checks require the persistent
test host and remain part of the production release checklist.
