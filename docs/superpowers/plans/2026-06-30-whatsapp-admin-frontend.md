# WhatsApp Admin Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React admin dashboard in `web/` (Login, Dashboard, Conversations, Agent Workspace with real-time chat, Knowledge Base) against the existing backend API, plus one small backend WebSocket patch.

**Architecture:** A Vite + React + TypeScript SPA in `web/` (separate package). State: TanStack Query for server data, a tiny auth Context for the JWT, socket.io-client for live `handoff`/`new_message` events. Styling: Tailwind + small hand-rolled shadcn-style primitives. In dev, Vite proxies `/admin` and `/ws` to the backend (port 3000). In prod, Fastify serves `web/dist` via `@fastify/static`, so the API is same-origin.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, React Router v6, TanStack Query v5, socket.io-client v4, React Hook Form + Zod, Vitest + React Testing Library + MSW v2, `@fastify/static` (backend).

---

## File Structure

**Backend (patch):**
- `src/modules/pipeline/message.pipeline.ts` — add `socketEmit` dep, emit `new_message` in human-mode branch.
- `src/app.ts` — pass `socketEmit` into `MessagePipeline`; register `@fastify/static` to serve `web/dist`.
- `tests/modules/pipeline/message.pipeline.test.ts` — existing file; add the new-emit cases to it.

**Frontend (new, all under `web/`):**
- `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/tailwind.config.js`, `web/postcss.config.js`, `web/index.html`, `web/vitest.config.ts`, `web/src/test/setup.ts`
- `web/src/main.tsx` — app bootstrap (Router, QueryClient, AuthProvider)
- `web/src/index.css` — Tailwind directives
- `web/src/lib/types.ts` — shared API types
- `web/src/lib/utils.ts` — `cn()` class helper
- `web/src/services/apiClient.ts` — fetch wrapper with JWT + 401 handling
- `web/src/services/auth.tsx` — AuthContext/provider + `useAuth`
- `web/src/services/socket.ts` — socket.io singleton + `useSocketEvent` hook
- `web/src/services/queries.ts` — TanStack Query hooks for all endpoints
- `web/src/components/ui/` — `Button.tsx`, `Input.tsx`, `Card.tsx`, `Badge.tsx`, `Dialog.tsx`, `Table.tsx`, `Toast.tsx`
- `web/src/components/layout/AppShell.tsx`, `web/src/components/layout/ProtectedRoute.tsx`
- `web/src/pages/LoginPage.tsx`, `DashboardPage.tsx`, `ConversationsPage.tsx`, `WorkspacePage.tsx`, `KnowledgePage.tsx`
- `web/src/App.tsx` — route table
- Test files colocated as `*.test.tsx` next to each page/component.

**Deployment:**
- `Dockerfile` — add a frontend build stage producing `web/dist`.

---

## Task 1: Backend — emit `new_message` for human-mode conversations

**Files:**
- Modify: `src/modules/pipeline/message.pipeline.ts`
- Test: `tests/modules/pipeline/message.pipeline.test.ts` (already exists — append these cases; existing tests will need the `socketEmit` dep added to their mock deps too)

- [ ] **Step 1: Write the failing test**

Append to `tests/modules/pipeline/message.pipeline.test.ts` (and note: any existing pipeline tests that construct `MessagePipeline` must add `socketEmit: vi.fn()` to their deps once Step 3 lands):

```ts
import { describe, it, expect, vi } from 'vitest';
import { MessagePipeline } from '../../src/modules/pipeline/message.pipeline.js';

function makeDeps(status: 'ai' | 'human') {
  const socketEmit = vi.fn();
  const conversationService = {
    findOrCreateConversation: vi.fn().mockResolvedValue({ id: 'c1', status, contactPhone: '123' }),
    addMessage: vi.fn().mockResolvedValue({ id: 'm1' }),
  };
  const sessionService = { addMessage: vi.fn(), getMessages: vi.fn().mockResolvedValue([]) };
  const deps = {
    conversationService,
    sessionService,
    knowledgeService: { searchSimilar: vi.fn().mockResolvedValue([]) },
    llmProvider: { complete: vi.fn().mockResolvedValue({ content: 'hi' }) },
    promptBuilder: { build: vi.fn().mockReturnValue([]) },
    whatsappService: { sendTextMessage: vi.fn() },
    handoffService: { shouldHandoff: vi.fn().mockReturnValue(false), executeHandoff: vi.fn() },
    socketEmit,
  };
  return { deps, socketEmit };
}

describe('MessagePipeline new_message emit', () => {
  it('emits new_message when conversation is in human mode', async () => {
    const { deps, socketEmit } = makeDeps('human');
    const pipeline = new MessagePipeline(deps as any);
    await pipeline.process({ from: '123', contactName: 'Bob', text: 'hello', waMessageId: 'w1' } as any);
    expect(socketEmit).toHaveBeenCalledWith('new_message', expect.objectContaining({ conversationId: 'c1' }));
  });

  it('does NOT emit new_message when conversation is in ai mode', async () => {
    const { deps, socketEmit } = makeDeps('ai');
    const pipeline = new MessagePipeline(deps as any);
    await pipeline.process({ from: '123', contactName: 'Bob', text: 'hello', waMessageId: 'w1' } as any);
    expect(socketEmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- message.pipeline`
Expected: FAIL — `socketEmit` not called (dependency not wired / emit missing).

- [ ] **Step 3: Add `socketEmit` to deps and emit in human branch**

In `src/modules/pipeline/message.pipeline.ts`, add to the `PipelineDeps` interface (after `handoffService`):

