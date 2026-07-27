# Customer Service Skills (Talk Techniques) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let the AI apply curated customer-service talk techniques (a "skill playbook") to every reply, injected into the prompt through a channel separate from factual RAG.

**Architecture:** Add a first-class `skill` knowledge category. Skills are stored like any other knowledge doc (reusing the existing admin CRUD + storage) but are (a) **excluded** from the RAG similarity search so they never crowd out factual docs, and (b) fetched **wholesale** and injected into a dedicated "Customer Service Techniques" section of the system prompt. Skills are never vector-searched, so we skip embedding them entirely — which also means adding techniques needs no embedding API key.

**Tech Stack:** Node.js + TypeScript, Fastify, Prisma 7 (PostgreSQL + pgvector), Vitest, React + Vite (admin UI).

**Key facts about the current code:**
- RAG search: `KnowledgeService.searchSimilar()` in `src/modules/knowledge/knowledge.service.ts` (WHERE clause at ~line 39).
- Prompt assembly: `PromptBuilder.build()` / `buildSystemPrompt()` in `src/modules/ai/prompt.builder.ts`.
- Pipeline wiring: `MessagePipeline.process()` in `src/modules/pipeline/message.pipeline.ts` (steps 6–7).
- Enum lives in `prisma/schema.prisma` (`KnowledgeCategory`), only migration so far is `20260629222932_init`.
- Backend is CommonJS; run tests with `npm test` (vitest). Frontend is a separate ESM package under `web/` (`cd web && npm test`).

---

## File Structure

**Backend (modify):**
- `prisma/schema.prisma` — add `skill` to `KnowledgeCategory` enum.
- `prisma/migrations/<new>/migration.sql` — generated `ALTER TYPE` (via `prisma migrate dev`).
- `src/modules/knowledge/knowledge.types.ts` — add `'skill'` to the category union.
- `src/modules/knowledge/knowledge.service.ts` — `getSkills()`, exclude skills from `searchSimilar`, skip embedding for skills in `createDoc`/`updateDoc`.
- `src/modules/ai/prompt.builder.ts` — new `skills` param + "Customer Service Techniques" section.
- `src/modules/pipeline/message.pipeline.ts` — fetch skills in parallel, pass to `build()`.
- `src/modules/admin/knowledge.controller.ts` — accept `skill` in the POST body type.

**Backend (tests, modify):**
- `tests/modules/knowledge/knowledge.service.test.ts`
- `tests/modules/ai/prompt.builder.test.ts`
- `tests/modules/pipeline/message.pipeline.test.ts`

**Frontend (modify):**
- `web/src/lib/types.ts` — add `'skill'` to `KnowledgeCategory`.
- `web/src/pages/KnowledgePage.tsx` — Skill filter tab + Skill option in the form.
- `web/src/pages/KnowledgePage.test.tsx` — assert the Skill tab renders.

**New:**
- `scripts/seed-skills.js` — seed a starter set of technique docs via the admin API.

---

## Task 1: Add the `skill` category to the data model

**Files:**
- Modify: `prisma/schema.prisma` (enum `KnowledgeCategory`)
- Modify: `src/modules/knowledge/knowledge.types.ts:12`
- Create: `prisma/migrations/<timestamp>_add_skill_category/migration.sql` (generated)

- [x] **Step 1: Add the enum value in the schema**

In `prisma/schema.prisma`, change the enum:

```prisma
enum KnowledgeCategory {
  product
  faq
  policy
  skill
}
```

- [x] **Step 2: Widen the TypeScript category union**

In `src/modules/knowledge/knowledge.types.ts`, update `CreateKnowledgeDocInput`:

```ts
export interface CreateKnowledgeDocInput {
  title: string;
  content: string;
  category: 'product' | 'faq' | 'policy' | 'skill';
  source: 'woocommerce' | 'manual';
  metadata?: Record<string, unknown>;
}
```

- [x] **Step 3: Generate the migration and Prisma client**

Ensure Postgres is running (`docker compose up -d postgres redis`), then run:

```bash
npx prisma migrate dev --name add_skill_category
```

Expected: a new folder `prisma/migrations/<timestamp>_add_skill_category/` whose `migration.sql` contains:

```sql
-- AlterEnum
ALTER TYPE "KnowledgeCategory" ADD VALUE 'skill';
```

