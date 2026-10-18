import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, expect, it } from "vitest";
import { databaseId } from "../lib/database-identity";

const dir = mkdtempSync(join(tmpdir(), "name-checker-identity-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

it("gives every connection to one file the same id and a new file a new id", () => {
  const a = new Database(join(dir, "a.db"));
  const sameFile = new Database(join(dir, "a.db"));
  const other = new Database(join(dir, "b.db"));
  try {
    const id = databaseId(a);
    expect(databaseId(sameFile)).toBe(id);
    expect(databaseId(a)).toBe(id);
    expect(databaseId(other)).not.toBe(id);
  } finally {
    a.close();
    sameFile.close();
    other.close();
  }
});