```ts
  handoffService: HandoffService;
  socketEmit: (event: string, data: unknown) => void;
```

Replace the human-mode branch (currently lines ~48-52):

```ts
    // 4. If conversation is in human mode, save message and push to agent dashboard
    if (conversation.status === 'human') {
      this.deps.socketEmit('new_message', {
        conversationId: conversation.id,
        message: { role: 'user', content: incoming.text },
      });
      logger.info({ conversationId: conversation.id }, 'Message saved for human agent');
      return;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- message.pipeline`
Expected: PASS (both cases).

- [ ] **Step 5: Wire `socketEmit` into the pipeline in `app.ts`**

In `src/app.ts`, in the `MessagePipeline` construction (around line 84), add the dep:

```ts
  const pipeline = new MessagePipeline({
    conversationService,
    sessionService,
    knowledgeService,
    llmProvider,
    promptBuilder,
    whatsappService,
    handoffService,
    socketEmit: (event, data) => app.io.emit(event, data),
  });
```

- [ ] **Step 6: Verify full backend suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/modules/pipeline/message.pipeline.ts src/app.ts tests/modules/pipeline/message.pipeline.test.ts
git commit -m "feat(backend): emit new_message socket event for human-mode conversations"
```

---

## Task 2: Scaffold the `web/` frontend package

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/tsconfig.node.json`, `web/tailwind.config.js`, `web/postcss.config.js`, `web/index.html`, `web/src/index.css`, `web/src/vite-env.d.ts`

- [ ] **Step 1: Create `web/package.json`**

```json
{
  "name": "whatsapp-admin-web",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.59.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.53.0",
    "react-router-dom": "^6.27.0",
    "socket.io-client": "^4.8.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.2",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "msw": "^2.4.9",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.2",
    "vite": "^5.4.8",
    "vitest": "^2.1.2"
  }
}
```

- [ ] **Step 2: Create `web/vite.config.ts`** (dev proxy to backend)

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/admin': 'http://localhost:3000',
      '/ws': { target: 'http://localhost:3000', ws: true },
    },
  },
  build: { outDir: 'dist' },
});
```

- [ ] **Step 3: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Create `web/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create `web/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#16a34a', dark: '#15803d' },
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 6: Create `web/postcss.config.js`**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 7: Create `web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WhatsApp Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create `web/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root { height: 100%; }
body { @apply bg-gray-50 text-gray-900; }
```

- [ ] **Step 9: Create `web/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 10: Install dependencies**

Run: `cd web && npm install`
Expected: completes with no errors; `web/node_modules` created.

- [ ] **Step 11: Commit**

```bash
git add web/package.json web/package-lock.json web/vite.config.ts web/tsconfig.json web/tsconfig.node.json web/tailwind.config.js web/postcss.config.js web/index.html web/src/index.css web/src/vite-env.d.ts
git commit -m "chore(web): scaffold Vite + React + Tailwind frontend"
```

---

## Task 3: Shared types and `cn()` utility

**Files:**
- Create: `web/src/lib/types.ts`, `web/src/lib/utils.ts`

- [ ] **Step 1: Create `web/src/lib/types.ts`**

```ts
export type ConversationStatus = 'ai' | 'human' | 'closed';
export type MessageRole = 'user' | 'bot' | 'agent';
export type KnowledgeCategory = 'product' | 'faq' | 'policy';

export interface Agent {
  id: string;
  name: string;
  email?: string;
  role?: 'admin' | 'agent';
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  contactName: string;
  contactPhone: string;
  status: ConversationStatus;
  assignedAgentId: string | null;
  assignedAgent?: { id: string; name: string } | null;
  updatedAt: string;
  createdAt: string;
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
}

export interface ConversationListResponse {
  conversations: Conversation[];
  total: number;
  page: number;
  limit: number;
}

export interface DashboardStats {
  totalConversations: number;
  todayConversations: number;
  activeAiConversations: number;
  activeHumanConversations: number;
  pendingHandoffs: number;
  todayMessages: number;
  aiResolutionRate: string;
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  category: KnowledgeCategory;
  source: 'woocommerce' | 'manual';
  createdAt: string;
  updatedAt: string;
}

export interface SyncResult {
  synced?: number;
  created?: number;
  updated?: number;
  [key: string]: unknown;
}
```

- [ ] **Step 2: Create `web/src/lib/utils.ts`**

```ts
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/types.ts web/src/lib/utils.ts
git commit -m "feat(web): shared API types and cn() helper"
```

---

## Task 4: API client with JWT + 401 handling

**Files:**
- Create: `web/src/services/apiClient.ts`
- Test: `web/src/services/apiClient.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { api, TOKEN_KEY } from './apiClient';

describe('apiClient', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('attaches Bearer token from localStorage', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok123');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    await api.get('/admin/dashboard');
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok123');
  });

  it('clears token and throws on 401', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok123');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }));
    await expect(api.get('/admin/dashboard')).rejects.toThrow();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/services/apiClient.test.ts`
Expected: FAIL — module `./apiClient` not found.

- [ ] **Step 3: Create `web/src/services/apiClient.ts`**

```ts
export const TOKEN_KEY = 'wa_admin_token';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      msg = (data as { error?: string }).error ?? msg;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, msg);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/services/apiClient.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add web/src/services/apiClient.ts web/src/services/apiClient.test.ts
git commit -m "feat(web): api client with JWT auth and 401 redirect"
```

---

## Task 5: Vitest + Testing Library setup

**Files:**
- Create: `web/vitest.config.ts`, `web/src/test/setup.ts`

- [ ] **Step 1: Create `web/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
```

- [ ] **Step 2: Create `web/src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());
```

- [ ] **Step 3: Verify existing apiClient test still passes under config**

Run: `cd web && npm test`
Expected: PASS — apiClient tests run via the new config.

- [ ] **Step 4: Commit**

```bash
git add web/vitest.config.ts web/src/test/setup.ts
git commit -m "chore(web): vitest + testing-library setup"
```

---

## Task 6: shadcn-style UI primitives

**Files:**
- Create: `web/src/components/ui/Button.tsx`, `Input.tsx`, `Card.tsx`, `Badge.tsx`, `Table.tsx`, `Dialog.tsx`, `Toast.tsx`

- [ ] **Step 1: Create `web/src/components/ui/Button.tsx`**

```tsx
import { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const styles: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark',
  secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100',
};