and "✔ Generated Prisma Client". (Note: Postgres runs `ADD VALUE` outside a transaction — this is normal and Prisma handles it.)

- [x] **Step 4: Verify the client typechecks**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

- [x] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/modules/knowledge/knowledge.types.ts
git commit -m "feat(knowledge): add skill category for customer-service techniques"
```

---

## Task 2: KnowledgeService — `getSkills()` + exclude skills from RAG

**Files:**
- Modify: `src/modules/knowledge/knowledge.service.ts`
- Test: `tests/modules/knowledge/knowledge.service.test.ts`

- [x] **Step 1: Write the failing tests**

Add these two tests inside the top-level `describe('KnowledgeService', ...)` in `tests/modules/knowledge/knowledge.service.test.ts`:

```ts
  describe('getSkills', () => {
    it('returns all docs in the skill category', async () => {
      const skillDocs = [
        { id: 's1', title: 'Empathy first', content: 'Acknowledge feelings', category: 'skill', source: 'manual' },
      ];
      mockPrisma.knowledgeDoc.findMany.mockResolvedValue(skillDocs);

      const result = await service.getSkills();

      expect(mockPrisma.knowledgeDoc.findMany).toHaveBeenCalledWith({
        where: { category: 'skill' },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual(skillDocs);
    });
  });

  describe('searchSimilar excludes skills', () => {
    it('filters out skill-category docs from vector search', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.searchSimilar('anything', 5);

      const sqlCall = mockPrisma.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sqlCall).toContain("category != 'skill'");
    });
  });
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npm test -- knowledge.service`
Expected: FAIL — `service.getSkills is not a function` and the `category != 'skill'` assertion fails.

- [x] **Step 3: Add `getSkills()` and update `searchSimilar`**

In `src/modules/knowledge/knowledge.service.ts`, add the method (place it next to `listDocs`):

```ts
  async getSkills(): Promise<KnowledgeDoc[]> {
    return this.prisma.knowledgeDoc.findMany({
      where: { category: 'skill' },
      orderBy: { createdAt: 'asc' },
    });
  }
```

Then update the `WHERE` line inside `searchSimilar`'s raw SQL from:

```ts
       WHERE embedding IS NOT NULL
```

to:

```ts
       WHERE embedding IS NOT NULL AND category != 'skill'
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npm test -- knowledge.service`
Expected: PASS (existing `createDoc`/`searchSimilar` tests still pass too).

- [x] **Step 5: Commit**

```bash
git add src/modules/knowledge/knowledge.service.ts tests/modules/knowledge/knowledge.service.test.ts
git commit -m "feat(knowledge): getSkills() and exclude skills from RAG search"
```

---

## Task 3: KnowledgeService — skip embedding for skill docs

Skills are injected wholesale, never vector-searched, so they need no embedding. Skipping it also removes the embedding-API-key requirement for adding techniques.

**Files:**
- Modify: `src/modules/knowledge/knowledge.service.ts` (`createDoc`, `updateDoc`)
- Test: `tests/modules/knowledge/knowledge.service.test.ts`

- [x] **Step 1: Write the failing test**

Add inside `describe('createDoc', ...)`:

```ts
    it('does not embed skill docs and stores a NULL embedding', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ id: 'skill-1' }]);

      await service.createDoc({
        title: 'Empathy first',
        content: 'Acknowledge the customer feelings before solving',
        category: 'skill',
        source: 'manual',
      });

      expect(mockEmbeddingService.embed).not.toHaveBeenCalled();
      const sqlCall = mockPrisma.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sqlCall).toContain('INSERT INTO knowledge_docs');
      expect(sqlCall).toContain('NULL');
      expect(sqlCall).not.toContain('::vector');
    });
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- knowledge.service`
Expected: FAIL — `mockEmbeddingService.embed` was called (current code always embeds).

- [x] **Step 3: Branch `createDoc` on the skill category**

Replace the body of `createDoc` in `src/modules/knowledge/knowledge.service.ts` with:

```ts
  async createDoc(input: CreateKnowledgeDocInput): Promise<void> {
    const id = crypto.randomUUID();
    const metadata = JSON.stringify(input.metadata ?? {});

    if (input.category === 'skill') {
      // Skills are injected wholesale into the prompt, never vector-searched — no embedding needed.
      await this.prisma.$queryRawUnsafe(
        `INSERT INTO knowledge_docs (id, title, content, category, source, metadata, embedding, created_at, updated_at)
         VALUES ($1, $2, $3, $4::"KnowledgeCategory", $5::"KnowledgeSource", $6::jsonb, NULL, NOW(), NOW())`,
        id,
        input.title,
        input.content,
        input.category,
        input.source,
        metadata
      );
      return;
    }

    const embeddingText = `${input.title}\n\n${input.content}`;
    const embedding = await this.embeddingService.embed(embeddingText);
    const vectorStr = `[${embedding.join(',')}]`;

    await this.prisma.$queryRawUnsafe(
      `INSERT INTO knowledge_docs (id, title, content, category, source, metadata, embedding, created_at, updated_at)
       VALUES ($1, $2, $3, $4::"KnowledgeCategory", $5::"KnowledgeSource", $6::jsonb, $7::vector, NOW(), NOW())`,
      id,
      input.title,
      input.content,
      input.category,
      input.source,
      metadata,
      vectorStr
    );
  }
