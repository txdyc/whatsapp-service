# WhatsApp AI Customer Service - Design Spec

## Overview

An AI-powered WhatsApp customer service system for an e-commerce business. The system automatically responds to customer inquiries via WhatsApp using LLM + RAG (Retrieval-Augmented Generation), leveraging the company's product knowledge base. When AI cannot handle a query, it seamlessly hands off to a human agent.

**Business Context:** The company operates an e-commerce independent site (WooCommerce) and runs ads on Facebook. Customers contact the company's WhatsApp for inquiries. This system automates responses to handle high inquiry volumes.

## Architecture

**Approach:** Monolith application (single codebase, single deployment unit)

**Rationale:** Fast development, simple deployment, easy debugging. Sufficient for daily message volumes under 10,000. Can be decomposed into microservices later if needed.

```
                          ┌─────────────────┐
                          │   WhatsApp User  │
                          └────────┬────────┘
                                   │ (sends message)
                                   ▼
                          ┌─────────────────┐
                          │  Meta Cloud API  │
                          └────────┬────────┘
                                   │ Webhook POST
                                   ▼
┌──────────────────────────────────────────────────────────┐
│                   WhatsApp Service                       │
│                                                          │
│  ┌─────────────┐   ┌─────────────┐   ┌───────────────┐  │
│  │  Webhook     │──▶│  Message     │──▶│  AI Engine    │  │
│  │  Controller  │   │  Router      │   │  (LLM + RAG) │  │
│  └─────────────┘   └─────────────┘   └───────┬───────┘  │
│                                               │          │
│  ┌─────────────┐   ┌─────────────┐   ┌───────▼───────┐  │
│  │  Admin API   │   │  WooCommerce│   │  Knowledge    │  │
│  │  + Web UI    │   │  Sync       │   │  Base (RAG)   │  │
│  └─────────────┘   └─────────────┘   └───────────────┘  │
│                                                          │
│  ┌─────────────┐   ┌─────────────┐                      │
│  │  Human       │   │  Session    │                      │
│  │  Handoff     │   │  Manager   │                      │
│  └─────────────┘   └─────────────┘                      │
├──────────────────────────────────────────────────────────┤
│  PostgreSQL + pgvector    │  Redis (cache/session)       │
└──────────────────────────────────────────────────────────┘
```

### Core Modules

| Module | Responsibility |
|--------|---------------|
| **Webhook Controller** | Receives WhatsApp messages from Meta, verifies signatures, parses payloads |
| **Message Router** | Routes messages to AI or human agent based on conversation status |
| **AI Engine** | Calls LLM (Claude/OpenAI/DeepSeek), builds prompts with RAG context |
| **Knowledge Base (RAG)** | Vector-based retrieval of product info, FAQs, policies |
| **WooCommerce Sync** | Periodically syncs product data from WooCommerce to knowledge base |
| **Human Handoff** | Transfers conversation to human agent when AI cannot handle it |
| **Session Manager** | Manages conversation context, maintains multi-turn coherence |
| **Admin API + Web UI** | Dashboard: conversation logs, knowledge base management, agent workspace, analytics |

## Data Model

### conversations

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Primary key |
| wa_contact_id | VARCHAR | WhatsApp contact identifier |
| contact_name | VARCHAR | Customer display name |
| contact_phone | VARCHAR | Customer phone number |
| status | ENUM | `ai` / `human` / `closed` |
| assigned_agent_id | UUID (FK, nullable) | Assigned human agent |
| created_at | TIMESTAMP | Creation time |
| updated_at | TIMESTAMP | Last update time |

### messages

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Primary key |
| conversation_id | UUID (FK) | Parent conversation |
| role | ENUM | `user` / `bot` / `agent` |
| content | TEXT | Message content |
| wa_message_id | VARCHAR | WhatsApp message ID (for deduplication) |
| created_at | TIMESTAMP | Creation time |

