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