export function Button({ variant = 'primary', className, ...props }: Props) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed',
        styles[variant],
        className
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Create `web/src/components/ui/Input.tsx`**

```tsx
import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';
```

- [ ] **Step 3: Create `web/src/components/ui/Card.tsx`**

```tsx
import { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-gray-200 bg-white p-4 shadow-sm', className)} {...props} />;
}
```

- [ ] **Step 4: Create `web/src/components/ui/Badge.tsx`**

```tsx
import { cn } from '../../lib/utils';
import { ConversationStatus } from '../../lib/types';

const statusStyles: Record<ConversationStatus, string> = {
  ai: 'bg-blue-100 text-blue-700',
  human: 'bg-amber-100 text-amber-700',
  closed: 'bg-gray-100 text-gray-600',
};

export function StatusBadge({ status }: { status: ConversationStatus }) {
  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', statusStyles[status])}>
      {status}
    </span>
  );
}
```

- [ ] **Step 5: Create `web/src/components/ui/Table.tsx`**

```tsx
import { HTMLAttributes, TableHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export function Table(props: TableHTMLAttributes<HTMLTableElement>) {
  return <table className="w-full text-left text-sm" {...props} />;
}
export function Thead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="border-b border-gray-200 text-xs uppercase text-gray-500" {...props} />;
}
export function Th({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('px-3 py-2 font-medium', className)} {...props} />;
}
export function Td({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2', className)} {...props} />;
}
export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b border-gray-100 hover:bg-gray-50', className)} {...props} />;
}
```

- [ ] **Step 6: Create `web/src/components/ui/Dialog.tsx`**

```tsx
import { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Dialog({ open, onClose, title, children }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create `web/src/components/ui/Toast.tsx`**

```tsx
import { createContext, useCallback, useContext, useState, ReactNode } from 'react';

interface ToastItem { id: number; message: string; type: 'success' | 'error'; }
interface ToastCtx { notify: (message: string, type?: 'success' | 'error') => void; }

const Ctx = createContext<ToastCtx | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3000);
  };

  return (
    <Ctx.Provider value={{ notify }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={
              'rounded-md px-4 py-2 text-sm text-white shadow ' +
              (t.type === 'success' ? 'bg-brand' : 'bg-red-600')
            }
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
```

> Note: `useCallback` import above is intentional only if used; if `noUnusedLocals` flags it, remove it. The implementation does not require it — use `import { createContext, useContext, useState, ReactNode } from 'react';`.

- [ ] **Step 8: Fix the Toast import line**

Replace the first import line of `Toast.tsx` with:

```tsx
import { createContext, useContext, useState, ReactNode } from 'react';
```

- [ ] **Step 9: Typecheck**

Run: `cd web && npx tsc -b`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add web/src/components/ui
git commit -m "feat(web): shadcn-style UI primitives"
```

---

## Task 7: Auth context and provider

**Files:**
- Create: `web/src/services/auth.tsx`
- Test: `web/src/services/auth.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './auth';
import { TOKEN_KEY } from './apiClient';

function Probe() {
  const { agent, isAuthenticated, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="auth">{isAuthenticated ? 'yes' : 'no'}</span>
      <span data-testid="name">{agent?.name ?? '-'}</span>
      <button onClick={() => login('tok', { id: 'a1', name: 'Alice' })}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => localStorage.clear());

  it('starts unauthenticated and logs in', () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByTestId('auth')).toHaveTextContent('no');
    act(() => screen.getByText('login').click());
    expect(screen.getByTestId('auth')).toHaveTextContent('yes');
    expect(screen.getByTestId('name')).toHaveTextContent('Alice');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('tok');
  });

  it('logout clears token', () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    act(() => screen.getByText('login').click());
    act(() => screen.getByText('logout').click());
    expect(screen.getByTestId('auth')).toHaveTextContent('no');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/services/auth.test.tsx`
Expected: FAIL — module `./auth` not found.

- [ ] **Step 3: Create `web/src/services/auth.tsx`**

```tsx
import { createContext, useContext, useState, ReactNode } from 'react';
import { Agent } from '../lib/types';
import { TOKEN_KEY } from './apiClient';

const AGENT_KEY = 'wa_admin_agent';

interface AuthCtx {
  agent: Agent | null;
  isAuthenticated: boolean;
  login: (token: string, agent: Agent) => void;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

function readAgent(): Agent | null {
  const raw = localStorage.getItem(AGENT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Agent;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(() =>
    localStorage.getItem(TOKEN_KEY) ? readAgent() : null
  );

  const login = (token: string, nextAgent: Agent) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(AGENT_KEY, JSON.stringify(nextAgent));
    setAgent(nextAgent);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(AGENT_KEY);
    setAgent(null);
  };

  return (
    <Ctx.Provider value={{ agent, isAuthenticated: !!agent, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/services/auth.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/services/auth.tsx web/src/services/auth.test.tsx
git commit -m "feat(web): auth context with JWT persistence"
```

---

## Task 8: Query hooks (TanStack Query)

**Files:**
- Create: `web/src/services/queries.ts`

- [ ] **Step 1: Create `web/src/services/queries.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './apiClient';
import {
  Agent,
  ConversationDetail,
  ConversationListResponse,
  ConversationStatus,
  DashboardStats,
  KnowledgeCategory,
  KnowledgeDoc,
  SyncResult,
} from '../lib/types';

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardStats>('/admin/dashboard'),
  });
}

export function useConversations(status: string, page: number, limit = 20) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) params.set('status', status);
  return useQuery({
    queryKey: ['conversations', status, page, limit],
    queryFn: () => api.get<ConversationListResponse>(`/admin/conversations?${params.toString()}`),
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api.get<ConversationDetail>(`/admin/conversations/${id}`),
    enabled: !!id,
  });
}

export function useReply(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) =>
      api.post<{ success: boolean }>(`/admin/conversations/${id}/reply`, { message }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversation', id] }),
  });
}

export function useCloseConversation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch<{ success: boolean }>(`/admin/conversations/${id}/close`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation', id] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useKnowledge(category: string) {
  const qs = category ? `?category=${category}` : '';
  return useQuery({
    queryKey: ['knowledge', category],
    queryFn: () => api.get<{ docs: KnowledgeDoc[] }>(`/admin/knowledge${qs}`),
  });
}

interface CreateDocInput { title: string; content: string; category: KnowledgeCategory; }

export function useCreateDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDocInput) => api.post('/admin/knowledge', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge'] }),
  });
}

export function useUpdateDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; title?: string; content?: string }) =>
      api.put(`/admin/knowledge/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge'] }),
  });
}