### agents

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Primary key |
| name | VARCHAR | Agent display name |
| email | VARCHAR (unique) | Login email |
| password_hash | VARCHAR | Bcrypt hashed password |
| role | ENUM | `admin` / `agent` |
| is_active | BOOLEAN | Account status |
| created_at | TIMESTAMP | Creation time |

### knowledge_docs

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Primary key |
| title | VARCHAR | Document title |
| content | TEXT | Document content |
| category | ENUM | `product` / `faq` / `policy` |
| source | ENUM | `woocommerce` / `manual` |
| metadata | JSONB | Extra data (WooCommerce product ID, price, etc.) |
| embedding | VECTOR(1536) | pgvector embedding for similarity search |
| created_at | TIMESTAMP | Creation time |
| updated_at | TIMESTAMP | Last update time |

## Message Processing Flow

```
Customer sends WhatsApp message
        │
        ▼
[Webhook receives & verifies signature]
        │
        ▼
[Find/create conversation]
        │
        ▼
[Check conversation.status]
        │
    ┌───┴───────────────┐
    │                   │
  status=ai         status=human
    │                   │
    ▼                   ▼
[Session Manager:    [Store message in DB,
 load recent N       notify human agent
 messages]           via WebSocket]
    │
    ▼
[Knowledge Base:
 vector search top-K relevant docs]
    │
    ▼
[Build prompt:
 system prompt + knowledge context
 + conversation history + user message]
    │
    ▼
[Call LLM to generate reply]
    │
    ▼
[Check for handoff signal]
    │
  ┌─┴──────────┐
  │            │
 Normal      Handoff triggered
  │            │
  ▼            ▼
[Send reply   [Set status=human,
 via WhatsApp  notify agent,
 API]          send "connecting you
  │            to an agent" message]
  ▼
[Save message to DB]
```

### AI-to-Human Handoff Triggers

1. AI outputs `[HANDOFF]` marker (instructed in system prompt for complaints, refunds, technical issues)
2. Customer explicitly requests a human ("let me talk to a person", "I want to speak to someone")
3. Configurable: after N consecutive unsatisfactory AI replies

### Session Context Management

- Redis caches the most recent N messages per conversation (default: 20)
- Beyond N, older messages are loaded from PostgreSQL on demand
- Sessions auto-close after configurable timeout (default: 24 hours of inactivity)

## Knowledge Base & RAG

### Data Sources

| Source | Sync Method | Content |
|--------|------------|---------|
| WooCommerce products | Scheduled cron (default: every 6 hours) | Product name, description, price, stock, specs, categories |
| FAQ documents | Manual upload via admin UI | Common questions and standard answers |
| Policy documents | Manual upload via admin UI | Return/refund policy, shipping rules, warranty terms |

### RAG Retrieval Flow

```
User message ──▶ Embedding API ──▶ Vectorize
                                      │
                                      ▼
                         pgvector similarity search (top-5)
                                      │
                                      ▼
                         Relevant docs ──▶ Inject into LLM prompt as context
```

### Prompt Structure

```
[System Prompt]
You are the customer service assistant for {company_name}.
Answer customer questions based on the product information and policies below.
If you cannot answer, output [HANDOFF].
Maintain a friendly, professional tone. Reply in English.

[Knowledge Context]
--- Relevant Product Information ---
{RAG retrieval results}

[Conversation History]
{Recent N messages}

[User Message]
{Current user message}
```

### WooCommerce Sync Logic

- Pull product data via WooCommerce REST API
- Format product info into structured text (name, description, price, specs, etc.)
- Generate embeddings via Embedding API
- Store in `knowledge_docs` table
- Incremental sync: use `modified_after` parameter to only pull updated products

## Admin Dashboard

### Feature Modules

