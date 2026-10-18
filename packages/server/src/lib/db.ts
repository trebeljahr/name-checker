import Database from "better-sqlite3";
import { dirname, isAbsolute, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const DEFAULT_PATH = "./data/auth.db";

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (instance) return instance;

  const raw = process.env.AUTH_DB_PATH ?? DEFAULT_PATH;
  const path = isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
  mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  applyMigrations(db);
  instance = db;
  return db;
}

function applyMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "user" (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT NOT NULL UNIQUE,
      emailVerified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "session" (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      expiresAt TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      ipAddress TEXT,
      userAgent TEXT
    );

    CREATE INDEX IF NOT EXISTS session_userId_idx ON "session"(userId);
    CREATE INDEX IF NOT EXISTS session_token_idx ON "session"(token);

    CREATE TABLE IF NOT EXISTS "account" (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      accountId TEXT NOT NULL,
      providerId TEXT NOT NULL,
      accessToken TEXT,
      refreshToken TEXT,
      accessTokenExpiresAt TEXT,
      refreshTokenExpiresAt TEXT,
      scope TEXT,
      idToken TEXT,
      password TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS account_userId_idx ON "account"(userId);

    CREATE TABLE IF NOT EXISTS "verification" (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS verification_identifier_idx ON "verification"(identifier);

    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      stripe_customer_id TEXT,
      stripe_sub_id TEXT,
      plan TEXT NOT NULL DEFAULT 'free',
      current_period_end TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS subscriptions_customer_idx ON subscriptions(stripe_customer_id);
    CREATE INDEX IF NOT EXISTS subscriptions_sub_idx ON subscriptions(stripe_sub_id);

    CREATE TABLE IF NOT EXISTS usage_log (
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      runs INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    );

    CREATE TABLE IF NOT EXISTS watches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      query TEXT NOT NULL,
      categories_csv TEXT,
      providers_csv TEXT,
      created_at INTEGER NOT NULL,
      last_run_at INTEGER,
      last_summary_json TEXT
    );

    CREATE INDEX IF NOT EXISTS watches_user_idx ON watches(user_id);
    CREATE INDEX IF NOT EXISTS watches_run_idx ON watches(last_run_at);
  `);
}