export function useDeleteDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/knowledge/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge'] }),
  });
}

export function useSyncWoo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<SyncResult>('/admin/knowledge/sync'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge'] }),
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: (creds: { email: string; password: string }) =>
      api.post<{ token: string; agent: Agent }>('/admin/login', creds),
  });
}

export type { ConversationStatus };
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/services/queries.ts
git commit -m "feat(web): TanStack Query hooks for all admin endpoints"
```

---

## Task 9: Socket service

**Files:**
- Create: `web/src/services/socket.ts`

- [ ] **Step 1: Create `web/src/services/socket.ts`**

```ts
import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io('/', { path: '/ws', transports: ['websocket'] });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export function useSocketEvent<T = unknown>(event: string, handler: (data: T) => void) {
  useEffect(() => {
    const s = getSocket();
    s.on(event, handler);
    return () => {
      s.off(event, handler);
    };
  }, [event, handler]);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/services/socket.ts
git commit -m "feat(web): socket.io client service + useSocketEvent hook"
```

---

## Task 10: Login page

**Files:**
- Create: `web/src/pages/LoginPage.tsx`
- Test: `web/src/pages/LoginPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginPage } from './LoginPage';
import { AuthProvider } from '../services/auth';
import { TOKEN_KEY } from '../services/apiClient';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe('LoginPage', () => {
  beforeEach(() => localStorage.clear());

  it('logs in successfully and stores token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ token: 'tok', agent: { id: 'a1', name: 'Alice' } }), { status: 200 })
    );
    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(localStorage.getItem(TOKEN_KEY)).toBe('tok'));
  });

  it('shows error on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 })
    );
    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/pages/LoginPage.test.tsx`
Expected: FAIL — module `./LoginPage` not found.

- [ ] **Step 3: Create `web/src/pages/LoginPage.tsx`**

```tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useLogin } from '../services/queries';
import { useAuth } from '../services/auth';
import { ApiError } from '../services/apiClient';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';

interface FormValues { email: string; password: string; }