```

- [x] **Step 4: Handle skill docs in `updateDoc`**

In `updateDoc`, inside the `if (input.title || input.content)` branch, after loading `existing` and computing `title`/`content`, add a skill short-circuit **before** the `embed` call:

```ts
      if (existing.category === 'skill') {
        await this.prisma.$queryRawUnsafe(
          `UPDATE knowledge_docs SET title = $2, content = $3, embedding = NULL, updated_at = NOW()
           WHERE id = $1`,
          id,
          title,
          content
        );
        return;
      }
```

(The existing embedding-based `UPDATE` remains for non-skill docs.)

- [x] **Step 5: Run the tests to verify they pass**

Run: `npm test -- knowledge.service`
Expected: PASS — new skill test passes, and the existing `createDoc` product test (which asserts `embed` was called) still passes.

- [x] **Step 6: Commit**

```bash
git add src/modules/knowledge/knowledge.service.ts tests/modules/knowledge/knowledge.service.test.ts
git commit -m "feat(knowledge): skip embedding for skill docs (create/update)"
```

---

## Task 4: PromptBuilder — inject a Customer Service Techniques section

**Files:**
- Modify: `src/modules/ai/prompt.builder.ts`
- Test: `tests/modules/ai/prompt.builder.test.ts`

- [x] **Step 1: Update existing tests to the new signature and add a skills test**

`build()` gains a `skills` parameter as the **second** argument. Update `tests/modules/ai/prompt.builder.test.ts` so every `build(...)` call passes `skills` second, and add a new test. Replace the file body (keep imports) with:

```ts
describe('PromptBuilder', () => {
  const builder = new PromptBuilder({
    companyName: 'TestShop',
    systemPromptOverride: undefined,
  });

  it('should build messages array with system prompt, knowledge context, history, and user message', () => {
    const knowledgeContext: VectorSearchResult[] = [
      { id: '1', title: 'Widget', content: 'A premium widget, $29.99', category: 'product', similarity: 0.9 },
    ];
    const history: SessionMessage[] = [
      { role: 'user', content: 'Hi' },
      { role: 'bot', content: 'Hello! How can I help?' },
    ];
    const result: LLMMessage[] = builder.build(knowledgeContext, [], history, 'Tell me about widgets');

    expect(result).toHaveLength(4);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('TestShop');
    expect(result[0].content).toContain('[HANDOFF]');
    expect(result[0].content).toContain('Widget');
    expect(result[0].content).toContain('$29.99');
    expect(result[1]).toEqual({ role: 'user', content: 'Hi' });
    expect(result[2]).toEqual({ role: 'assistant', content: 'Hello! How can I help?' });
    expect(result[3]).toEqual({ role: 'user', content: 'Tell me about widgets' });
  });

  it('should handle empty knowledge context', () => {
    const result = builder.build([], [], [], 'Hi');
    expect(result).toHaveLength(2);
    expect(result[0].content).toContain('No specific product information available');
  });

  it('should allow system prompt override', () => {
    const custom = new PromptBuilder({
      companyName: 'TestShop',
      systemPromptOverride: 'You are a pirate assistant.',
    });
    const result = custom.build([], [], [], 'Ahoy');
    expect(result[0].content).toContain('You are a pirate assistant.');
  });

  it('injects a customer-service techniques section when skills are provided', () => {
    const skills = [{ title: 'Handling price objections', content: 'Reaffirm value before discounting.' }];
    const result = builder.build([], skills, [], 'This is expensive');

    expect(result[0].content).toContain('Customer Service Techniques');
    expect(result[0].content).toContain('Handling price objections');
    expect(result[0].content).toContain('Reaffirm value before discounting.');
  });

  it('omits the techniques section when there are no skills', () => {
    const result = builder.build([], [], [], 'Hi');
    expect(result[0].content).not.toContain('Customer Service Techniques');
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npm test -- prompt.builder`
Expected: FAIL — signature mismatch / missing "Customer Service Techniques" section.

- [x] **Step 3: Rewrite `build`, `buildSystemPrompt`, add `formatSkills`**

Replace `build` and `buildSystemPrompt` in `src/modules/ai/prompt.builder.ts` and add `formatSkills`:

```ts
  build(
    knowledgeContext: VectorSearchResult[],
    skills: Array<{ title: string; content: string }>,
    conversationHistory: SessionMessage[],
    userMessage: string
  ): LLMMessage[] {
    const messages: LLMMessage[] = [];

    messages.push({ role: 'system', content: this.buildSystemPrompt(knowledgeContext, skills) });

    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    }

    messages.push({ role: 'user', content: userMessage });

    return messages;
  }

  private buildSystemPrompt(
    knowledgeContext: VectorSearchResult[],
    skills: Array<{ title: string; content: string }>
  ): string {
    const base =
      this.config.systemPromptOverride ??
      `You are the customer service assistant for ${this.config.companyName}.`;
    const skillsSection = this.formatSkills(skills);
    const knowledgeSection = this.formatKnowledgeContext(knowledgeContext);

    return `${base}${skillsSection}

${knowledgeSection}

--- Rules ---
- Only state facts supported by the Knowledge Base above. Never invent prices, policies, stock, or delivery details.
- If you cannot answer the question or the customer requests a human agent, output [HANDOFF] at the beginning of your response.
- Maintain a friendly, professional tone. Reply in the same language the customer uses.`;
  }

  private formatSkills(skills: Array<{ title: string; content: string }>): string {
    if (skills.length === 0) return '';
    const entries = skills.map((s) => `### ${s.title}\n${s.content}`).join('\n\n');
    return `\n\n--- Customer Service Techniques (how to communicate) ---
Apply these techniques where they fit the situation. They guide HOW you respond, not the facts you state:
${entries}`;
  }
```

Leave `formatKnowledgeContext` unchanged.

- [x] **Step 4: Run the tests to verify they pass**

Run: `npm test -- prompt.builder`
Expected: PASS (all 5 tests).

- [x] **Step 5: Commit**

```bash
git add src/modules/ai/prompt.builder.ts tests/modules/ai/prompt.builder.test.ts
git commit -m "feat(ai): inject customer-service techniques section into the prompt"
```

---

## Task 5: MessagePipeline — fetch skills and pass them to the prompt

**Files:**
- Modify: `src/modules/pipeline/message.pipeline.ts` (steps 6–7)
- Test: `tests/modules/pipeline/message.pipeline.test.ts`

- [x] **Step 1: Update the test deps and add an assertion**

In `tests/modules/pipeline/message.pipeline.test.ts`, add `getSkills` to the mocked `knowledgeService` inside `beforeEach`:

```ts
      knowledgeService: {
        searchSimilar: vi.fn().mockResolvedValue([
          { id: 'doc-1', title: 'Widget', content: 'A great widget', category: 'product', similarity: 0.9 },
        ]),
        getSkills: vi.fn().mockResolvedValue([
          { title: 'Empathy first', content: 'Acknowledge feelings before solving.' },
        ]),
      },
```

Then, inside the first test (`'should process message through full pipeline: AI response'`), add after the `searchSimilar` assertion:

```ts
    expect(deps.knowledgeService.getSkills).toHaveBeenCalled();
    expect(deps.promptBuilder.build).toHaveBeenCalledWith(
      expect.any(Array),
      [{ title: 'Empathy first', content: 'Acknowledge feelings before solving.' }],
      expect.any(Array),
      'Tell me about widgets'
    );
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- message.pipeline`
Expected: FAIL — `getSkills` not called / `build` called with the old 3-arg shape.

- [x] **Step 3: Fetch skills in parallel and pass to `build`**

In `src/modules/pipeline/message.pipeline.ts`, replace step 6 and step 7:

```ts
    // 6. Fetch factual knowledge (RAG) and the skill playbook in parallel
    const [knowledgeContext, skills] = await Promise.all([
      knowledgeService.searchSimilar(incoming.text, 5),
      knowledgeService.getSkills(),
    ]);

    // 7. Build LLM prompt (facts + techniques)
    const messages = promptBuilder.build(knowledgeContext, skills, history, incoming.text);
```

- [x] **Step 4: Run the pipeline tests to verify they pass**

Run: `npm test -- message.pipeline`
Expected: PASS (all pipeline tests — the other tests already have `getSkills` mocked via `beforeEach`).

- [x] **Step 5: Commit**

```bash
git add src/modules/pipeline/message.pipeline.ts tests/modules/pipeline/message.pipeline.test.ts
git commit -m "feat(pipeline): inject skill playbook alongside RAG on every reply"
```

---

## Task 6: Admin API — accept the `skill` category on create

**Files:**
- Modify: `src/modules/admin/knowledge.controller.ts:18-33`

- [x] **Step 1: Widen the POST body type**

In `src/modules/admin/knowledge.controller.ts`, update the `body` type in the `POST /admin/knowledge` handler:

```ts
      const body = request.body as {
        title: string;
        content: string;
        category: 'product' | 'faq' | 'policy' | 'skill';
      };
```

(No other change — `createDoc` already handles the routing by category.)

- [x] **Step 2: Verify the backend typechecks and all tests pass**

Run: `npx tsc --noEmit && npm test`
Expected: exit 0; all tests pass (42 existing + the new ones from Tasks 2–5).

- [x] **Step 3: Commit**

```bash
git add src/modules/admin/knowledge.controller.ts
git commit -m "feat(admin): accept skill category when creating knowledge docs"
```

---

## Task 7: Frontend — Skill tab and form option

**Files:**
- Modify: `web/src/lib/types.ts:3`
- Modify: `web/src/pages/KnowledgePage.tsx`
- Test: `web/src/pages/KnowledgePage.test.tsx`

- [x] **Step 1: Write the failing test**

In `web/src/pages/KnowledgePage.test.tsx`, add this test inside `describe('KnowledgePage', ...)`:

```ts
  it('shows a Skill filter tab', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(docs), { status: 200 }));
    renderPage();
    await waitFor(() => expect(screen.getByText('Return Policy')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Skill' })).toBeInTheDocument();
  });
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cd web && npm test -- KnowledgePage`
Expected: FAIL — no button named "Skill".

- [x] **Step 3: Add `'skill'` to the frontend type**

In `web/src/lib/types.ts`:

```ts
export type KnowledgeCategory = 'product' | 'faq' | 'policy' | 'skill';
```

- [x] **Step 4: Add the Skill tab and form option**

In `web/src/pages/KnowledgePage.tsx`, add to the `categories` array:

```ts
const categories: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'product', label: 'Product' },
  { value: 'faq', label: 'FAQ' },
  { value: 'policy', label: 'Policy' },
  { value: 'skill', label: 'Skill' },
];
```

And add the option to the `<select>` in the create form (after the Policy option):

```tsx
                <option value="product">Product</option>
                <option value="faq">FAQ</option>
                <option value="policy">Policy</option>
                <option value="skill">Skill</option>
