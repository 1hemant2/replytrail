import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getFlows } from '../../api/flows'
import { createWebhook, getWebhookEvents, getWebhooks, rotateWebhook, updateWebhook } from '../../api/webhooks'
import type { WebhookEvent } from '../../api/types'
import { useSession } from '../../app/useSession'
import { Button, Card, EmptyState, ErrorState, Field, InlineNotice, LoadingRows, PageHeader } from '../../components/Elements'
import { formatDate } from '../../lib/format'

// Manages team webhook configuration and the saved event history.
export function WebhooksPage() {
  const { teamId = '' } = useParams()
  const { team } = useSession()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [flowId, setFlowId] = useState('')
  const [newSecret, setNewSecret] = useState('')
  const [copied, setCopied] = useState(false)
  const webhooks = useQuery({ queryKey: ['webhooks', teamId], queryFn: getWebhooks })
  const flows = useQuery({ queryKey: ['flows', teamId], queryFn: getFlows })
  const canManage = team?.role === 'TEAM_OWNER' || team?.role === 'ADMIN'
  const create = useMutation({
    mutationFn: () => createWebhook({ name: name.trim(), flowId }),
    onSuccess: async result => {
      setName('')
      setFlowId('')
      setNewSecret(result.secret ?? '')
      setCopied(false)
      await queryClient.invalidateQueries({ queryKey: ['webhooks', teamId] })
    },
  })
  const rotate = useMutation({
    mutationFn: (id: string) => rotateWebhook(id),
    onSuccess: result => { setNewSecret(result.secret ?? ''); setCopied(false) },
  })
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => updateWebhook(id, enabled),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['webhooks', teamId] }) },
  })

  // Submits the webhook configuration form.
  function submit(event: FormEvent) {
    event.preventDefault()
    setNewSecret('')
    create.mutate()
  }

  return <>
    <PageHeader eyebrow="INTEGRATIONS / WEBHOOKS" title="Connect systems to response paths" description="Create a secure endpoint that turns an external event into an owned task and escalation run." />
    {!canManage && <InlineNotice>Only team owners and admins can manage webhook secrets and response paths.</InlineNotice>}
    {newSecret && <InlineNotice tone="warning"><strong>Copy this secret now.</strong> It is shown only after creation or rotation. <code>{newSecret}</code> <Button variant="quiet" onClick={() => { void navigator.clipboard?.writeText(newSecret); setCopied(true) }}>{copied ? 'Copied' : 'Copy secret'}</Button></InlineNotice>}
    <div className="webhook-setup-grid">
      <Card className="side-form-card webhook-create-card">
        <div className="card-heading"><div><span className="eyebrow">STEP 01 · SETUP</span><h2>Create a webhook</h2></div><span className="webhook-step-number">01</span></div>
        <p className="form-intro">Choose the default response path. A request can provide another same-team flow ID when needed.</p>
        <form onSubmit={submit} className="form-stack">
          <Field label="Webhook name"><input required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="HR request form" /></Field>
          <Field label="Default response path"><select required value={flowId} onChange={event => setFlowId(event.target.value)}><option value="">Choose a path</option>{flows.data?.map(flow => <option key={flow.id} value={flow.id}>{flow.name}</option>)}</select></Field>
          {create.error && <div className="form-error" role="alert">{create.error.message}</div>}
          <Button disabled={!canManage || create.isPending}>{create.isPending ? 'Creating…' : 'Create webhook'} <span>→</span></Button>
        </form>
      </Card>
      <WebhookIntegrationGuide />
    </div>
    <Card className="main-list-card webhook-list-card">
      <div className="webhook-list-heading"><div><span className="eyebrow">STEP 03 · MONITOR</span><h2>Configured webhooks</h2><p className="webhook-list-intro">Copy an endpoint, connect your sender, and inspect the tasks and runs created by each event.</p></div><div className="webhook-list-heading-meta"><span className="webhook-step-number">03</span><span className="count-pill">{webhooks.data?.length ?? '—'}</span></div></div>
      {webhooks.isPending ? <LoadingRows count={3} /> : webhooks.isError ? <ErrorState message={webhooks.error.message} onRetry={() => void webhooks.refetch()} /> : webhooks.data.length === 0 ? <EmptyState title="No webhooks yet" description="Create your first webhook above to let another system start a response path." /> : <div className="task-list" role="region" aria-label="Webhooks" tabIndex={0}>{webhooks.data.map(webhook => <WebhookRow key={webhook.id} webhook={webhook} flowName={flows.data?.find(flow => flow.id === webhook.defaultFlowId)?.name} teamId={teamId} canManage={canManage} onToggle={enabled => toggle.mutate({ id: webhook.id, enabled })} onRotate={() => rotate.mutate(webhook.id)} />)}</div>}
    </Card>
  </>
}

// Builds the exact event route that an external sender must call.
function webhookEventPath(webhookId: string) {
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? ''
  return `${apiBaseUrl}/api/v1/webhooks/${webhookId}/events`
}