export function LoginPage() {
  const { register, handleSubmit } = useForm<FormValues>();
  const login = useLogin();
  const auth = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const onSubmit = (values: FormValues) => {
    setError('');
    login.mutate(values, {
      onSuccess: (data) => {
        auth.login(data.token, data.agent);
        navigate('/');
      },
      onError: (err) => setError(err instanceof ApiError ? err.message : 'Login failed'),
    });
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-6 text-xl font-semibold">WhatsApp Admin</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
            <Input id="email" type="email" autoComplete="username" {...register('email', { required: true })} />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">Password</label>
            <Input id="password" type="password" autoComplete="current-password" {...register('password', { required: true })} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/pages/LoginPage.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/LoginPage.tsx web/src/pages/LoginPage.test.tsx
git commit -m "feat(web): login page"
```

---

## Task 11: ProtectedRoute and AppShell

**Files:**
- Create: `web/src/components/layout/ProtectedRoute.tsx`, `web/src/components/layout/AppShell.tsx`

- [ ] **Step 1: Create `web/src/components/layout/ProtectedRoute.tsx`**

```tsx
import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../services/auth';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 2: Create `web/src/components/layout/AppShell.tsx`**

```tsx
import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../services/auth';
import { cn } from '../../lib/utils';

const nav = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/conversations', label: 'Conversations', end: false },
  { to: '/knowledge', label: 'Knowledge Base', end: false },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { agent, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-56 flex-col border-r border-gray-200 bg-white">
        <div className="px-4 py-5 text-lg font-semibold text-brand">WA Admin</div>
        <nav className="flex-1 space-y-1 px-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn('block rounded-md px-3 py-2 text-sm', isActive ? 'bg-brand text-white' : 'text-gray-700 hover:bg-gray-100')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <div />
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-600">{agent?.name}</span>
            <button onClick={handleLogout} className="text-gray-500 hover:text-gray-900">Logout</button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd web && npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/layout
git commit -m "feat(web): protected route + app shell layout"
```

---

## Task 12: Dashboard page

**Files:**
- Create: `web/src/pages/DashboardPage.tsx`
- Test: `web/src/pages/DashboardPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardPage } from './DashboardPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DashboardPage />
    </QueryClientProvider>
  );
}

describe('DashboardPage', () => {
  it('renders stat cards from the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          totalConversations: 100,
          todayConversations: 12,
          activeAiConversations: 80,
          activeHumanConversations: 5,
          pendingHandoffs: 3,
          todayMessages: 240,
          aiResolutionRate: '95.0%',
        }),
        { status: 200 }
      )
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('95.0%')).toBeInTheDocument());
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/pages/DashboardPage.test.tsx`
Expected: FAIL — module `./DashboardPage` not found.

- [ ] **Step 3: Create `web/src/pages/DashboardPage.tsx`**

```tsx
import { useDashboard } from '../services/queries';
import { Card } from '../components/ui/Card';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </Card>
  );
}

export function DashboardPage() {
  const { data, isLoading, isError } = useDashboard();

  if (isLoading) return <p>Loading…</p>;
  if (isError || !data) return <p className="text-red-600">Failed to load dashboard.</p>;

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Today's Conversations" value={data.todayConversations} />
        <Stat label="AI Resolution Rate" value={data.aiResolutionRate} />
        <Stat label="Pending Handoffs" value={data.pendingHandoffs} />
        <Stat label="Today's Messages" value={data.todayMessages} />
        <Stat label="Active AI" value={data.activeAiConversations} />
        <Stat label="Active Human" value={data.activeHumanConversations} />
        <Stat label="Total Conversations" value={data.totalConversations} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/pages/DashboardPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/DashboardPage.tsx web/src/pages/DashboardPage.test.tsx
git commit -m "feat(web): dashboard page with stat cards"
```

---

## Task 13: Conversations list page

**Files:**
- Create: `web/src/pages/ConversationsPage.tsx`
- Test: `web/src/pages/ConversationsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ConversationsPage } from './ConversationsPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ConversationsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ConversationsPage', () => {
  it('renders conversation rows from the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          conversations: [
            { id: 'c1', contactName: 'Bob', contactPhone: '123', status: 'human', assignedAgentId: null, assignedAgent: null, updatedAt: '2026-06-30T00:00:00Z', createdAt: '2026-06-30T00:00:00Z' },
          ],
          total: 1,
          page: 1,
          limit: 20,
        }),
        { status: 200 }
      )
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('Bob')).toBeInTheDocument());
    expect(screen.getByText('human')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/pages/ConversationsPage.test.tsx`
Expected: FAIL — module `./ConversationsPage` not found.

- [ ] **Step 3: Create `web/src/pages/ConversationsPage.tsx`**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useConversations } from '../services/queries';
import { useSocketEvent } from '../services/socket';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Table, Thead, Th, Td, Tr } from '../components/ui/Table';
import { ConversationStatus } from '../lib/types';

const filters: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'ai', label: 'AI' },
  { value: 'human', label: 'Human' },
  { value: 'closed', label: 'Closed' },
];

