---
name: init-project
description: Scan the current project, detect its full tech stack, and generate AGENTS.md with structured context for future Claude agents. Use when starting work on a new or unfamiliar codebase.
allowed-tools: Glob Read Grep Write
effort: medium
---

# init-project

Detect the project's stack and write `AGENTS.md` at the root for future agents.

## 1. Scan (Glob/Read — never guess)

- **Languages**: `package.json` (Node/JS/TS), `tsconfig.json` (TS), `requirements.txt`/`pyproject.toml`/`setup.py`/`Pipfile` (Python), `Cargo.toml` (Rust), `go.mod` (Go), `pom.xml`/`build.gradle(.kts)` (Java/Kotlin), `*.csproj`/`*.sln` (.NET), `Gemfile` (Ruby), `composer.json` (PHP), `pubspec.yaml` (Dart/Flutter).
- **Frameworks**: package.json `next`, `react`, `vue`, `svelte`, `angular`, `express`, `fastify`, `hono`, `remix`, `astro`, `nuxt`, `gatsby`; Python `django`, `flask`, `fastapi`, `sqlalchemy`; Cargo `axum`, `actix-web`, `rocket`; Go `gin`, `echo`, `fiber`.
- **DB/ORM**: `prisma`, `drizzle-orm`, `typeorm`, `sequelize`, `mongoose`, `pg`, `mysql2`, `sqlite3`, `redis`, `supabase`, `@planetscale`, `@neon`; `prisma/schema.prisma`, `drizzle.config.*`.
- **Styling**: `tailwind.config.*`; `styled-components`, `@emotion`, `sass`, `less`, `@mui`, `@chakra-ui`, `@radix-ui`, `shadcn`.
- **Build**: `vite.config.*`, `webpack.config.*`, `turbo.json`, `nx.json`, `rollup.config.*`, `.swcrc`.
- **Testing**: `jest`, `vitest`, `@testing-library`, `playwright`, `cypress`, `mocha`; `pytest.ini`/`conftest.py`; `jest.config.*`, `vitest.config.*`.
- **Infra**: `Dockerfile`, `docker-compose.*`, `.github/workflows/`, `vercel.json`/`.vercel/`, `netlify.toml`, `fly.toml`, `terraform/`/`*.tf`, `kubernetes/`/`k8s/`/YAML with `kind: Deployment`.
- **Monorepo**: `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, `packages/`/`apps/`.
- **Package manager**: `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `package-lock.json`.
- **Env/config**: `.env`, `.env.example`, `.env.local` (keys only, never values); root `*.config.{ts,js}`.

## 2. Read in full

`package.json`, `tsconfig.json`, `prisma/schema.prisma` or `drizzle.config.*`, `README.md` (first 80 lines), `.env.example` (keys only).

## 3. Classify

One or more of: `web-app`, `api`, `fullstack`, `cli`, `library`, `mobile`, `monorepo`, `infrastructure`.

## 4. Write `AGENTS.md`

Use actual versions from dependency files; omit anything uncertain.

```markdown
# Project Context

## Project Type
<!-- e.g., fullstack web-app, monorepo -->

## Stack

### Language & Runtime
<!-- e.g., TypeScript 5.4, Node.js 20 -->

### Framework
<!-- e.g., Next.js 14 (App Router) -->

### Styling
<!-- e.g., Tailwind CSS 3.4, shadcn/ui -->

### Database & ORM
<!-- e.g., PostgreSQL via Prisma 5.x -->

### Testing
<!-- e.g., Vitest, Playwright for E2E -->

### Build & Tooling
<!-- e.g., Vite, Turborepo, pnpm workspaces -->

### Deployment
<!-- e.g., Vercel (frontend), Docker (API) -->

## Project Structure
<!-- Top-level directories and their purpose -->

## Environment Variables
<!-- .env keys (no values) and purpose if inferable -->

## Development Commands
<!-- From package.json scripts or README -->
```

## 5. Report

Detected stack, file location, and gaps that could not be determined.
