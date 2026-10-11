# ReplyTrail

**Keep every response on track.**

The source repository is [1hemant2/replytrail](https://github.com/1hemant2/replytrail).

ReplyTrail is a self-hosted web application for team response coordination. Turn an alert or request into a task, choose an ordered path of people to notify, and track the response from the first email to acknowledgement or resolution. If nobody responds within the configured wait, the run advances to the next person.

It helps teams answer three questions: **Who should respond? When should the next person be notified? What happened to this request?** A team member can start a run in the UI, schedule it for later, or let an external system trigger it through a webhook. This repository contains the React UI, Spring Boot API and workers, database migrations, and deployment configuration.

## Use cases

Use ReplyTrail whenever work needs a clear owner and a next action. A run can
start immediately, start once at a future date, or repeat on the same local
calendar time every day or week. Each email follows the same ordered path: the
first owner receives the task and the next owner is notified if the response
wait expires. Acknowledgement completes the run when resolution timeouts are
disabled; when enabled, it pauses escalation while the owner finishes the work
and confirms resolution.

### Event-driven and one-time follow-up

- Website or app problems: Email the service owner and then the team lead if nobody responds.
- New customer help: Ask customer success to finish setup, with an onboarding lead as the fallback.
- IT help: Follow up on login, access, or work-tool requests.
- Failed jobs or backups: Ask the responsible engineer to investigate a failed import, pipeline, backup, or restore.
- Unanswered support requests: Keep a customer request visible until someone acknowledges it or the path is exhausted.
- Security problems: Route a reported security issue to a reviewer and then the security lead.
- Payment or invoice problems: Give billing a clear owner before a customer account is affected.
- Upcoming renewals: Schedule a one-time reminder before a certificate, contract, or subscription expires.
- Late deliveries and office repairs: Give purchasing or facilities a follow-up path when a promised delivery or repair is late.
- Future decisions: Schedule a one-time reminder to check back on a pending decision next week.

### Recurring follow-up

- Daily operational checks: Create a daily run for a morning health check, backup review, or opening checklist.
- Daily handovers: Ask the outgoing shift owner to record open issues in the handover document; notify the supervisor if nobody takes responsibility.
- Daily stock checks: Ask the storekeeper to check essential supplies and record shortages; use the warehouse lead as the fallback.
- Weekly compliance reviews: Create a weekly run for access reviews, security checks, invoice checks, or reporting deadlines.
- Weekly payment reviews: Ask accounts receivable to review unpaid invoices in the billing system and assign follow-ups; notify the finance lead if the review is missed.
- Weekly report submissions: Ask the report owner to publish a weekly status report before the team meeting, with the team lead as the fallback.
- Recurring customer follow-ups: Remind an account owner every week until the customer confirms the next step.
- Personal routines: Send yourself a daily reminder for a recurring task and stop future runs when the routine is no longer needed.

Recurring schedules create a new independent escalation ID for each occurrence.
Runs can overlap safely, and stopping future repeats does not cancel a run that
has already been created. Acknowledging or resolving one occurrence does not
stop the schedule; use **Stop future repeats** on the original run. Daily means
every calendar day, including weekends; weekly repeats on the original local
weekday and time. Monthly, yearly, custom-interval, and cron schedules
are not part of the current minimum feature.

Add a task describing what needs attention, choose who should receive the
emails and how long to wait, then start it now or choose a future start time.
Everyone receiving emails must be a member of your ReplyTrail team.

You can also connect another tool through a webhook to send tasks to ReplyTrail.
That tool detects the problem and sends the details; ReplyTrail emails the
people you choose. They carry out the work in the relevant app or system.

### Example: ten reminders spaced one day apart

Create a flow with ten steps and put your own team-member email on every step.
Set each wait to **1,440 minutes (24 hours)** and leave **resolution timeout**
disabled. Start it with the task you want to be reminded about.

The first reminder is sent as soon as the run starts. Each later reminder is a
response step in the same escalation and becomes due 24 hours after the
previous email is sent. If you click **Acknowledge** and confirm, the remaining
steps stop. This is a finite ten-step reminder sequence, not a recurring
schedule.

If you do not acknowledge, the ten-step sequence continues and then ends.
Delivery delays or downtime can change when emails arrive, so they may not
reach you at the same clock time every day.

### Example: a weekly review

Choose **Schedule for later**, select the next local review time, and choose
**Every week**. ReplyTrail sends the first email at that time and creates the
next weekly run from the same task and response path. Every occurrence has its
own acknowledgement, resolution, activity history, and escalation ID. Use
**Stop future repeats** on the original run when the review is no longer needed.

For a payment review, put the billing-system link and review instructions in
the task. Assign the first step to the accounts receivable owner with a
60-minute acknowledgement wait and the next step to the finance lead. Schedule
the first run for a future Friday at 10:00 in the team's timezone and choose
**Every week**. Each Friday, the owner receives the request; if nobody
acknowledges within 60 minutes of delivery, the finance lead receives it.
Enable resolution timeouts if acknowledgement should also require a separate
confirmation that the review is finished.

ReplyTrail asks people to perform and confirm the work. People inspect stock,
review invoices, and submit reports in their own tools; recurring schedules
send the request even when there is no new external event.

## Core concepts

| Concept | Meaning |
| --- | --- |
| Team | A workspace containing its members, tasks, paths, webhooks, and runs. |
| Task | The work that needs a response: title, description, source, and optional context. |
| Response path | A reusable, ordered sequence of team-member recipients and configured timing. Called a flow in the API and code. |
| Escalation run | One execution of a task through a path, with saved progress and history. |
| Acknowledgement | A recipient accepts responsibility; it completes the run or starts a resolution window, depending on the path settings. |
| Resolution | Completion of the issue after acknowledgement when resolution timeout is enabled. |

## Features

The [feature guide](docs/features.md) explains each feature's purpose, actors,
workflow, lifecycle rules, API area, and verification status.

- **Accounts and teams:** Registration requires email verification before login. Users can belong to multiple teams. Owners and admins can invite members; admins can invite users only. Acceptance requires the invited, verified email address.
- **Tasks:** Name, description, and source, plus optional priority, category, and HTTP(S) reference URL. Priority is a user-defined label. Manually created tasks default to source `Manual`.
- **Response paths:** Ordered steps with a team-member recipient and wait time, plus optional resolution timeouts. Add, edit, delete, and drag steps to reorder them. Started runs retain their saved task context, step details, and timing when a task or path changes.
- **Immediate, scheduled, and recurring runs:** Start a run from a task and path immediately, schedule a one-time start using a date, time, and IANA timezone, or repeat a schedule daily or weekly. Reschedule, cancel, stop future repeats, or start a scheduled run early before it begins. The first email is sent immediately when the run starts; its configured acknowledgement wait begins after delivery.
- **Webhooks:** Owners and admins can create a webhook with a default path, rotate its secret, and enable or disable it. An incoming event creates a task and starts a run. The complete JSON event is stored with links to both records.
- **Acknowledgement and resolution:** Recipient-scoped email links open a preview before confirmation. Acknowledgement either completes the run or pauses later steps for a configured resolution window. Unresolved timeouts resume escalation; resolution stops remaining steps.
- **Manual escalation:** Escalate now makes the next eligible response step due immediately from the signed-in UI or an eligible email action link.
- **Activity history:** Run details show saved step progress and chronological milestones, including notification attempts, acknowledgement, resolution, and manual actions. Repeated delivery retries are grouped for readability.
- **Recovery:** PostgreSQL-backed schedules and pending publications recover after restart. Scheduled-start failures create durable email-notification obligations for the scheduler owner and team administrators.

## Current scope

- Notifications use **SMTP email**. SMS, phone calls, push notifications, and native Slack/Teams delivery are not implemented.
- Scheduling supports one-time starts and the minimum daily/weekly recurrence implementation. Monthly, yearly, custom-interval, and cron schedules are not implemented. A finite reminder sequence can still use multiple steps assigned to the same person, as in the ten-reminder example above.
- A response path names individual team-member recipients; rotating on-call calendars are not implemented.
- Opening an email link does not accept responsibility automatically; the recipient must confirm the action.
- Local checks do not establish production readiness. Database/broker integration checks and deployed response journeys are tracked in the launch checklist.

## How an escalation runs

```text
Manual task + selected path ─┐
                             ├─> task + run ─> step due time saved in PostgreSQL
Webhook event + path ─────────┘                         │
                                                       v
                                            in-memory timer reaches due time
                                                       │
                                                       v
                                            RabbitMQ ready-work queue
                                                       │
                                                       v
                                            consumer checks saved state
                                                       │
                                                       v
                                         SMTP email, next step or acknowledgement
```

PostgreSQL stores tasks, paths, events, runs, step states, and due times. The backend uses in-memory timers for waiting steps, then publishes ready work to RabbitMQ. It confirms publication and retries failed publications. On startup it reconstructs pending timers from saved database state. RabbitMQ holds ready work and handles consumer retries; it is not a delayed queue. Redis holds short-lived workflow state and supports shared webhook rate limiting.

`SENT` means the SMTP server accepted the email, not that it reached an inbox. If SMTP accepts a message and the app stops before saving `SENT`, a retry can send it again.

## Technology stack

| Component | Technology and responsibility |
| --- | --- |
| Web UI | React 19, TypeScript, Vite, React Router, TanStack Query, and Tailwind CSS |
| API and workers | Java 17 target, Spring Boot 4.0.8, Spring Security, and JWT authentication |
| Durable storage | PostgreSQL with Spring Data JPA and Flyway schema migrations |
| Ready-work delivery | RabbitMQ; database-backed timers determine when work becomes ready |
| Short-lived shared state | Redis for workflow intents and webhook rate limiting |
| Email | Spring Mail with an SMTP provider |
| Packaging and deployment | Docker Compose for Codespaces testing and planned VM hosting; GitHub Actions for branch verification and image scanning |

The UI can be deployed as static files separately from the backend. Existing `com.alertops` packages, `ALERTOPS_*` settings, container/resource names, and the `X-AlertOps-Webhook-Secret` header are retained compatibility identifiers from the earlier product name. Use these exact identifiers in configuration and integrations.

## Run in GitHub Codespaces

Short interactive development and load checks run in GitHub Codespaces. Full
functional verification requires a persistent test host. The local computer
only needs Git and a browser; Docker, Java, Node.js, Maven, and load testing
tools are not local prerequisites. Follow the [Codespaces and CI testing
guide](docs/deployment/codespaces-and-ci.md) for the Codespace workflow and
persistent-host requirements.

### Configure email

Set these in `.env` before starting the backend:

```dotenv
SPRING_MAIL_HOST=smtp.example.com
SPRING_MAIL_PORT=587
SPRING_MAIL_USERNAME=your-smtp-login
SPRING_MAIL_PASSWORD=your-smtp-password
ALERTOPS_EMAIL_FROM=verified-sender@example.com
ALERTOPS_UI_BASE_URL=http://localhost:5173
```

SMTP authentication and STARTTLS default to enabled. For implicit TLS on port 465, set `SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_ENABLE=true` and `SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=false`. The sender must be permitted by your SMTP provider and can differ from the SMTP login. The UI URL is used in verification, invitation, and acknowledgement links.

The terminal startup loads all `.env` values. Compose forwards the SMTP values,
sender, UI base URL, and webhook rate limit to the app. Without working SMTP
settings, email-dependent flows cannot complete.

### First use

1. Register, verify the address from the email, and log in.
2. Create or select a team. Invite team members from **Members** if they should receive response steps.
3. Create a task with a meaningful source and description.
4. Create a response path with at least one step assigned to a team member.
5. On **Escalations**, choose the task and path, then select **Start immediately** or **Schedule for later**. For a future start, leave it one-time or choose **Every day** or **Every week** to create independent recurring runs.
6. Open the run details to follow saved step progress and activity history. In the email, confirm acknowledgement; if the path requires resolution, resolve before the displayed deadline to stop later notifications.

## Trigger a task through a webhook

The complete setup, field reference, retry behavior, response codes, security
guidance, and troubleshooting steps are in the [webhook integration guide](docs/webhooks.md).
The short example below is enough to send a first test event.

```bash
curl -X POST "http://localhost:8096/api/v1/webhooks/<webhook-id>/events" \
  -H 'Content-Type: application/json' \
  -H 'X-AlertOps-Webhook-Secret: <webhook-secret>' \
  -d '{
    "eventId": "request-123",
    "taskName": "New onboarding request",
    "description": "A new customer needs a welcome call.",
    "source": "Signup form",
    "priority": "Today",
    "category": "Onboarding",
    "referenceUrl": "https://example.com/requests/123",
    "customerId": "cust-456"
  }'
```

The event route does not require a login JWT, but it checks
`X-AlertOps-Webhook-Secret`. The server stores only the secret hash and shows
the raw value only on creation or rotation. A new event returns HTTP `202`;
retrying the same `eventId` and payload returns the existing task and run with
HTTP `200`; reusing the ID with different data returns HTTP `409`.

## Configuration and operations

| Setting | Purpose | Default |
| --- | --- | --- |
| `JWT_SECRET_BASE64` | Required JWT signing key | None |
| `ALERTOPS_CORS_ALLOWED_ORIGINS` | Allowed browser UI origins, comma separated | `http://localhost:5173` |
| `ALERTOPS_UI_BASE_URL` | Origin used in emailed links | `http://localhost:5173` |
| `ALERTOPS_EMAIL_VERIFICATION_TTL` | Verification link lifetime | `30m` |
| `ALERTOPS_ACKNOWLEDGEMENT_TTL` | Acknowledgement link lifetime | `72h` |
| `ALERTOPS_WEBHOOK_MAX_BODY_BYTES` | Maximum serialized webhook JSON size | `65536` |
| `ALERTOPS_WEBHOOK_RATE_LIMIT` | Requests per webhook per minute | `120` |
| `ALERTOPS_SCHEDULER_MAX_ACTIVE_TIMERS` | Maximum admitted active timers | `10000` |
| `ALERTOPS_SCHEDULER_RECOVERY_BATCH_SIZE` | Pending steps per recovery batch | `10000` |

The backend also reads `SPRING_DATASOURCE_*`, `SPRING_RABBITMQ_*`, `SPRING_DATA_REDIS_*`, and `SPRING_MAIL_*` settings. See [`application.properties`](src/main/resources/application.properties) and [`application-prod.properties`](src/main/resources/application-prod.properties) for other scheduler, consumer, timeout, and port settings. Compose forwards only the variables listed in its `app.environment`; add entries for other overrides when running in Docker.

The backend exposes Actuator health at `http://localhost:8096/actuator/health` and scheduling status at `/actuator/scheduling`. Health is public; scheduling status requires authentication. The production profile runs Flyway migrations and checks entity mappings against the schema.

Stop Compose services with `docker compose down`. `docker compose down -v` also deletes their PostgreSQL, RabbitMQ, and Redis volumes and stored data.

## Development checks

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow
and [SECURITY.md](SECURITY.md) before reporting a potential vulnerability.

From the repository root:

```bash
./mvnw --batch-mode --no-transfer-progress verify
npm --prefix ui ci
npm --prefix ui run build
npm --prefix ui run lint
```

The backend command runs tests and packages the application; the UI build checks TypeScript and produces static assets in `ui/dist/`. Integration suites for PostgreSQL, RabbitMQ, and Redis are opt-in and need running services. A passing default build can include skipped integration tests; see the suite setup in [`src/test/java/com/alertops/`](src/test/java/com/alertops/) and the [launch checklist](docs/product-launch-readiness.md) before interpreting it as a release result.

## Repository and release status

- [`src/main/java/com/alertops/`](src/main/java/com/alertops/): Spring Boot API and workers.
- [`src/test/java/com/alertops/`](src/test/java/com/alertops/): backend unit, API, and opt-in integration tests.
- `src/main/resources/db/migration/`: Flyway database migrations.
- `ui/`: React 19, TypeScript, and Vite client.
- `docker-compose.yml`: Codespaces test backend and dependency stack.
- `.github/workflows/ci.yml`: Maven verification, container build, and Trivy image scan on pull requests and configured branch pushes.
- [`docs/product-launch-readiness.md`](docs/product-launch-readiness.md): release checklist and remaining end-to-end checks.
- [`docs/features.md`](docs/features.md): human- and AI-readable feature guide.
- [`docs/webhooks.md`](docs/webhooks.md): step-by-step webhook integration guide.
- [`docs/deployment/README.md`](docs/deployment/README.md): first-release hosting and Docker Compose deployment direction.
- [`docs/deployment/shared-oracle-test-production-plan.md`](docs/deployment/shared-oracle-test-production-plan.md): implementation plan for the logically isolated shared Oracle host.
- [`docs/deployment/codespaces-and-ci.md`](docs/deployment/codespaces-and-ci.md): Codespaces setup and branch/PR testing without tag deployments.
- [`docs/deployment/hosting-request.md`](docs/deployment/hosting-request.md): an unsent open-source test-hosting request and application preparation guidance.
- [`CHANGELOG.md`](CHANGELOG.md): completed repository changes and verification notes.

Manual and webhook response flows, one-time scheduling, resolution timeouts, manual actions, and activity history are implemented locally. The release checklist still calls for deployed end-to-end runs, including restart and duplicate-delivery scenarios. Domain ownership, sender verification, and rebrand rollout are tracked in the [product rebranding plan](docs/product-rebranding-plan.md).
