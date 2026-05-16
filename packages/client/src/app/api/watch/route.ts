import { NextResponse } from "next/server";
import { z } from "zod";
import { providerCategorySchema, runCheck } from "@starter/shared";
import { getSessionFromRequest } from "@/lib/session";
import {
  deleteWatch,
  findWatchByQuery,
  insertWatch,
  listWatches,
} from "@/lib/watch-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const postBodySchema = z.object({
  query: z.string().min(1).max(80),
  categories: z.array(providerCategorySchema).optional(),
  providers: z.array(z.string()).optional(),
});

export async function GET(req: Request): Promise<Response> {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = listWatches(session.user.id);
  return NextResponse.json({
    watches: rows.map((r) => ({
      id: r.id,
      query: r.query,
      categories: r.categories,
      providers: r.providers,
      createdAt: r.createdAt,
      lastRunAt: r.lastRunAt,
      verdict: r.lastSummary?.verdict ?? null,
      rollup: r.lastSummary?.rollup ?? null,
      summary: r.lastSummary,
    })),
  });
}

export async function POST(req: Request): Promise<Response> {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = findWatchByQuery(session.user.id, parsed.data.query);
  if (existing) {
    return NextResponse.json(
      { id: existing.id, existed: true },
      { status: 200 },
    );
  }

  const summary = await runCheck({
    query: parsed.data.query,
    categories: parsed.data.categories,
    providers: parsed.data.providers,
  });

  const row = insertWatch({
    userId: session.user.id,
    query: parsed.data.query,
    categories: parsed.data.categories,
    providers: parsed.data.providers,
    summary,
  });

  return NextResponse.json(
    { id: row.id, existed: false, verdict: summary.verdict },
    { status: 201 },
  );
}

export async function DELETE(req: Request): Promise<Response> {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const removed = deleteWatch(id, session.user.id);
  if (!removed) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
