# Multi-DB

For apps that connect to more than one database — read replicas, sharded tenants, separate service databases.

## `createConnections`

```typescript
import { createConnections, MultiDatabase, PostgresAdapter, SqliteAdapter } from "@phonemyatt/squn";

const db: MultiDatabase<"primary" | "replica" | "cache"> = createConnections({
  connections: {
    primary: new PostgresAdapter({ url: process.env.PRIMARY_URL! }),
    replica: new PostgresAdapter({ url: process.env.REPLICA_URL! }),
    cache:   new SqliteAdapter({ filename: ":memory:" }),
  },
  default: "primary",
});

// Route to a specific connection
const users = await db.query<User>(sql`SELECT * FROM users`, { connection: "replica" });
const count = await db.queryScalar<number>(sql`SELECT COUNT(*) FROM sessions`, { connection: "cache" });
```

## Scoped connections with `.use()`

```typescript
const replica = db.use("replica");

// All calls on replica go to the replica connection — no connection option needed
const users = await replica.query<User>(sql`SELECT * FROM users`);
const user  = await replica.querySingle<User>(sql`SELECT * FROM users WHERE id = ${1}`);
```

## Concurrent queries

Run independent queries in parallel across connections:

```typescript
const [users, orders, stats] = await db.concurrent(
  db.query<User>(sql`SELECT * FROM users`, { connection: "primary" }),
  db.query<Order>(sql`SELECT * FROM orders`, { connection: "replica" }),
  db.queryScalar<number>(sql`SELECT COUNT(*) FROM events`, { connection: "analytics" }),
);
```

## Read/write routing with `ConnectionGroup`

Automatically routes reads to replicas and writes to primary:

```typescript
import { ConnectionGroup, ConnectionRegistry } from "@phonemyatt/squn";

const registry = new ConnectionRegistry({ primary, replica1, replica2 }, "primary");

const group = new ConnectionGroup(registry, {
  write: "primary",
  read:  ["replica1", "replica2"],
  readMode: "round-robin", // or "random" | "least-load"
});

const readAdapter  = group.getRead();   // round-robins across replicas
const writeAdapter = group.getWrite();  // always primary
```

## Failover groups

Automatically falls over to the next connection on `ConnectionError`:

```typescript
import { FailoverGroup } from "@phonemyatt/squn";

const failover = new FailoverGroup([primary, fallback1, fallback2]);
const db = createConnection(failover);
// On ConnectionError, automatically retries with the next adapter
```

## Tenant routing

```typescript
import { createConnections } from "@phonemyatt/squn";

const db = createConnections({
  connections: {
    tenant_a: new PostgresAdapter({ url: process.env.TENANT_A_URL! }),
    tenant_b: new PostgresAdapter({ url: process.env.TENANT_B_URL! }),
  },
  default: "tenant_a",
});

function getDbForTenant(tenantId: string) {
  return db.use(tenantId as "tenant_a" | "tenant_b");
}
```

## Tenant routing with `forTenant` and `withTenant`

For multi-tenant applications where each tenant has a dedicated connection, squn provides `TenantResolver`, `forTenant`, and `withTenant` to keep routing logic in one place and avoid scattered casts throughout your codebase.

### Setup

```typescript
import {
  createConnections,
  forTenant,
  withTenant,
  TenantResolver,
  PostgresAdapter,
  sql,
} from "@phonemyatt/squn";

const db = createConnections({
  connections: {
    tenant_acme:   new PostgresAdapter({ url: process.env.ACME_DB_URL }),
    tenant_globex: new PostgresAdapter({ url: process.env.GLOBEX_DB_URL }),
  },
  default: "tenant_acme",
});
```

### Define a `TenantResolver`

A `TenantResolver` is a function that maps a tenant ID string to a connection name. Define it once and reuse it everywhere:

```typescript
const resolver: TenantResolver<"tenant_acme" | "tenant_globex"> =
  (tenantId) => `tenant_${tenantId}` as "tenant_acme" | "tenant_globex";
```

### Per-query routing with `withTenant`

Pass the resolved connection name via the `connection` option to route a single query:

```typescript
const tenantId = "acme";

const users = await db.query<User>(
  sql`SELECT * FROM users`,
  { connection: withTenant(resolver, tenantId) },
);
```

`withTenant(resolver, tenantId)` calls the resolver and returns the connection name string. It is equivalent to `resolver(tenantId)` but makes the intent explicit at the call site.

### Scoped instance with `forTenant`

Use `forTenant` to create a `Database` instance already scoped to a tenant. All queries on the returned instance are routed to that tenant's connection — no `connection` option needed:

```typescript
const tenantDb = db.use(forTenant(db, resolver, tenantId));

const orders = await tenantDb.query<Order>(sql`SELECT * FROM orders`);
const stats  = await tenantDb.queryScalar<number>(sql`SELECT COUNT(*) FROM events`);
```

### Combining with request context

In a web framework, derive the tenant from a request header or JWT claim and build a scoped `tenantDb` once per request:

```typescript
async function handleRequest(req: Request): Promise<Response> {
  const tenantId = getTenantFromHeader(req); // your auth logic

  const tenantDb = db.use(forTenant(db, resolver, tenantId));

  const users = await tenantDb.query<User>(sql`SELECT * FROM users`);

  return Response.json(users);
}
```

### Adding tenants dynamically

If tenants are added at runtime, register new connections before using them:

```typescript
db.register(`tenant_${newTenantId}`, new PostgresAdapter({ url: newTenantUrl }));

const tenantDb = db.use(forTenant(db, resolver, newTenantId));
```
