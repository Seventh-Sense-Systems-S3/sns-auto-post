# SNS Auto-Post System

## Overview
AI-powered multi-platform social media auto-posting system.
Supports: X (Twitter), Instagram, TikTok, YouTube, LinkedIn.

## Tech Stack
- **Framework**: Next.js 15 (App Router, TypeScript, Tailwind CSS)
- **Database**: Supabase (existing `phoenix-memory-os` project, `sns_` prefix tables)
- **Queue**: Upstash QStash (HTTP-based job scheduling)
- **Cache/Rate Limiting**: Upstash Redis
- **AI**: LiteLLM Proxy (content generation)
- **Auth**: Supabase Auth + Platform OAuth

## 3-Tool Orchestration
| Role | Tool | Scope |
|------|------|-------|
| CTO / Architect | Cowork | Design, directives, review |
| Senior Engineer | Cursor | UI/Frontend (Directives ⑤⑥) |
| Staff Engineer | Claude Code | Infra, API, OAuth, Queue (Directives ①②③④⑦) |
| Owner | shiryu | Final decisions, approvals |

## Rules
- **pnpm only** (no npm/yarn)
- **No hardcoded secrets** — use `.env` + `op://` references
- **All AI calls through LiteLLM proxy** — never call APIs directly
- **TypeScript strict mode**
- **Supabase tables use `sns_` prefix** — coexisting with existing `phoenix-memory-os` tables
- **Conventional commits** — `feat(sns):`, `fix(sns):`, `refactor(sns):`

## Key Directories
```
src/
├── app/           # Next.js App Router pages + API routes
├── lib/
│   ├── supabase/  # Supabase client (browser + server)
│   ├── providers/ # Social media providers (abstract + implementations)
│   ├── queue/     # Upstash QStash job scheduling
│   └── ai/        # LiteLLM content generation
├── types/         # TypeScript types + zod schemas
└── utils/         # Rate limiter, token encryption
```

## Supabase Tables (sns_ prefix)
- `sns_users` — User accounts
- `sns_platform_connections` — OAuth tokens (encrypted)
- `sns_posts` — Post content + status
- `sns_post_adaptations` — Platform-specific content
- `sns_post_publishes` — Publishing records
- `sns_post_analytics` — Engagement metrics
- `sns_rate_limits` — Rate limit tracking
