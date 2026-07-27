# Real-Time Chat Dialog Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the agent workspace message thread update live (no page refresh) for customer, AI, and agent messages.

**Architecture:** Backend-only change. The frontend already reacts to a `new_message` socket event by refetching the open conversation. Today that event is emitted only for customer messages in human mode. We add emits for (a) the customer message in *both* modes, (b) the AI reply, and (c) agent replies — reusing the existing `socketEmit`/`app.io.emit` dependency-injection pattern.

**Tech Stack:** Node.js + TypeScript, Fastify, Socket.io, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-08-realtime-chat-updates-design.md`

**Event contract (unchanged):** `new_message` → `{ conversationId: string, message: { role: 'user' | 'bot' | 'agent', content: string } }`. The frontend keys off `conversationId` and refetches; no frontend changes are needed.

---

## File Structure

**Modify:**
- `src/modules/pipeline/message.pipeline.ts` — emit the customer message in both modes (before the human/AI branch) and emit the AI reply after it is saved.
- `src/modules/admin/conversations.controller.ts` — accept a `socketEmit` dep; emit after saving an agent reply.
- `src/modules/admin/admin.plugin.ts` — accept `socketEmit` and pass it into `conversationsRoutes`.
- `src/app.ts` — provide `socketEmit` when registering the admin plugin.

**Tests:**
- `tests/modules/pipeline/message.pipeline.test.ts` (modify — flip the AI-mode emit test).
- `tests/modules/admin/conversations.controller.test.ts` (create — assert the agent reply emit).

---

## Task 1: Pipeline emits `new_message` for AI-mode customer message and AI reply

**Files:**
- Modify: `src/modules/pipeline/message.pipeline.ts`
- Test: `tests/modules/pipeline/message.pipeline.test.ts`

- [x] **Step 1: Update the AI-mode test to expect emits**

In `tests/modules/pipeline/message.pipeline.test.ts`, replace the existing test (currently the last test, `'does NOT emit new_message when conversation is in ai mode'`, lines ~133-143) with:

```ts
  it('emits new_message for the customer message and the AI reply in ai mode', async () => {
    await pipeline.process({
      waMessageId: 'wamid.111',
      from: '+1234567890',
      contactName: 'John',
      text: 'Tell me about widgets',
      timestamp: '1700000000',
    });

    expect(deps.socketEmit).toHaveBeenCalledWith('new_message', {
      conversationId: 'conv-1',
      message: { role: 'user', content: 'Tell me about widgets' },
    });
    expect(deps.socketEmit).toHaveBeenCalledWith('new_message', {
      conversationId: 'conv-1',
      message: { role: 'bot', content: 'Here is info about the widget!' },
    });
    expect(deps.socketEmit).toHaveBeenCalledTimes(2);
  });
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- message.pipeline`
Expected: FAIL — in AI mode the current code emits 0 times, so `toHaveBeenCalledWith(... role: 'user' ...)` fails (and the count is 0, not 2).

- [x] **Step 3: Emit the customer message before the human/AI branch**

In `src/modules/pipeline/message.pipeline.ts`, replace this block (lines ~44-58):

```ts
    // 2. Save user message to DB
    await conversationService.addMessage(conversation.id, 'user', incoming.text, incoming.waMessageId);

    // 3. Update session cache
    await sessionService.addMessage(conversation.id, { role: 'user', content: incoming.text });

    // 4. If conversation is in human mode, just save message (agent sees it in dashboard)
    if (conversation.status === 'human') {
      socketEmit('new_message', {
        conversationId: conversation.id,
        message: { role: 'user', content: incoming.text },
      });
      logger.info({ conversationId: conversation.id }, 'Message saved for human agent');
      return;
    }
