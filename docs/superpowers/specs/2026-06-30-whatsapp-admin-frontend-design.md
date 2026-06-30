# WhatsApp AI Customer Service — Admin Frontend Design Spec

**Date:** 2026-06-30
**Status:** Approved (pending implementation plan)
**Scope:** React admin dashboard in `web/` — frontend only, plus one small backend WebSocket patch.

## Overview

The backend (branch `feat/backend-implementation`) is complete and exposes a JWT-protected admin API plus a Socket.io WebSocket. This spec defines the React admin dashboard that agents and admins use to monitor conversations, take over from the AI, and manage the knowledge base.

**v1 scope (confirmed):** matches the existing backend — Login, Dashboard, Conversation Management, Agent Workspace (real-time chat), Knowledge Base. The Settings page from the original product design is **deferred** (no backend endpoints exist yet).

## Decisions (confirmed during brainstorming)

| Decision | Choice |
|----------|--------|
| Feature scope | Match existing backend: Login + Dashboard + Conversations + Agent Workspace + Knowledge Base. Settings deferred. |
| Real-time strategy | Add a small backend `new_message` emit; frontend consumes via Socket.io (not polling). |
| UI style | Tailwind + shadcn-style components (Radix primitives + cva). |
| UI language | English. |

## Tech Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Build | React 18 + TypeScript + Vite | Per project design; fast HMR |
| Styling / components | Tailwind CSS + shadcn-style components (Radix + cva) | Reusable, controllable, customizable |
| Routing | React Router v6 | Protected routes, nested layout |
| Server state | TanStack Query | Caching, refetch, fits REST cleanly |
| Forms | React Hook Form + Zod | Login + knowledge editing validation |
| Real-time | socket.io-client | Connects to `/ws`, listens for `handoff` + `new_message` |
| Auth state | Lightweight Context/Zustand + localStorage for JWT | No heavy state library needed |

## Directory Structure

Fills the currently-empty `web/` directory (the backend design already reserves it):

```
web/
├── src/
│   ├── components/
│   │   ├── ui/          # shadcn atoms: Button, Input, Dialog, Table, Badge, Toast, Card
│   │   └── layout/      # AppShell (sidebar + topbar), ProtectedRoute
│   ├── pages/           # Login, Dashboard, Conversations, Workspace, Knowledge
│   ├── services/        # apiClient (JWT interceptor), socket, query hooks
│   ├── lib/             # auth store, utils
│   ├── App.tsx          # route table
│   └── main.tsx
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

`web/` is a separate package from the backend `package.json`.

## Pages & API Mapping

All admin endpoints require `Authorization: Bearer <jwt>`.

### Login — `POST /admin/login`
- Email + password form (React Hook Form + Zod).
- On success store `{ token, agent }`; redirect to Dashboard.
- On 401 show inline error.

### Dashboard — `GET /admin/dashboard`
- Stat cards from the response: `todayConversations`, `aiResolutionRate`, `pendingHandoffs`, `todayMessages`, `activeAiConversations`, `activeHumanConversations`, `totalConversations`.
- Read-only; refetched on mount and on `handoff` events.

### Conversations — `GET /admin/conversations?status&page&limit`
- Table: contact name/phone, status badge (`ai` / `human` / `closed`), assigned agent, updated time.
- Status filter (all / ai / human / closed) and pagination (`total`, `page`, `limit` from response).
- Live `handoff` events highlight/refresh rows that just became `human` & unassigned (pending takeover).
- Row click → Agent Workspace.

### Agent Workspace (conversation detail) — `GET /admin/conversations/:id`, `POST /admin/conversations/:id/reply`, `PATCH /admin/conversations/:id/close`
- Chat bubble view of `messages[]` differentiated by `role` (`user` / `bot` / `agent`).
- Reply box is **enabled only when `status === 'human'`** (backend rejects reply otherwise with 400).
- Sending a reply calls `POST .../reply`, then appends optimistically / refetches.
- Close button → `PATCH .../close` sets status to `closed`.
- `new_message` socket events for the open conversation append in real time.

### Knowledge Base — `GET /admin/knowledge?category`, `POST /admin/knowledge`, `PUT /admin/knowledge/:id`, `DELETE /admin/knowledge/:id`, `POST /admin/knowledge/sync`
- List grouped/filterable by `category` (`product` / `faq` / `policy`), showing `source` (`woocommerce` / `manual`).
- Create / edit via Dialog (title, content, category — `source` fixed to `manual` for created docs).
- Delete with confirm.
- "Sync WooCommerce" button → `POST .../sync`, shows result via Toast.

## Cross-Cutting Concerns

- **apiClient:** single base URL, injects `Authorization: Bearer`, intercepts 401 → clears token and redirects to `/login`.
- **Socket:** connects after authentication to `/ws` (Socket.io). Listeners:
  - `handoff` `{ conversationId }` → invalidate dashboard + conversations queries, surface a pending-takeover indicator.
  - `new_message` `{ conversationId, message }` → if the matching conversation is open in the Workspace, append the message; otherwise optionally badge the list.
- **ProtectedRoute:** redirects to `/login` when no valid token is present.
- **AppShell:** sidebar navigation (Dashboard, Conversations, Knowledge) + topbar with agent name and logout.

## Required Backend Patch (small)

The backend currently emits only the `handoff` event (`handoff.service.ts`). The frontend's real-time Workspace requires customer messages to be pushed too. Add a single emit where inbound messages are persisted (so human-mode conversations push live):

```ts
socketEmit('new_message', { conversationId, message });
```

This is the only backend change this plan depends on. (Optionally emit on agent reply as well, but optimistic UI already covers that case.)

## Testing

- **Framework:** Vitest + React Testing Library; MSW to mock the admin API.
- **Coverage targets:**
  - Login: success stores token & redirects; 401 shows error.
  - Conversations list: renders rows, status filter, pagination.
  - Agent Workspace: reply box disabled unless `status === 'human'`; sending a reply calls the endpoint; `new_message` appends.
  - Knowledge Base: create/edit/delete flows; sync button triggers endpoint and toasts result.

## Build & Deployment

- `vite build` → `web/dist`.
- Serve static assets from the existing Fastify service via `@fastify/static` (keeps the monolith a single deployment unit).
- Dockerfile gains a frontend build stage that produces `web/dist` and copies it into the runtime image; existing `docker-compose.yml` unchanged in topology.

## Out of Scope (v1)

- Settings page (AI model / system prompt / WooCommerce / WhatsApp config) — no backend endpoints yet.
- Agent management CRUD (only login exists in the backend).
- These can be follow-up specs once backend endpoints are added.