```

- [x] **Step 5: Run the frontend tests to verify they pass**

Run: `cd web && npm test`
Expected: PASS (existing 13 tests + the new Skill-tab test).

- [x] **Step 6: Commit**

```bash
git add web/src/lib/types.ts web/src/pages/KnowledgePage.tsx web/src/pages/KnowledgePage.test.tsx
git commit -m "feat(web): add Skill category tab and form option to Knowledge Base"
```

---

## Task 8: Seed a starter skill playbook

**Files:**
- Create: `scripts/seed-skills.js`

- [x] **Step 1: Write the seed script**

Create `scripts/seed-skills.js`:

```js
// Seed a starter set of customer-service technique docs via the admin API.
// Requires the backend running. Skills need no embedding key.
// Usage: node scripts/seed-skills.js
//   Env overrides: PORT (default 3100), ADMIN_EMAIL, ADMIN_PASSWORD

const http = require('http');

const PORT = process.env.PORT || 3100;
const EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const skills = [
  {
    title: 'Empathy and acknowledgment',
    content: 'Before offering a solution, briefly acknowledge the customer feeling or situation (e.g. "I understand how frustrating that is"). This builds trust and de-escalates tension.',
    category: 'skill',
  },
  {
    title: 'Handling price objections',
    content: 'When a customer hesitates on price, do not discount immediately. First reaffirm the value or benefit relevant to their need, then mention any legitimate promotion or the free-shipping threshold, and ask a question to keep the conversation open.',
    category: 'skill',
  },
  {
    title: 'De-escalating frustrated customers',
    content: 'Stay calm and validating. Apologize for the inconvenience without over-promising, restate the problem so they feel heard, then give a clear next step. Avoid defensive language.',
    category: 'skill',
  },
  {
    title: 'Tasteful upsell and cross-sell',
    content: 'Only suggest complementary products when genuinely relevant to what the customer asked about. Frame it as a helpful tip, not a hard sell, and never push if they show disinterest.',
    category: 'skill',
  },
];

