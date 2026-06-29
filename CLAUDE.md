# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WhatsApp AI Customer Service — an intelligent WhatsApp auto-reply system for e-commerce. Uses LLM + RAG to automatically answer customer inquiries based on a company product knowledge base, with seamless human agent handoff for complex issues.

**Business Context:** E-commerce company with a WooCommerce independent site, running Facebook ads. Customers contact the company via WhatsApp. This system automates customer service responses to handle high inquiry volumes.

## Repository

- **Remote**: https://github.com/txdyc/whatsapp-service.git
- **Branch**: main

## Architecture

- **Type**: Monolith application (single codebase)
- **Runtime**: Node.js + TypeScript
- **Web Framework**: Fastify
- **Database**: PostgreSQL + pgvector (relational + vector search)
- **Cache**: Redis (session caching, pub/sub)
- **ORM**: Prisma
- **Frontend**: React + Vite + Tailwind CSS (admin dashboard)
- **Real-time**: Socket.io (WebSocket for agent workspace)
- **Deployment**: Docker + Docker Compose

## Project Structure

```
src/
├── config/           # Configuration management
├── modules/
│   ├── whatsapp/     # WhatsApp Cloud API webhook & message sending
│   ├── ai/           # LLM abstraction layer (Claude/OpenAI/DeepSeek)
│   ├── knowledge/    # Knowledge base, RAG retrieval, embedding
│   ├── conversation/ # Conversation & session management
│   ├── handoff/      # AI-to-human handoff logic
│   ├── sync/         # WooCommerce product data sync
│   └── admin/        # Admin dashboard API routes
├── common/           # Shared types, utilities
├── database/         # Prisma schema & migrations
└── app.ts            # Application entry point

web/                  # React admin dashboard (separate package)
```

## Key Design Decisions

- **LLM Layer**: Abstracted to support multiple providers (Claude, OpenAI, DeepSeek) switchable via config
- **Knowledge Base**: Uses pgvector for vector similarity search — no separate vector database needed
- **RAG**: Retrieves top-5 relevant documents from knowledge base, injects into LLM prompt as context
- **Handoff**: AI outputs `[HANDOFF]` marker when it cannot handle a query; system automatically transfers to human agent
- **WooCommerce Sync**: Incremental sync via cron (default every 6 hours), using `modified_after` for efficiency
- **Session Management**: Redis caches recent 20 messages per conversation; auto-close after 24h inactivity

## Development Commands

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Database migrations
npx prisma migrate dev

# Build for production
npm run build

# Start production
npm start

# Docker deployment
docker-compose up -d
```

## Current Status

- **Backend**: COMPLETE on branch `feat/backend-implementation` (40/40 tests passing, TypeScript clean)
- **Frontend**: NOT STARTED — needs implementation plan for React admin dashboard (`web/`)
- **PR**: Pending at https://github.com/txdyc/whatsapp-service/pull/new/feat/backend-implementation

## Design & Plans

- Design spec: `docs/superpowers/specs/2026-06-29-whatsapp-ai-customer-service-design.md`
- Backend plan: `docs/superpowers/plans/2026-06-29-whatsapp-service-backend.md`
- Frontend plan: TODO — write plan for React admin dashboard

## Known Technical Notes

- **Prisma 7**: Uses `prisma.config.ts` for DATABASE_URL (not in schema.prisma datasource block)
- **ESM/CJS**: Project is CJS (`"type": "commonjs"`). Use `crypto.randomUUID()` instead of `uuid` package. Use `require('node-cron')` for node-cron.
- **pgvector**: Vector operations use `$queryRawUnsafe` with `::vector` casts (Prisma doesn't support vector type natively)
