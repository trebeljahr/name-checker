import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

const known = new WeakMap<Database.Database, string>();

/**
 * Random id stored once in the database file. Containers that report the
 * same id share one file; a container started on an empty volume reports
 * a new one. Moving the app to another Coolify resource is only safe when
 * the replacement reports the id production reports.
 */
export function databaseId(db: Database.Database): string {
  const cached = known.get(db);
  if (cached) return cached;
  db.exec(`
    CREATE TABLE IF NOT EXISTS database_identity (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      id TEXT NOT NULL
    );
  `);
  // Two containers may start on the same file at once: only one row wins.
  db.prepare(
    "INSERT OR IGNORE INTO database_identity (singleton, id) VALUES (1, ?)",
  ).run(randomUUID());
  const row = db
    .prepare("SELECT id FROM database_identity WHERE singleton = 1")
    .get() as { id: string };
  known.set(db, row.id);
  return row.id;
}
