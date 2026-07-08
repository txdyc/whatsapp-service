# Real-Time Chat Dialog Updates — Design Spec

**Date:** 2026-07-08
**Status:** Approved (pending spec review)

## Problem

In the agent workspace, the message thread for a conversation does not update on its own. An agent must refresh the page to see new messages — both incoming customer messages and the AI's replies. This makes it impossible to watch an AI-handled conversation unfold live.

## Root Cause

The frontend is already fully wired for real-time updates. `WorkspacePage` subscribes to a `new_message` socket event and, when the event's `conversationId` matches the open conversation, invalidates the `['conversation', id]` query so React Query refetches the thread ([web/src/pages/WorkspacePage.tsx:33-41](../../../web/src/pages/WorkspacePage.tsx)).

The gap is on the backend: the `new_message` event is emitted **only** inside the human-mode branch of the message pipeline ([src/modules/pipeline/message.pipeline.ts:51-58](../../../src/modules/pipeline/message.pipeline.ts)). Current coverage:

| Message | Saved to DB | Emits `new_message`? | Live in dialog today? |
|---|---|---|---|
| Customer message — AI mode | yes | no | no (needs refresh) |
| AI bot reply — AI mode | yes | no | no (needs refresh) |
| Customer message — human mode | yes | yes | yes |
| Agent reply | yes | no | only in the sending agent's own tab (via mutation invalidate) |

The first two rows are exactly the user's complaint.

## Goal

The open chat dialog updates live — without a page refresh — for all message types (customer, AI, agent). Backend-only change; no frontend changes required.

**Explicitly out of scope:** live updates to the conversations *list* page, and per-conversation socket rooms / multi-agent scaling.

## Approach

Chosen approach: **invalidate-and-refetch** — emit `new_message` carrying the `conversationId`; the frontend refetches the thread. This matches the pattern already in place, keeps the server as the source of truth, and is the smallest change.

Rejected alternatives:
- **Push-and-append** (emit full message, append client-side without refetch): snappier but adds ordering/dedup/cache-mutation complexity and diverges from the current pattern. Not worth it at current scale.
- **Polling**: not truly real-time and wasteful when a working socket setup already exists.

## Event Contract (unchanged)

Event name: `new_message`
Payload: `{ conversationId: string, message: { role: 'user' | 'bot' | 'agent', content: string } }`

The frontend keys off `conversationId` only; the `message` field is included for consistency with the existing emit and possible future use, but is not required by current consumers.

## Changes

### 1. `MessagePipeline` — emit for AI-mode messages
File: `src/modules/pipeline/message.pipeline.ts`

- Move the `new_message` emit for the **customer message** to immediately after the message is saved to DB/session, **before** the human/AI branch, so it fires in both modes. This removes today's human-only emit — the customer message is broadcast exactly once in either mode (no duplication).
- After the **AI reply** is persisted (current step 11), emit a second `new_message` with `role: 'bot'`.

Resulting behavior: an agent watching an AI conversation sees the customer's message appear, then the AI's reply appear a moment later when the LLM responds. If the conversation is human-mode, only the customer-message emit fires (the pipeline returns before AI processing, as today). If the LLM call fails and triggers the fallback/handoff, no bot-reply emit fires (no bot message is saved), which is correct.

### 2. Agent replies broadcast
File: `src/modules/admin/conversations.controller.ts`

- Inject a `socketEmit` dependency into `conversationsRoutes` (mirroring the DI pattern the pipeline already uses via `app.io.emit`), threaded through `src/modules/admin/admin.plugin.ts` and `src/app.ts`.
- In the `POST /admin/conversations/:id/reply` handler, after the agent message is saved, emit `new_message` with `{ conversationId: id, message: { role: 'agent', content: message } }`.

Effect: any tab viewing that conversation updates live — not just the tab that sent the reply. (The sending tab already updates via its mutation's `onSuccess` invalidate; the socket emit adds coverage for other viewers and is harmless duplication for the sender.)

## Data Flow (after change)

1. Customer message arrives → pipeline saves it → **emits `new_message`** → every open dialog for that conversation refetches and shows it.
2. AI mode: pipeline generates a reply, saves it → **emits `new_message`** → dialog refetches and shows the AI reply.
3. Agent reply: controller saves the agent message → **emits `new_message`** → all viewing tabs refetch.

## Testing

- **Pipeline tests** (`tests/modules/pipeline/message.pipeline.test.ts`):
  - Update the existing test `'does NOT emit new_message when conversation is in ai mode'` — it asserts the opposite of the new behavior. It becomes: in AI mode, `socketEmit` is called with `new_message` for the customer message **and** for the AI reply.
  - Confirm the human-mode test still emits `new_message` for the customer message exactly once.
- **Conversations controller test** (`tests/modules/admin/conversations.controller.test.ts`, new): assert that `POST /reply` emits `new_message` with `role: 'agent'` after saving the message, using an injected `socketEmit` spy.

## Risks / Notes

- `io.emit` broadcasts to all connected clients; the frontend filters by `conversationId`. This is fine at the current scale (a handful of agents). Per-conversation rooms are a future optimization, deliberately out of scope.
- The sender's own tab may refetch twice (mutation invalidate + socket emit). This is harmless.
