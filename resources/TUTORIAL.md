# Squn — Step-by-Step Tutorial

Learn Squn by building a task management app from scratch.

---

## Prerequisites

- Bun >= 1.2 installed (`bun --version`)
- Basic TypeScript knowledge
- A terminal

---

## Part 1: Setup

### Create a new project

```bash
mkdir squn-tasks && cd squn-tasks
bun init -y
bun add squn
```

### Create the database schema

Create `src/schema.ts`:

```typescript
import { col, defineTable } from "squn";
import type { InferModel, InferInsert } from "squn";

export const Tasks = defineTable("tasks", {
  id: col.int().primaryKey().readonly(),
  title: col.nvarchar(200).notNull(),
  description: col.text().nullable(),
  status: col.nvarchar(20).notNull(), // "todo" | "doing" | "done"
  priority: col.int().notNull(),
  createdAt: col.datetime().notNull().readonly(),
  completedAt: col.datetime().nullable(),
});

// These types are inferred from the schema — no manual type definitions
export type Task = InferModel<typeof Tasks>;
export type TaskInsert = InferInsert<typeof Tasks>;
```

Notice: `id` and `createdAt` are `.readonly()` — they won't appear in `TaskInsert`. TypeScript enforces this at compile time.

---

## Part 2: Connect and Create Table

Create `src/db.ts`:

```typescript
import { createConnection, sql } from "squn";
import { SqliteAdapter } from "squn/adapters/sqlite";

export const db = createConnection(new SqliteAdapter({ file: "./tasks.db" }));

export async function initDatabase(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      description TEXT,
      status      TEXT NOT NULL DEFAULT 'todo',
      priority    INTEGER NOT NULL DEFAULT 0,
      createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
      completedAt TEXT
    )
  `);
}
```

---

## Part 3: Basic CRUD Operations

Create `src/tasks.ts`:

```typescript
import { sql } from "squn";
import { db } from "./db.ts";
import type { Task, TaskInsert } from "./schema.ts";

// CREATE — insert a new task
export async function createTask(task: TaskInsert): Promise<void> {
  await db.execute(
    sql`INSERT INTO tasks (title, description, status, priority)
        VALUES (${task.title}, ${task.description}, ${task.status}, ${task.priority})`,
  );
}

// READ — get all tasks
export async function getAllTasks(): Promise<Task[]> {
  return db.query<Task>(sql`SELECT * FROM tasks ORDER BY priority DESC, id`);
}

// READ — get one task by ID
export async function getTask(id: number): Promise<Task | null> {
  return db.queryFirst<Task>(sql`SELECT * FROM tasks WHERE id = ${id}`);
}

// UPDATE — change task status
export async function updateStatus(id: number, status: string): Promise<void> {
  const completedAt = status === "done" ? new Date().toISOString() : null;
  await db.execute(
    sql`UPDATE tasks SET status = ${status}, completedAt = ${completedAt} WHERE id = ${id}`,
  );
}

// DELETE — remove a task
export async function deleteTask(id: number): Promise<void> {
  await db.execute(sql`DELETE FROM tasks WHERE id = ${id}`);
}
```

---

## Part 4: Using PreparedQuery for Performance

For queries you call frequently, use `prepare()` to avoid re-parsing the SQL on every call:

```typescript
import { sql } from "squn";
import { db } from "./db.ts";
import type { Task } from "./schema.ts";

// Compiled once — parse + validate + normalize happens here
const findByStatus = db.prepare<Task, { status: string }>(
  sql`SELECT * FROM tasks WHERE status = ${0} ORDER BY priority DESC`,
  ["status"],
);

const countByStatus = db.prepare<number, { status: string }>(
  sql`SELECT COUNT(*) as cnt FROM tasks WHERE status = ${0}`,
  ["status"],
);

// These calls only bind params + execute — no parsing overhead
export async function getTasksByStatus(status: string): Promise<Task[]> {
  return findByStatus.all({ status });
}

export async function countTasks(status: string): Promise<number> {
  return countByStatus.scalar({ status });
}
```

---

## Part 5: Transactions

When you need multiple operations to succeed or fail together:

```typescript
import { sql } from "squn";
import { db } from "./db.ts";