// Explains the webhook request contract before users configure an integration.
function WebhookIntegrationGuide() {
  return <Card className="webhook-guide-card">
    <div className="webhook-guide-heading">
      <div><span className="eyebrow">HOW TO CONNECT A SENDER</span><h2>Send an event to start a response path.</h2><p>When another system detects work that needs attention, send one JSON request to the webhook route. ReplyTrail creates the task, starts the run, and emails the first recipient.</p></div>
      <span className="webhook-step-number">02</span>
    </div>
    <div className="webhook-guide-grid">
      <div className="webhook-guide-block">
        <span className="webhook-guide-label">REQUEST</span>
        <p><strong>Route</strong> Each configured webhook has its own route. Copy the exact route from that webhook row below.</p>
        <code className="webhook-route-code">POST /api/v1/webhooks/{'<webhookId>'}/events</code>
        <p><strong>Header</strong> Send the secret shown after creation or rotation. It is not included in later webhook listings.</p>
        <code className="webhook-header-code">X-AlertOps-Webhook-Secret: &lt;secret&gt;</code>
      </div>
      <div className="webhook-guide-block">
        <span className="webhook-guide-label">JSON BODY</span>
        <pre className="webhook-example">{`{
  "eventId": "incident-123",
  "taskName": "Checkout is timing out",
  "description": "Check the service and restore normal processing.",
  "source": "Payments monitor",
  "priority": "P1",
  "referenceUrl": "https://monitoring.example.com/incidents/123"
}`}</pre>
      </div>
    </div>
    <details className="webhook-guide-details">
      <summary>View all fields and supported types</summary>
      <div className="webhook-field-guide">
        <div><code>eventId</code><span>string · required · unique event/retry ID</span></div>
        <div><code>taskName</code><span>string · required · short task title</span></div>
        <div><code>description</code><span>string · required · work instructions</span></div>
        <div><code>source</code><span>string · required · sending system</span></div>
        <div><code>priority</code><span>string · optional · such as P1</span></div>
        <div><code>category</code><span>string · optional · such as Payments</span></div>
        <div><code>referenceUrl</code><span>string · optional · HTTP(S) link</span></div>
        <div><code>flowId</code><span>UUID string · optional · same-team path</span></div>
      </div>
    </details>
    <div className="webhook-guide-footer">
      <p><strong>What happens next?</strong> A new request returns <code>202</code> with a task ID and escalation ID. Retrying the same event with the same payload returns <code>200</code> and does not create a second run. Reusing the event ID with changed data returns <code>409</code>.</p>
      <p>Extra JSON fields are saved as event context. Keep the secret in the sender's secret manager and use HTTPS in a deployed environment.</p>
    </div>
  </Card>
}

// Loads and renders one webhook's recent or complete event history.
function WebhookRow({ webhook, flowName, teamId, canManage, onToggle, onRotate }: {
  webhook: { id: string; name: string; defaultFlowId: string; enabled: boolean; createdAt: string; lastTriggeredAt?: string | null }
  flowName?: string
  teamId: string
  canManage: boolean
  onToggle: (enabled: boolean) => void
  onRotate: () => void
}) {
  const events = useQuery({ queryKey: ['webhook-events', teamId, webhook.id], queryFn: () => getWebhookEvents(webhook.id) })
  const [endpointCopied, setEndpointCopied] = useState(false)

  // Copies the selected webhook endpoint for sender configuration.
  function copyEndpoint() {
    void navigator.clipboard?.writeText(webhookEventPath(webhook.id))
    setEndpointCopied(true)
  }

  return <article className="task-row">
    <span className="task-icon">↗</span>
    <div className="task-copy"><strong>{webhook.name}</strong><p>{webhook.enabled ? 'Enabled' : 'Disabled'} · Default path {flowName ?? webhook.defaultFlowId.slice(0, 8)}</p><small>Created {formatDate(webhook.createdAt)}{webhook.lastTriggeredAt ? ` · Last used ${formatDate(webhook.lastTriggeredAt)}` : ''}</small><div className="webhook-endpoint-row"><div><span className="webhook-guide-label">EVENT ROUTE</span><code>{webhookEventPath(webhook.id)}</code></div><Button variant="quiet" onClick={copyEndpoint}>{endpointCopied ? 'Copied' : 'Copy route'}</Button></div><WebhookEventHistory teamId={teamId} webhookId={webhook.id} events={events.data ?? []} isLoading={events.isPending} errorMessage={events.isError ? events.error instanceof Error ? events.error.message : 'Try again later.' : null} /></div>
    {canManage && <div className="webhook-actions"><Button variant="quiet" onClick={() => onToggle(!webhook.enabled)}>{webhook.enabled ? 'Disable' : 'Enable'}</Button><Button variant="quiet" onClick={onRotate}>Rotate</Button></div>}
  </article>
}

// Shows recent webhook events and lets users reveal the complete history.
function WebhookEventHistory({ teamId, webhookId, events, isLoading, errorMessage }: {
  teamId: string
  webhookId: string
  events: WebhookEvent[]
  isLoading: boolean
  errorMessage: string | null
}) {
  const [showAllEvents, setShowAllEvents] = useState(false)
  if (isLoading) return <small>Loading event history…</small>
  if (errorMessage) return <div className="form-error" role="alert">Couldn’t load event history: {errorMessage}</div>
  if (events.length === 0) return <small>No events received yet.</small>

  const visibleEvents = showAllEvents ? events : events.slice(0, 3)
  return <>
    <small>{events.length} event{events.length === 1 ? '' : 's'}</small>
    {events.length > 3 && <div className="webhook-event-controls"><Button variant="quiet" aria-expanded={showAllEvents} aria-controls={`webhook-events-${webhookId}`} onClick={() => setShowAllEvents(current => !current)}>{showAllEvents ? 'Show latest 3' : `View all ${events.length} events`}</Button></div>}
    <div className="webhook-event-list" role="region" aria-label="Webhook events" tabIndex={0} id={`webhook-events-${webhookId}`}>
      {visibleEvents.map(event => <details key={event.id}>
        <summary>{event.eventId} · {formatDate(event.receivedAt)}</summary>
        <p><Link to={`/app/${teamId}/tasks/${event.taskId}`}>Task {event.taskId.slice(0, 8)}</Link> · <Link to={`/app/${teamId}/escalations/${event.escalationId}`}>Run {event.escalationId.slice(0, 8)}</Link></p>
        <pre>{JSON.stringify(event.payload, null, 2)}</pre>
      </details>)}
    </div>
  </>
}
