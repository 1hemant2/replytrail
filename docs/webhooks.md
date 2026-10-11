# Webhook integration guide

ReplyTrail webhooks let another system tell ReplyTrail that work needs a
person's attention. The sender makes one HTTP request; ReplyTrail creates a
task, starts an escalation run on the configured response path, and sends the
first notification to the first eligible recipient.

The webhook does not inspect or change the external system. Put the link and
instructions a person needs in the task description or `referenceUrl`, then
let the response path decide who is notified next when nobody acknowledges.

## The five-minute setup

You need:

- A ReplyTrail team with at least one member.
- A response path with one or more steps. Each step must use a member of that
  team.
- Team owner or administrator access to configure the webhook.
- A sender that can make an HTTPS `POST` request to your ReplyTrail API.

### 1. Create the webhook

1. Sign in to ReplyTrail and select the team that owns the integration.
2. Open **Webhooks**.
3. Enter a name such as `Production monitoring`.
4. Choose the default response path.
5. Create the webhook and copy the secret immediately.

ReplyTrail shows the raw secret only after creation or rotation. It is not
shown again when webhooks are listed. Store it in the sender's secret manager
or environment variables; do not put it in source code, a URL, or a log.

The webhook URL is:

```text
https://YOUR-REPLYTRAIL-HOST/api/v1/webhooks/WEBHOOK_ID/events
```

The `WEBHOOK_ID` is the UUID shown for the webhook. The secret is sent in the
`X-AlertOps-Webhook-Secret` header. The `AlertOps` part is a compatibility
identifier retained by the API even though the product is now called
ReplyTrail.

### 2. Send one event

This is a complete request that can be copied into a terminal after replacing
the URL and secret:

```bash
export REPLYTRAIL_WEBHOOK_URL='https://YOUR-REPLYTRAIL-HOST/api/v1/webhooks/WEBHOOK_ID/events'
export REPLYTRAIL_WEBHOOK_SECRET='copy-the-secret-from-replytrail'

curl --request POST "$REPLYTRAIL_WEBHOOK_URL" \
  --header 'Content-Type: application/json' \
  --header "X-AlertOps-Webhook-Secret: $REPLYTRAIL_WEBHOOK_SECRET" \
  --data '{
    "eventId": "checkout-timeout-2026-10-11-0001",
    "taskName": "Checkout requests are timing out",
    "description": "Check the checkout service logs and restore normal request processing.",
    "source": "Payments monitor",
    "priority": "P1",
    "category": "Payments",
    "referenceUrl": "https://monitoring.example.com/incidents/checkout-timeout-0001",
    "service": "checkout-api",
    "region": "ap-south-1"
  }'
```

The first four fields are required. The last two fields in this example are
custom context: ReplyTrail keeps them in the saved event, but does not try to
interpret them as task fields.

A successful new event returns `202 Accepted` and IDs that help you follow the
run:

```json
{
  "webhookId": "11111111-1111-1111-1111-111111111111",
  "eventId": "checkout-timeout-2026-10-11-0001",
  "flowId": "22222222-2222-2222-2222-222222222222",
  "taskId": "33333333-3333-3333-3333-333333333333",
  "escalationId": "44444444-4444-4444-4444-444444444444",
  "replayed": false
}
```

`taskId` identifies the reusable task record. `escalationId` identifies this
particular run through the response path. Use the escalation ID when you need
to investigate what happened to this notification sequence.

### 3. Confirm the result

After the request succeeds:

1. Open **Webhooks** and find the saved event.
2. Open its task link and run link.
3. Confirm that the first recipient received the email.
4. Open the run history to see acknowledgement, escalation, and resolution
   activity.

The API response means ReplyTrail accepted and saved the event. It does not
mean that the recipient has opened or read the email. SMTP acceptance and
recipient delivery are separate steps.

## Event fields

Send a JSON object. Field names are case-sensitive.

| Field | Required | Meaning | Limit |
| --- | --- | --- | --- |
| `eventId` | Yes | A stable ID from the sender for this external event. It is the retry/idempotency key. | 255 characters |
| `taskName` | Yes | The short title shown to the recipient. | 120 characters |
| `description` | Yes | The action the recipient should take. | 1,000 characters |
| `source` | Yes | The system or process that created the event, such as `Payments monitor`. | 120 characters |
| `priority` | No | A label such as `P1`, `VIP`, or `Today`. | 20 characters |
| `category` | No | A short grouping such as `Payments` or `Onboarding`. | 80 characters |
| `referenceUrl` | No | An `http://` or `https://` link to the source record or dashboard. | 2,048 characters |
| `flowId` | No | A different response path to use for this event. It must belong to the same team as the webhook. | UUID |
| Any other JSON field | No | Additional context saved with the event for later investigation. | Within the total body limit |

Required and optional text fields must be JSON strings. A blank required field
is treated as missing. `referenceUrl` must use HTTP or HTTPS. If `flowId` is
omitted, ReplyTrail uses the default path selected when the webhook was
created.

Do not send an `escalationId` to choose a path. ReplyTrail generates the
escalation ID after it accepts the event; `flowId` is the reusable path ID.

## Retries and duplicate events

Use the same `eventId` for every retry of the same external event. Do not make
up a new ID when the sender times out, receives a `5xx`, or loses the response.
Resend the same body when possible.