export function ConversationsPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useConversations(status, page);

  // Refresh list when a conversation is handed off to a human.
  useSocketEvent('handoff', () => {
    qc.invalidateQueries({ queryKey: ['conversations'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Conversations</h1>
      <div className="mb-3 flex gap-2">
        {filters.map((f) => (
          <Button
            key={f.value || 'all'}
            variant={status === f.value ? 'primary' : 'secondary'}
            onClick={() => { setStatus(f.value); setPage(1); }}
          >
            {f.label}
          </Button>
        ))}
      </div>
      <Card className="p-0">
        <Table>
          <Thead>
            <tr>
              <Th>Contact</Th>
              <Th>Phone</Th>
              <Th>Status</Th>
              <Th>Agent</Th>
              <Th>Updated</Th>
            </tr>
          </Thead>
          <tbody>
            {isLoading && (
              <tr><Td colSpan={5}>Loading…</Td></tr>
            )}
            {data?.conversations.map((c) => (
              <Tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/conversations/${c.id}`)}>
                <Td>{c.contactName}</Td>
                <Td>{c.contactPhone}</Td>
                <Td><StatusBadge status={c.status as ConversationStatus} /></Td>
                <Td>{c.assignedAgent?.name ?? '—'}</Td>
                <Td>{new Date(c.updatedAt).toLocaleString()}</Td>
              </Tr>
            ))}
            {data && data.conversations.length === 0 && (
              <tr><Td colSpan={5} className="text-gray-500">No conversations.</Td></tr>
            )}
          </tbody>
        </Table>
      </Card>
      <div className="mt-3 flex items-center justify-end gap-2 text-sm">
        <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
        <span>{page} / {totalPages}</span>
        <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/pages/ConversationsPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/ConversationsPage.tsx web/src/pages/ConversationsPage.test.tsx
git commit -m "feat(web): conversations list with filter, pagination, handoff refresh"
```

---

## Task 14: Agent Workspace page (real-time chat)

**Files:**
- Create: `web/src/pages/WorkspacePage.tsx`
- Test: `web/src/pages/WorkspacePage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { WorkspacePage } from './WorkspacePage';

vi.mock('../services/socket', () => ({
  useSocketEvent: () => {},
  getSocket: () => ({ on: () => {}, off: () => {} }),
}));

function renderAt(id: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/conversations/${id}`]}>
        <Routes>
          <Route path="/conversations/:id" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function humanConversation() {
  return {
    id: 'c1', contactName: 'Bob', contactPhone: '123', status: 'human',
    assignedAgentId: null, assignedAgent: null,
    updatedAt: '2026-06-30T00:00:00Z', createdAt: '2026-06-30T00:00:00Z',
    messages: [{ id: 'm1', conversationId: 'c1', role: 'user', content: 'I need help', createdAt: '2026-06-30T00:00:00Z' }],
  };
}

describe('WorkspacePage', () => {
  beforeEach(() => localStorage.clear());

  it('renders messages and enables reply when status is human', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(humanConversation()), { status: 200 })
    );
    renderAt('c1');
    await waitFor(() => expect(screen.getByText('I need help')).toBeInTheDocument());
    expect(screen.getByPlaceholderText(/type a reply/i)).toBeEnabled();
  });

  it('disables reply when status is not human', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ...humanConversation(), status: 'ai' }), { status: 200 })
    );
    renderAt('c1');
    await waitFor(() => expect(screen.getByText('I need help')).toBeInTheDocument());
    expect(screen.getByPlaceholderText(/type a reply/i)).toBeDisabled();
  });

  it('sends a reply via the API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(humanConversation()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify(humanConversation()), { status: 200 }));
    renderAt('c1');
    await waitFor(() => expect(screen.getByText('I need help')).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText(/type a reply/i), 'On it');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));
    await waitFor(() => {
      const replyCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/reply'));
      expect(replyCall).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/pages/WorkspacePage.test.tsx`
Expected: FAIL — module `./WorkspacePage` not found.

- [ ] **Step 3: Create `web/src/pages/WorkspacePage.tsx`**

```tsx
import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useConversation, useReply, useCloseConversation } from '../services/queries';
import { useSocketEvent } from '../services/socket';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Input';
import { StatusBadge } from '../components/ui/Badge';
import { Message, ConversationStatus } from '../lib/types';

function Bubble({ message }: { message: Message }) {
  const align = message.role === 'user' ? 'items-start' : 'items-end';
  const color =
    message.role === 'user' ? 'bg-white border border-gray-200'
    : message.role === 'bot' ? 'bg-blue-50' : 'bg-brand text-white';
  return (
    <div className={`flex flex-col ${align}`}>
      <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${color}`}>{message.content}</div>
      <span className="mt-0.5 text-[11px] text-gray-400">{message.role}</span>
    </div>
  );
}

export function WorkspacePage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { data, isLoading } = useConversation(id);
  const reply = useReply(id);
  const closeConv = useCloseConversation(id);
  const [text, setText] = useState('');

  const onNewMessage = useCallback(
    (payload: { conversationId: string }) => {
      if (payload.conversationId === id) {
        qc.invalidateQueries({ queryKey: ['conversation', id] });
      }
    },
    [id, qc]
  );
  useSocketEvent('new_message', onNewMessage);

  if (isLoading || !data) return <p>Loading…</p>;

  const isHuman = (data.status as ConversationStatus) === 'human';

  const send = () => {
    const message = text.trim();
    if (!message) return;
    reply.mutate(message, { onSuccess: () => setText('') });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{data.contactName}</h1>
          <p className="text-sm text-gray-500">{data.contactPhone}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={data.status as ConversationStatus} />
          {data.status !== 'closed' && (
            <Button variant="danger" onClick={() => closeConv.mutate()} disabled={closeConv.isPending}>
              Close
            </Button>
          )}
        </div>
      </div>

      <Card className="flex-1 space-y-3 overflow-auto">
        {data.messages.map((m) => <Bubble key={m.id} message={m} />)}
      </Card>

      <div className="mt-3 flex gap-2">
        <Textarea
          rows={2}
          placeholder={isHuman ? 'Type a reply…' : 'Take over (status must be human) to reply'}
          value={text}
          disabled={!isHuman || reply.isPending}
          onChange={(e) => setText(e.target.value)}
        />
        <Button onClick={send} disabled={!isHuman || reply.isPending || !text.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/pages/WorkspacePage.test.tsx`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/WorkspacePage.tsx web/src/pages/WorkspacePage.test.tsx
git commit -m "feat(web): agent workspace with real-time chat and reply"
```

---

## Task 15: Knowledge Base page

**Files:**
- Create: `web/src/pages/KnowledgePage.tsx`
- Test: `web/src/pages/KnowledgePage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KnowledgePage } from './KnowledgePage';
import { ToastProvider } from '../components/ui/Toast';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <KnowledgePage />
      </ToastProvider>
    </QueryClientProvider>
  );
}

const docs = {
  docs: [
    { id: 'd1', title: 'Return Policy', content: '30 days', category: 'policy', source: 'manual', createdAt: '2026-06-30T00:00:00Z', updatedAt: '2026-06-30T00:00:00Z' },
  ],
};

describe('KnowledgePage', () => {
  beforeEach(() => localStorage.clear());

  it('lists knowledge docs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(docs), { status: 200 }));
    renderPage();
    await waitFor(() => expect(screen.getByText('Return Policy')).toBeInTheDocument());
  });

  it('triggers WooCommerce sync', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(docs), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ synced: 5 }), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify(docs), { status: 200 }));
    renderPage();
    await waitFor(() => expect(screen.getByText('Return Policy')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /sync woocommerce/i }));
    await waitFor(() => {
      const syncCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/knowledge/sync'));
      expect(syncCall).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/pages/KnowledgePage.test.tsx`
Expected: FAIL — module `./KnowledgePage` not found.

- [ ] **Step 3: Create `web/src/pages/KnowledgePage.tsx`**

```tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useKnowledge, useCreateDoc, useUpdateDoc, useDeleteDoc, useSyncWoo } from '../services/queries';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Dialog } from '../components/ui/Dialog';
import { useToast } from '../components/ui/Toast';
import { KnowledgeCategory, KnowledgeDoc } from '../lib/types';