```

with:

```ts
    // 2. Save user message to DB
    await conversationService.addMessage(conversation.id, 'user', incoming.text, incoming.waMessageId);

    // 3. Update session cache
    await sessionService.addMessage(conversation.id, { role: 'user', content: incoming.text });

    // 4. Broadcast the customer message to any open dialog (both AI and human mode)
    socketEmit('new_message', {
      conversationId: conversation.id,
      message: { role: 'user', content: incoming.text },
    });

    // 5. If conversation is in human mode, stop here — the agent handles the reply
    if (conversation.status === 'human') {
      logger.info({ conversationId: conversation.id }, 'Message saved for human agent');
      return;
    }
```

- [x] **Step 4: Emit the AI reply after it is saved**

In the same file, replace this block (lines ~93-95):

```ts
    // 11. Save bot message to DB and session
    await conversationService.addMessage(conversation.id, 'bot', llmResponse.content);
    await sessionService.addMessage(conversation.id, { role: 'bot', content: llmResponse.content });
```

with:

```ts
    // 11. Save bot message to DB and session
    await conversationService.addMessage(conversation.id, 'bot', llmResponse.content);
    await sessionService.addMessage(conversation.id, { role: 'bot', content: llmResponse.content });

    // 12. Broadcast the AI reply to any open dialog
    socketEmit('new_message', {
      conversationId: conversation.id,
      message: { role: 'bot', content: llmResponse.content },
    });
```

- [x] **Step 5: Run the pipeline tests to verify they pass**

Run: `npm test -- message.pipeline`
Expected: PASS. All five tests pass — the updated AI-mode test, and the existing `'emits new_message when conversation is in human mode'` test (still emits the customer message once; it uses `objectContaining` and does not assert a call count).

- [x] **Step 6: Commit**

```bash
git add src/modules/pipeline/message.pipeline.ts tests/modules/pipeline/message.pipeline.test.ts
git commit -m "feat(pipeline): broadcast new_message for customer and AI messages in ai mode"
```

---

## Task 2: Agent replies emit `new_message`

Thread a `socketEmit` dependency into the conversations controller (mirroring the pipeline's DI pattern) and emit after the agent's message is saved.

**Files:**
- Modify: `src/modules/admin/conversations.controller.ts`
- Modify: `src/modules/admin/admin.plugin.ts`
- Modify: `src/app.ts`
- Test: `tests/modules/admin/conversations.controller.test.ts` (create)

- [x] **Step 1: Write the failing controller test**

Create `tests/modules/admin/conversations.controller.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { conversationsRoutes } from '../../../src/modules/admin/conversations.controller.js';

describe('conversationsRoutes — agent reply', () => {
  it('emits new_message after saving an agent reply', async () => {
    const socketEmit = vi.fn();
    const deps = {
      prisma: {
        conversation: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'conv-1',
            status: 'human',
            contactPhone: '+1234567890',
            assignedAgentId: 'agent-1',
          }),
        },
      },
      conversationService: {
        addMessage: vi.fn().mockResolvedValue({ id: 'm1' }),
        updateStatus: vi.fn(),
      },
      whatsappService: { sendTextMessage: vi.fn().mockResolvedValue(undefined) },
      socketEmit,
    };

    const app = Fastify();
    await app.register(conversationsRoutes(deps as any));

    const res = await app.inject({
      method: 'POST',
      url: '/admin/conversations/conv-1/reply',
      payload: { message: 'Hello from the agent' },
    });

    expect(res.statusCode).toBe(200);
    expect(deps.whatsappService.sendTextMessage).toHaveBeenCalledWith('+1234567890', 'Hello from the agent');
    expect(deps.conversationService.addMessage).toHaveBeenCalledWith('conv-1', 'agent', 'Hello from the agent');
    expect(socketEmit).toHaveBeenCalledWith('new_message', {
      conversationId: 'conv-1',
      message: { role: 'agent', content: 'Hello from the agent' },
    });

    await app.close();
  });
});
```

(The mocked conversation sets `assignedAgentId`, so the handler's `if (!conversation.assignedAgentId)` branch is skipped and no `request.agent` is required.)

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- conversations.controller`
Expected: FAIL — `socketEmit` is never called (current handler does not emit).

- [x] **Step 3: Add `socketEmit` to the controller deps and emit after saving**

In `src/modules/admin/conversations.controller.ts`, update the deps interface:

```ts
interface ConversationsControllerDeps {
  prisma: PrismaClient;
  conversationService: ConversationService;
  whatsappService: WhatsAppService;
  socketEmit: (event: string, data: unknown) => void;
}
```

Then, inside the `POST /admin/conversations/:id/reply` handler, add the emit immediately after `await deps.conversationService.addMessage(id, 'agent', message);`:

```ts
      await deps.conversationService.addMessage(id, 'agent', message);

      deps.socketEmit('new_message', {
        conversationId: id,
        message: { role: 'agent', content: message },
      });
```

- [x] **Step 4: Thread `socketEmit` through the admin plugin**

In `src/modules/admin/admin.plugin.ts`, add `socketEmit` to `AdminPluginDeps`:

```ts
interface AdminPluginDeps {
  authService: AuthService;
  conversationService: ConversationService;
  knowledgeService: KnowledgeService;
  whatsappService: WhatsAppService;
  syncScheduler: SyncScheduler;
  socketEmit: (event: string, data: unknown) => void;
}
```

Then pass it into the `conversationsRoutes` registration:

```ts
    await protectedApp.register(conversationsRoutes({
      prisma: app.prisma,
      conversationService: deps.conversationService,
      whatsappService: deps.whatsappService,
      socketEmit: deps.socketEmit,
    }));
```

- [x] **Step 5: Provide `socketEmit` from app.ts**

In `src/app.ts`, update the admin plugin registration (currently registers with `authService, conversationService, knowledgeService, whatsappService, syncScheduler`) to also pass `socketEmit`:

```ts
  await app.register(adminPlugin, {
    authService,
    conversationService,
    knowledgeService,
    whatsappService,
    syncScheduler,
    socketEmit: (event, data) => app.io.emit(event, data),
  } as any);
```

- [x] **Step 6: Run the controller test, full suite, and typecheck**

Run: `npm test -- conversations.controller`
Expected: PASS.

Run: `npx tsc --noEmit && npm test`
Expected: exit 0; all tests pass.

- [x] **Step 7: Commit**

```bash
git add src/modules/admin/conversations.controller.ts src/modules/admin/admin.plugin.ts src/app.ts tests/modules/admin/conversations.controller.test.ts
git commit -m "feat(admin): broadcast new_message when an agent replies"
```

---

## Task 3: End-to-end verification in the browser

Confirm messages appear live without a refresh. Run with `LOCAL_TEST_MODE=true` (stubs WhatsApp send + embeddings) so the full AI path runs locally.

- [x] **Step 1: Start infra, backend, and frontend**

```bash
docker compose up -d postgres redis
npm run dev            # backend on :3100 (per .env PORT)
cd web && npm run dev  # frontend on :5173
```

Expected: backend logs "Server listening", frontend logs the Local URL.

- [x] **Step 2: Open a conversation and send a customer message without refreshing**

In the browser at `http://localhost:5173`, log in (`admin@example.com` / `admin123`), open any conversation in the workspace (or create one via the script below), and leave it open. In a terminal:

```bash
node scripts/send-test-message.js "15551234567" "Test Customer" "Do you ship to Ghana?"
```

Expected: **without refreshing**, the customer message appears in the open thread, then the AI reply appears a moment later.

- [x] **Step 3: Verify agent reply is live**

Put the conversation into human mode (send a message that triggers `[HANDOFF]`, e.g. `"I want to talk to a human agent"`), then type an agent reply in the workspace and send it.
Expected: the agent message appears in the thread immediately (it already did for the sender; this confirms no regression).

- [x] **Step 4: Full regression**

Run: `npm test && cd web && npm test`
Expected: all backend and frontend tests pass.

---

## Notes / Out of scope

- `io.emit` broadcasts to all clients; the frontend filters by `conversationId`. Fine at current scale; per-conversation rooms are a deliberate future optimization.
- The sending agent's tab may refetch twice (mutation `onSuccess` invalidate + socket emit). Harmless.
- Live updates to the conversations **list** page are out of scope for this plan.
