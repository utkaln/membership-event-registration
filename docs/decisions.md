# Architectural Decisions

This document tracks key architectural and technical decisions made during development.

## Decision Log

| Date | Decision | Rationale | Status |
|------|----------|-----------|--------|
| 2025-12-07 | Use Supabase Local Development for local testing | Complete local environment that mirrors production, includes DB/Auth/Storage | ✓ Decided |
| 2025-12-07 | Renamed `claude/` folder to `prompts/` | Make documentation folder naming more generic | ✓ Implemented |
| 2025-12-07 | Created `docs/` folder for session logs and progress tracking | Separate working documentation from architectural specifications | ✓ Implemented |

---

## Technical Decisions

### Local Development Setup

**Decision**: Use Supabase CLI with local Docker setup

**Options Considered**:
1. Supabase Local Development (Docker-based)
2. Plain PostgreSQL + Supabase Cloud for Auth
3. Full cloud development environment

**Chosen**: Option 1 - Supabase Local Development

**Reasoning**:
- Complete production-like environment
- No internet dependency during development
- Free (no cloud costs during dev)
- Official Supabase CLI support
- Includes all services (DB, Auth, Storage, Realtime)

---

## Implementation Decisions (Phase 1)

### Monorepo Configuration

**Decision**: Use Turborepo 2.6.3 with pnpm workspaces

**Reasoning**:
- Fast, incremental builds with intelligent caching
- Simple configuration vs Nx
- Excellent TypeScript support
- Growing ecosystem and community

**Status**: ✅ Implemented

---

### Framework Versions

**Decision**:
- Next.js 15.1.4 (latest stable)
- NestJS 10.4.8 (stable, not bleeding edge)
- Prisma 6.2.0 (production-ready)

**Reasoning**:
- Next.js 15: Stable release with App Router improvements
- NestJS 10: Enterprise-proven, avoiding v11 until stable
- Prisma 6: Excellent TypeScript support, mature ecosystem

**Status**: ✅ Implemented

---

### Database Triggers vs Application Logic

**Decision**: Use PostgreSQL triggers for critical data integrity (seat counting, waitlist positions)

**Reasoning**:
- Guarantees consistency even if API bypassed
- Atomic operations at database level
- Reduces race conditions
- Backup to application-level logic

**Examples Implemented**:
- `update_event_seat_count()` - Auto-increment/decrement seats
- `assign_waitlist_position()` - Auto-assign queue positions
- `handle_new_auth_user()` - Sync Supabase auth with app users

**Status**: ✅ Implemented

---

### Environment Configuration

**Decision**: Separate .env files per app with clear naming

**Structure**:
- `apps/api/.env` - Backend secrets
- `apps/web/.env.local` - Frontend public/private vars
- `.env.example` files for documentation

**Reasoning**:
- Clear separation of concerns
- Prevents accidental secret exposure
- Next.js convention (.env.local)

**Status**: ✅ Implemented

---

## Future Decisions to Make

- [ ] Specific UI component library implementation (shadcn/ui confirmed in architecture)
- [ ] Testing framework setup (Jest configured, need to write tests)
- [ ] E2E testing tool (Playwright vs Cypress)
- [ ] Error monitoring service (Sentry mentioned in master prompt)
- [ ] CI/CD pipeline configuration (GitHub Actions vs other)
- [ ] Production database provider (Supabase Pro vs alternatives)

---

**Note**: For historical architectural decisions, see `prompts/00_MASTER_PROMPT.md` Decision Log section.
