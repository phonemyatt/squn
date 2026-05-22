# Mapping

squn maps query results to plain objects or class instances. Two approaches: `defineMapper` (functional) and `@Entity` (decorator).

## `defineMapper` — functional

```typescript
import { defineMapper } from "@phonemyatt/squn";

interface User {
  id: number;
  name: string;
  createdAt: Date;
}

const mapUser = defineMapper<User>((row) => ({
  id:        row.id as number,
  name:      row.name as string,
  createdAt: new Date(row.created_at as string),
}));

const users = await db.query<User>(sql`SELECT * FROM users`);
const mapped = users.map(mapUser);
```

## `@Entity` decorator

```typescript
import { Entity } from "@phonemyatt/squn";

@Entity({
  id:        (row) => row.id as number,
  name:      (row) => row.name as string,
  createdAt: (row) => new Date(row.created_at as string),
})
class User {
  constructor(
    public readonly id: number,
    public readonly name: string,
    public readonly createdAt: Date,
  ) {}
}

const users = await db.query<User>(sql`SELECT * FROM users`);
// users are plain Row[] — map via the registry:
import { globalMapperRegistry } from "@phonemyatt/squn";
const mapper = globalMapperRegistry.get(User);
const mapped = users.map(mapper!);
```

## Nested mapping with JOINs

`splitAndMap` splits JOIN result rows at column boundaries and maps into nested objects. Deduplicates by primary key.

```typescript
import { splitAndMap, defineMapper } from "@phonemyatt/squn";

interface Post {
  id: number;
  title: string;
  author: { id: number; name: string };
}

const mapPost   = defineMapper<Omit<Post, "author">>((row) => ({ id: row.id as number, title: row.title as string }));
const mapAuthor = defineMapper<Post["author"]>((row) => ({ id: row.author_id as number, name: row.author_name as string }));

const rows = await db.query(sql`
  SELECT p.id, p.title, u.id AS author_id, u.name AS author_name
  FROM posts p JOIN users u ON p.user_id = u.id
`);

const posts = splitAndMap(rows, ["author_id"], [mapPost, mapAuthor]) as Post[];
```

## Isolated mapper registries

For testing or multi-tenant setups, create an isolated registry instead of using the global one:

```typescript
import { MapperRegistry } from "@phonemyatt/squn";

const registry = new MapperRegistry();
registry.register(User, (row) => new User(row.id as number, row.name as string));

const mapper = registry.get(User);
```