function request(path, method, body, token) {
  return new Promise((resolve, reject) => {
    const raw = body ? JSON.stringify(body) : '';
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request({ host: 'localhost', port: PORT, path, method, headers }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d ? JSON.parse(d) : {} }));
    });
    req.on('error', reject);
    if (raw) req.write(raw);
    req.end();
  });
}

(async () => {
  const login = await request('/admin/login', 'POST', { email: EMAIL, password: PASSWORD });
  if (login.status !== 200) throw new Error(`Login failed (${login.status}). Is the backend running on ${PORT}?`);
  const token = login.body.token;

  for (const s of skills) {
    const res = await request('/admin/knowledge', 'POST', s, token);
    console.log(`${res.status === 200 ? 'OK  ' : 'FAIL'} ${s.title}`);
  }
  console.log(`Seeded ${skills.length} skill docs. Open the Knowledge Base -> Skill tab.`);
})().catch((e) => {
  console.error('Seed failed:', e.message);
  process.exit(1);
});
```

- [x] **Step 2: Run the seed against a running backend**

Start infra + backend if needed (`docker compose up -d postgres redis` then `npm run dev`), then:

Run: `node scripts/seed-skills.js`
Expected output: four `OK  <title>` lines and "Seeded 4 skill docs."

- [x] **Step 3: Commit**

```bash
git add scripts/seed-skills.js
git commit -m "chore(dev): add seed script for starter skill playbook"
```

---

## Task 9: End-to-end verification

Confirm skills reach the LLM and shape a real reply. Skills need no embedding key, but the RAG product search still calls the embedding API — so run in `LOCAL_TEST_MODE=true` (stubs embeddings + WhatsApp send) unless you have a real embedding key.

- [x] **Step 1: Ensure `.env` has `LOCAL_TEST_MODE=true` and restart the backend**

Confirm `LOCAL_TEST_MODE=true` is in `.env`, then start: `npm run dev`.
Expected: "Server listening at http://127.0.0.1:3100".

- [x] **Step 2: Seed skills (if not already) and send a test message**

```bash
node scripts/seed-skills.js
node scripts/send-test-message.js "447700900123" "Price Shopper" "This looks a bit expensive, is it worth it?"
```

- [x] **Step 3: Confirm the reply reflects a technique**

Run: check the backend log for the stubbed outgoing message:
`grep -i TEST_MODE /tmp/backend.log | tail -1` (Git Bash) — or read the log file directly.
Expected: the AI reply reaffirms value rather than immediately discounting (the "Handling price objections" technique), instead of a generic answer.

- [x] **Step 4: Confirm in the admin UI**

Open `http://localhost:5173` → Knowledge Base → **Skill** tab.
Expected: the four seeded techniques are listed with category `skill`.

- [x] **Step 5: Full regression**

Run: `npm test && cd web && npm test`
Expected: all backend and frontend tests pass.

---

## Notes & Follow-ups (out of scope for Phase 1)

- **Phase 2 (scenario gating):** if the playbook grows large, add trigger/scenario embeddings or an intent classifier so only relevant techniques are injected. This plan deliberately keeps skills always-on.
- **Prompt bloat:** always-on injection scales with the number of skills. Keep the playbook curated (roughly a dozen concise techniques). If it grows past what fits comfortably in the system prompt, that is the trigger to move to Phase 2.
- **Guardrail:** the "Only state facts supported by the Knowledge Base" rule in the system prompt (Task 4) is what stops persuasion techniques from encouraging invented facts. Keep it if you tweak the prompt.