// Move a task to "done" and log the completion — both or neither
export async function completeTask(taskId: number): Promise<void> {
  await db.atomically(async (q) => {
    await q.execute(
      `UPDATE tasks SET status = 'done', completedAt = datetime('now') WHERE id = ?`,
      [taskId],
    );
    await q.execute(
      `INSERT INTO activity_log (task_id, action, ts) VALUES (?, 'completed', datetime('now'))`,
      [taskId],
    );
  });
}
```

If either statement fails, both are rolled back. No partial state.

### Savepoints — partial rollback within a transaction

```typescript
await db.transaction(async (tx) => {
  // This always happens
  await tx.execute("INSERT INTO audit (action) VALUES ('batch_start')", []);

  // This part can fail independently
  const sp = await tx.savepoint();
  try {
    await tx.execute("INSERT INTO risky_table ...", []);
  } catch {
    await sp.rollback(); // Only this insert is undone
    // The audit insert survives
  }

  await tx.execute("INSERT INTO audit (action) VALUES ('batch_end')", []);
});
```

---

## Part 6: Batch Operations

Insert many rows efficiently:

```typescript
import { sql } from "squn";
import { db } from "./db.ts";

const tasks = [
  { title: "Buy groceries", status: "todo", priority: 1, description: null },
  { title: "Write tests", status: "todo", priority: 3, description: null },
  { title: "Deploy to prod", status: "todo", priority: 5, description: null },
];

// One prepared statement, executed once per row — single round trip
const result = await db.executeBatch(
  sql`INSERT INTO tasks (title, status, priority, description) VALUES (@title, @status, @priority, @description)`,
  tasks,
);

console.log(`Inserted ${result.rowsAffected} tasks`);
```

---

## Part 7: Streaming Large Results

When you have millions of rows, use streaming to avoid loading everything into memory:

```typescript
import { sql } from "squn";
import { db } from "./db.ts";
import type { Task } from "./schema.ts";

let count = 0;
for await (const task of db.stream<Task>(sql`SELECT * FROM tasks`)) {
  count++;
  // Process one row at a time — bounded memory
}
console.log(`Processed ${count} tasks`);
```

---

## Part 8: Error Handling

Squn errors are typed and carry context for debugging:

```typescript
import { sql, QueryError, ErrorCode } from "squn";
import { db } from "./db.ts";
import type { Task } from "./schema.ts";

async function getTaskOrFail(id: number): Promise<Task> {
  try {
    return await db.querySingle<Task>(
      sql`SELECT * FROM tasks WHERE id = ${id}`,
    );
  } catch (err) {
    if (err instanceof QueryError && err.code === ErrorCode.NO_ROWS_FOUND) {
      throw new Error(`Task ${id} not found`);
    }
    throw err; // Re-throw unexpected errors
  }
}
```

---

## Part 9: Put It All Together

Create `src/main.ts`:

```typescript
import { initDatabase } from "./db.ts";
import {
  createTask,
  getAllTasks,
  updateStatus,
  getTasksByStatus,
  countTasks,
} from "./tasks.ts";

await initDatabase();

// Create some tasks
await createTask({
  title: "Learn Squn",
  description: "Read the tutorial",
  status: "doing",
  priority: 5,
});
await createTask({
  title: "Build an app",
  description: null,
  status: "todo",
  priority: 3,
});
await createTask({
  title: "Write tests",
  description: "100% coverage",
  status: "todo",
  priority: 4,
});

// Query
const all = await getAllTasks();
console.log(`Total tasks: ${all.length}`);

const todoCount = await countTasks("todo");
console.log(`Todo: ${todoCount}`);

// Update
await updateStatus(1, "done");

// Query by status
const done = await getTasksByStatus("done");
console.log(
  `Done:`,
  done.map((t) => t.title),
);
```

Run it:

```bash
bun run src/main.ts
```

Output:

```
Total tasks: 3
Todo: 2
Done: [ "Learn Squn" ]
```

---

## Part 10: Switching Databases

The same code works with PostgreSQL — just change the adapter:

```typescript
import { createConnection } from "squn";
import { PostgresAdapter } from "squn/adapters/postgres";

export const db = createConnection(
  new PostgresAdapter({ url: "postgresql://user:pass@localhost:5432/tasks" }),
);
```

Your schema, queries, transactions, and PreparedQuery objects all work unchanged. The adapter handles the driver-specific details.

---

## What's Next

- Read the [Reference Manual](./MANUAL.md) for the complete API
- Read the [Assessment](./ASSESSMENT.md) for architecture details
- Check `examples/quickstart.ts` in the Squn repo for a runnable demo
- Run `bun test` in the Squn repo to see the full test suite
