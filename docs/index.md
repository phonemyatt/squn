---
layout: home

hero:
  name: squn
  text: Type-safe SQL for Bun
  tagline: SQLite, PostgreSQL, MySQL, and MSSQL — one unified API, no codegen, zero magic.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /api/

features:
  - title: Tagged template SQL
    details: Values are always parameterised. Nested fragments merge with renumbered placeholders. SQL injection is structurally impossible.
  - title: Four adapters, one interface
    details: SQLite (bun:sqlite), PostgreSQL, MySQL (Bun native), and MSSQL (mssql). Switch adapters without changing query code.
  - title: Full TypeScript strictness
    details: Strict mode, noUncheckedIndexedAccess, exactOptionalPropertyTypes, verbatimModuleSyntax — all on. No any, no non-null assertions.
  - title: No codegen
    details: Define your schema with col() and defineTable(). Types are inferred — no build step, no generated files, no ORM magic.
  - title: Batteries included
    details: Connection pooling, transactions with savepoints, deadlock retry, TVP support, prepared queries, read/write routing, failover groups.
  - title: Bun-native
    details: Built for Bun 1.x. Uses bun:sqlite, Bun's native Postgres and MySQL clients, and Bun.sleep for backoff. Zero unnecessary dependencies.
---