| Module | Features |
|--------|----------|
| **Dashboard** | Today's conversations, AI resolution rate, average response time, pending tickets |
| **Conversation Management** | List all conversations, view details, filter by status |
| **Agent Workspace** | Real-time conversation takeover, reply to WhatsApp messages from the dashboard |
| **Knowledge Base Management** | View/add/edit/delete knowledge docs, manually trigger WooCommerce sync |
| **Settings** | AI model config, system prompt editor, WooCommerce connection config, WhatsApp API config |

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Runtime** | Node.js + TypeScript | Strong async I/O, unified language for front and back |
| **Web Framework** | Fastify | Better performance than Express, excellent TypeScript support |
| **Database** | PostgreSQL + pgvector | Relational data + vector search in one database |
| **Cache** | Redis | Session caching, pub/sub for real-time notifications |
| **ORM** | Prisma | Type-safe queries, migration management |
| **Frontend** | React + Vite + Tailwind CSS | Admin dashboard SPA |
| **Real-time** | WebSocket (Socket.io) | Real-time message push to agent workspace |
| **Embedding** | OpenAI text-embedding-3-small | Cost-effective, switchable to other embedding models |
| **LLM** | Abstracted LLM layer | Supports Claude, OpenAI, DeepSeek — switchable via config |
| **Deployment** | Docker + Docker Compose | One-command deployment with PostgreSQL, Redis included |
| **Scheduled Tasks** | node-cron | WooCommerce data sync scheduling |

## Project Structure

```
whatsapp-service/
├── src/
│   ├── config/           # Configuration management (env, constants)
│   ├── modules/
│   │   ├── whatsapp/     # WhatsApp webhook handler & message sending
│   │   ├── ai/           # LLM abstraction, prompt building, model switching
│   │   ├── knowledge/    # Knowledge base, RAG retrieval, embedding
│   │   ├── conversation/ # Conversation & session management
│   │   ├── handoff/      # Human handoff logic
│   │   ├── sync/         # WooCommerce data sync
│   │   └── admin/        # Admin dashboard API routes
│   ├── common/           # Shared types, utilities, error handling
│   ├── database/         # Prisma schema & migrations
│   └── app.ts            # Application entry point
├── web/                  # React admin dashboard frontend
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Page components (Dashboard, Conversations, etc.)
│   │   ├── services/     # API client
│   │   └── App.tsx       # Frontend entry point
│   └── package.json
├── docker-compose.yml    # PostgreSQL, Redis, app services
├── Dockerfile
├── package.json
├── tsconfig.json
└── .env.example          # Environment variable template
```

## Environment Variables

```
# WhatsApp Cloud API
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=

# LLM Configuration
LLM_PROVIDER=claude          # claude | openai | deepseek
CLAUDE_API_KEY=
OPENAI_API_KEY=
DEEPSEEK_API_KEY=

# Embedding
EMBEDDING_API_KEY=
EMBEDDING_MODEL=text-embedding-3-small

# WooCommerce
WOOCOMMERCE_URL=
WOOCOMMERCE_CONSUMER_KEY=
WOOCOMMERCE_CONSUMER_SECRET=
WOOCOMMERCE_SYNC_INTERVAL_HOURS=6

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/whatsapp_service

# Redis
REDIS_URL=redis://localhost:6379

# Admin
ADMIN_JWT_SECRET=
ADMIN_DEFAULT_EMAIL=admin@example.com
ADMIN_DEFAULT_PASSWORD=

# App
PORT=3000
NODE_ENV=production
```

## Error Handling

- **WhatsApp API failures:** Retry with exponential backoff (max 3 retries), log failures
- **LLM API failures:** Fallback message: "Sorry, I'm having trouble right now. Let me connect you with a team member." + auto-trigger handoff
- **WooCommerce sync failures:** Log error, continue with existing data, retry on next scheduled run
- **Webhook signature verification failure:** Return 401, log suspicious requests

## Security Considerations

- All WhatsApp webhook requests verified via HMAC signature
- Admin dashboard behind JWT authentication
- Passwords hashed with bcrypt
- Environment variables for all secrets (never hardcoded)
- Rate limiting on webhook and admin API endpoints
- Input sanitization before LLM prompt injection