const categories: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'product', label: 'Product' },
  { value: 'faq', label: 'FAQ' },
  { value: 'policy', label: 'Policy' },
];

interface DocForm { title: string; content: string; category: KnowledgeCategory; }

export function KnowledgePage() {
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<KnowledgeDoc | null>(null);
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useKnowledge(category);
  const createDoc = useCreateDoc();
  const updateDoc = useUpdateDoc();
  const deleteDoc = useDeleteDoc();
  const sync = useSyncWoo();
  const { notify } = useToast();
  const { register, handleSubmit, reset } = useForm<DocForm>();

  const openCreate = () => {
    setEditing(null);
    reset({ title: '', content: '', category: 'faq' });
    setOpen(true);
  };

  const openEdit = (doc: KnowledgeDoc) => {
    setEditing(doc);
    reset({ title: doc.title, content: doc.content, category: doc.category });
    setOpen(true);
  };

  const onSubmit = (values: DocForm) => {
    if (editing) {
      updateDoc.mutate(
        { id: editing.id, title: values.title, content: values.content },
        { onSuccess: () => { notify('Document updated'); setOpen(false); } }
      );
    } else {
      createDoc.mutate(values, {
        onSuccess: () => { notify('Document created'); setOpen(false); },
      });
    }
  };

  const onSync = () => {
    sync.mutate(undefined, {
      onSuccess: (res) => notify(`Sync complete: ${JSON.stringify(res)}`),
      onError: () => notify('Sync failed', 'error'),
    });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Knowledge Base</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onSync} disabled={sync.isPending}>
            {sync.isPending ? 'Syncing…' : 'Sync WooCommerce'}
          </Button>
          <Button onClick={openCreate}>Add Document</Button>
        </div>
      </div>

      <div className="mb-3 flex gap-2">
        {categories.map((c) => (
          <Button
            key={c.value || 'all'}
            variant={category === c.value ? 'primary' : 'secondary'}
            onClick={() => setCategory(c.value)}
          >
            {c.label}
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        {isLoading && <p>Loading…</p>}
        {data?.docs.map((doc) => (
          <Card key={doc.id} className="flex items-start justify-between">
            <div>
              <div className="font-medium">{doc.title}</div>
              <div className="text-xs uppercase text-gray-400">{doc.category} · {doc.source}</div>
              <p className="mt-1 line-clamp-2 text-sm text-gray-600">{doc.content}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="ghost" onClick={() => openEdit(doc)}>Edit</Button>
              <Button
                variant="danger"
                onClick={() => deleteDoc.mutate(doc.id, { onSuccess: () => notify('Document deleted') })}
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
        {data && data.docs.length === 0 && <p className="text-gray-500">No documents.</p>}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Document' : 'Add Document'}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Title</label>
            <Input {...register('title', { required: true })} />
          </div>
          {!editing && (
            <div>
              <label className="mb-1 block text-sm font-medium">Category</label>
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                {...register('category', { required: true })}
              >
                <option value="product">Product</option>
                <option value="faq">FAQ</option>
                <option value="policy">Policy</option>
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium">Content</label>
            <Textarea rows={5} {...register('content', { required: true })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createDoc.isPending || updateDoc.isPending}>Save</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/pages/KnowledgePage.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/KnowledgePage.tsx web/src/pages/KnowledgePage.test.tsx
git commit -m "feat(web): knowledge base CRUD + WooCommerce sync"
```

---

## Task 16: App routing and bootstrap

**Files:**
- Create: `web/src/App.tsx`, `web/src/main.tsx`

- [ ] **Step 1: Create `web/src/App.tsx`**

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ConversationsPage } from './pages/ConversationsPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { KnowledgePage } from './pages/KnowledgePage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppShell>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/conversations" element={<ConversationsPage />} />
                <Route path="/conversations/:id" element={<WorkspacePage />} />
                <Route path="/knowledge" element={<KnowledgePage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
```

- [ ] **Step 2: Create `web/src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { AuthProvider } from './services/auth';
import { ToastProvider } from './components/ui/Toast';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
```

- [ ] **Step 3: Full typecheck + build**

Run: `cd web && npm run build`
Expected: `tsc -b` passes and Vite produces `web/dist/index.html` + assets.

- [ ] **Step 4: Full frontend test suite**

Run: `cd web && npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/App.tsx web/src/main.tsx
git commit -m "feat(web): app routing and bootstrap"
```

---

## Task 17: Serve frontend from Fastify in production

**Files:**
- Modify: root `package.json` (add `@fastify/static`)
- Modify: `src/app.ts`

- [ ] **Step 1: Install `@fastify/static` in the backend**

Run: `npm install @fastify/static`
Expected: added to root `package.json` dependencies.

- [ ] **Step 2: Register static serving with SPA fallback in `src/app.ts`**

Add the import near the other imports at the top of `src/app.ts`:

```ts
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
```

After the admin routes registration (after the `await app.register(adminPlugin, …)` block, ~line 153), add:

```ts
  // Serve the built admin SPA (production). Skips API/webhook/ws prefixes.
  if (process.env.NODE_ENV === 'production') {
    const here = dirname(fileURLToPath(import.meta.url));
    const webDist = join(here, '..', 'web', 'dist');

    await app.register(fastifyStatic, { root: webDist, prefix: '/' });

    app.setNotFoundHandler((request, reply) => {
      if (
        request.url.startsWith('/admin') ||
        request.url.startsWith('/webhook') ||
        request.url.startsWith('/ws') ||
        request.url.startsWith('/health')
      ) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }
```

> Note: `import.meta.url` requires the backend to emit ESM-compatible output. The project is CJS (`"type": "commonjs"`); under CJS, replace `dirname(fileURLToPath(import.meta.url))` with `__dirname`. Use `__dirname` directly:
>
> ```ts
> const webDist = join(__dirname, '..', 'web', 'dist');
> ```
> and drop the `fileURLToPath`/`import.meta.url` lines. Keep only `import fastifyStatic from '@fastify/static';` and `import { join } from 'node:path';`.

- [ ] **Step 3: Apply the CJS-correct version**

Final import additions in `src/app.ts`:

```ts
import fastifyStatic from '@fastify/static';
import { join } from 'node:path';
```

Final static block:

```ts
  if (process.env.NODE_ENV === 'production') {
    const webDist = join(__dirname, '..', 'web', 'dist');
    await app.register(fastifyStatic, { root: webDist, prefix: '/' });
    app.setNotFoundHandler((request, reply) => {
      if (
        request.url.startsWith('/admin') ||
        request.url.startsWith('/webhook') ||
        request.url.startsWith('/ws') ||
        request.url.startsWith('/health')
      ) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }
```

- [ ] **Step 4: Typecheck backend**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify backend tests still pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/app.ts
git commit -m "feat(backend): serve admin SPA from web/dist in production"
```

---

## Task 18: Dockerfile frontend build stage

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Read the current Dockerfile**

Run: `cat Dockerfile`
Expected: existing multi-stage backend build (per commit `91963fe`).

- [ ] **Step 2: Add a web build stage and copy `web/dist` into the runtime image**

Add a frontend build stage near the top of `Dockerfile` (before or alongside the backend builder stage):

```dockerfile
# --- Frontend build stage ---
FROM node:20-alpine AS web-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build
```

In the final runtime stage (where the built backend `dist/` is assembled), copy the frontend build output so `__dirname/../web/dist` resolves at runtime:

```dockerfile
COPY --from=web-builder /app/web/dist ./web/dist
```

> Adjust the destination so it sits one level up from the backend's compiled `dist/` (matching `join(__dirname, '..', 'web', 'dist')`). If the backend runs from `/app/dist/app.js`, copy to `/app/web/dist`.

- [ ] **Step 3: Build the image to verify**

Run: `docker build -t whatsapp-service:web-test .`
Expected: build succeeds; both frontend and backend stages complete.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile
git commit -m "build: add frontend build stage and serve web/dist"
```

---

## Task 19: Manual end-to-end smoke check

**Files:** none (verification only)

- [ ] **Step 1: Start the backend**

Run: `npm run dev` (backend on port 3000)
Expected: server starts, default admin ensured.

- [ ] **Step 2: Start the frontend dev server**

Run: `cd web && npm run dev` (Vite on port 5173, proxying `/admin` + `/ws`)
Expected: Vite serves the app.

- [ ] **Step 3: Verify the core flow in the browser**

Open `http://localhost:5173`:
- Login with `ADMIN_DEFAULT_EMAIL` / `ADMIN_DEFAULT_PASSWORD`.
- Dashboard shows stat cards.
- Conversations list loads; filter + pagination work.
- Open a conversation; reply box disabled unless `status === 'human'`.
- Knowledge Base: add/edit/delete a doc; "Sync WooCommerce" shows a toast.

Expected: all flows function; no console errors.

- [ ] **Step 4: Update CLAUDE.md status**

Edit the "Current Status" section of `CLAUDE.md`: mark Frontend as implemented (pages: Login, Dashboard, Conversations, Workspace, Knowledge), note the `new_message` socket event and `@fastify/static` SPA serving.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: mark frontend implemented in CLAUDE.md"
```

---

## Self-Review Notes

**Spec coverage:**
- Login → Task 10. Dashboard → Task 12. Conversations (list, filter, pagination) → Task 13. Agent Workspace (chat, human-gated reply, close, real-time) → Tasks 1 + 9 + 14. Knowledge Base (CRUD + sync) → Task 15. Cross-cutting apiClient/socket/protected route/shell → Tasks 4, 9, 11. Backend `new_message` patch → Task 1. Build/deploy (@fastify/static + Dockerfile) → Tasks 17, 18. Testing → embedded per task. ✅ All spec sections mapped.
- Settings + agent CRUD are explicitly out of scope per the spec — no tasks, intentionally.

**Type consistency:** `Conversation`/`ConversationDetail`/`Message`/`DashboardStats`/`KnowledgeDoc` defined once in Task 3 and reused by all query hooks (Task 8) and pages. `TOKEN_KEY` defined in Task 4, reused in Tasks 7/10. Query hook names (`useDashboard`, `useConversations`, `useConversation`, `useReply`, `useCloseConversation`, `useKnowledge`, `useCreateDoc`, `useUpdateDoc`, `useDeleteDoc`, `useSyncWoo`, `useLogin`) defined in Task 8 and consumed consistently. Socket events `handoff` (Task 13) and `new_message` (Tasks 1, 14) match between backend emit and frontend listeners.

**Placeholder scan:** No TBD/TODO; every code step contains complete code. The two embedded "Note" callouts (Toast import, CJS `__dirname`) resolve to explicit final code in their following steps.