| Situation | Result |
| --- | --- |
| First request with a new `eventId` | `202`, one task, one run, and one saved event. |
| Retry with the same `eventId` and same payload | `200`, the original IDs, and `"replayed": true`; no second run is created. |
| Same `eventId` with changed data | `409`; no new task or run is created. |

This means a sender can safely retry a request without accidentally sending a
second escalation. Keep the external event ID unique for the source event,
not for each HTTP attempt.

## Choosing a different response path

Most integrations should omit `flowId` and use the configured default path.
Include `flowId` only when the sender knows which path should handle the event:

```json
{
  "eventId": "new-vip-customer-42",
  "taskName": "VIP customer needs onboarding",
  "description": "Contact the customer and complete the onboarding checklist.",
  "source": "CRM",
  "flowId": "22222222-2222-2222-2222-222222222222"
}
```

The selected path must belong to the same team as the webhook. A foreign or
unknown path is rejected before a task or run is created.

## HTTP responses and troubleshooting

| Status | Meaning | What to check |
| --- | --- | --- |
| `202 Accepted` | New event saved and run started. | Follow `taskId` and `escalationId`. |
| `200 OK` | Safe replay of an already accepted event. | Confirm `replayed` is `true`; do not create another event ID. |
| `400 Bad Request` | JSON or a field is invalid. | Check the JSON object, required fields, field types, lengths, URL, and `flowId`. |
| `401 Unauthorized` | The secret is missing or invalid, or the webhook is disabled. | Use the current secret in the exact `X-AlertOps-Webhook-Secret` header; rotate it if it was lost. |
| `404 Not Found` | The webhook ID is unknown. | Copy the ID from the Webhooks page and check the API host. |
| `409 Conflict` | The event ID was already used with different data. | Reuse the original payload or choose a new ID for a genuinely new event. |
| `413 Payload Too Large` | The serialized body is over the configured limit. | Reduce the body or change `ALERTOPS_WEBHOOK_MAX_BODY_BYTES`. |
| `429 Too Many Requests` | The webhook exceeded its request budget. | Slow down and retry later, or review `ALERTOPS_WEBHOOK_RATE_LIMIT`. |
| `5xx` | The server could not complete the request. | Retry with the same `eventId` and payload; inspect server health and logs if it continues. |

The default limit is 64 KiB per request and 120 requests per webhook per
minute. Redis shares rate-limit counters across application instances. Without
Redis, the fallback counter applies separately to each instance, so do not
treat that fallback as a complete multi-instance abuse-control boundary.

## Disable, rotate, and inspect events

- **Disable:** Stops new events from being accepted. It does not cancel runs
  that were already created.
- **Rotate:** Replaces the secret immediately. Update the sender before its
  next request; the old secret stops working.
- **Inspect:** The Webhooks page shows the latest three events by default and
  lets team members reveal older events. Each event keeps its full JSON body
  and links to the task and escalation run it created.

Only team owners and administrators can create, rotate, or enable/disable a
webhook. Team members can inspect events for their selected team according to
the normal team access rules.

## Security checklist

- Use HTTPS for every deployed webhook URL.
- Store the secret in a secret manager or protected environment variable.
- Send it in the header, never in the query string or JSON body.
- Do not log the secret or full payload if the payload contains personal or
  confidential data.
- Keep `eventId` free of passwords, tokens, or sensitive personal data because
  it appears in event history and responses.
- Keep the webhook endpoint private while testing. A local `localhost` URL is
  reachable only by a sender on the same machine; an external provider needs a
  controlled public HTTPS endpoint.

## Configuration API for automation

The Webhooks page is the easiest way to create an integration. If you automate
team setup, these configuration routes require a normal ReplyTrail login JWT
and owner/admin permissions:

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/team/webhooks` | Create with `{ "name": "...", "flowId": "..." }`; the response contains the one-time secret. |
| `GET` | `/api/v1/team/webhooks` | List webhook configuration without secrets. |
| `POST` | `/api/v1/team/webhooks/{webhookId}/rotate` | Rotate and return a new one-time secret. |
| `PATCH` | `/api/v1/team/webhooks/{webhookId}` | Enable or disable with `{ "enabled": true }`. |
| `GET` | `/api/v1/team/webhooks/{webhookId}/events` | List saved events for the selected team. |
| `GET` | `/api/v1/team/webhooks/{webhookId}/events/{eventRecordId}` | Read one saved event. `eventRecordId` is the stored event UUID, not the sender's `eventId`. |

The event intake route is intentionally different: it does not require a
login JWT, but it always requires the webhook secret.

## Quick integration test

Before connecting a production sender, verify all of these cases with a test
webhook:

1. Send a new event and confirm `202`, one task, one run, and one email.
2. Send the exact same event again and confirm `200` with `replayed: true`.
3. Change the description but keep the same `eventId` and confirm `409`.
4. Disable the webhook and confirm new events return `401`.
5. Re-enable it, rotate the secret, and confirm the old secret fails while the
   new secret succeeds.

For release testing, also verify the journey after an application restart and
with concurrent duplicate deliveries. The local unit tests cover the core
validation and idempotency rules, but a deployed test is still needed to prove
real database, Redis, SMTP, and network behavior.
