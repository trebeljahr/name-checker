"use client";

import { useMemo, useState } from "react";
import type {
  CheckSummary,
  ProviderCategory,
  ProviderResult,
} from "@starter/shared";
import { BulkMatrix, type BulkRow } from "./BulkMatrix";

const ALL_CATEGORIES: ProviderCategory[] = [
  "trademark",
  "domain",
  "social",
  "appstore",
  "package",
  "code",
];

const CATEGORY_LABEL: Record<ProviderCategory, string> = {
  trademark: "Trademarks",
  domain: "Domains",
  social: "Social",
  appstore: "App stores",
  package: "Packages",
  code: "Code",
};

const MAX_BULK = 100;

type Parsed = { query: string; label?: string };

export function BulkForm(): React.ReactElement {
  const [text, setText] = useState<string>("");
  const [parsedFromFile, setParsedFromFile] = useState<Parsed[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [categories, setCategories] = useState<ProviderCategory[]>(ALL_CATEGORIES);
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [running, setRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo<Parsed[]>(() => {
    if (parsedFromFile && parsedFromFile.length > 0) return parsedFromFile;
    return parseText(text);
  }, [text, parsedFromFile]);

  const overLimit = parsed.length > MAX_BULK;

  function toggleCategory(c: ProviderCategory): void {
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    try {
      const raw = await file.text();
      const out = parseCsv(raw);
      if (out.length === 0) {
        setError("No names found in file.");
        setParsedFromFile(null);
        return;
      }
      setParsedFromFile(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setParsedFromFile(null);
    }
  }

  function clearFile(): void {
    setParsedFromFile(null);
    setFileName(null);
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (running) return;
    setError(null);
    if (parsed.length === 0) {
      setError("Add at least one name.");
      return;
    }
    if (overLimit) {
      setError(`Too many names — max ${MAX_BULK}.`);
      return;
    }
    const labelByQuery = new Map<string, string | undefined>();
    for (const p of parsed) {
      const key = p.query.toLowerCase();
      if (!labelByQuery.has(key)) labelByQuery.set(key, p.label);
    }
    const queries = Array.from(
      new Set(parsed.map((p) => p.query.trim()).filter(Boolean)),
    );
    const initRows: BulkRow[] = queries.map((q) => ({
      query: q,
      label: labelByQuery.get(q.toLowerCase()),
      summary: null,
      results: [],
      done: false,
    }));
    setRows(initRows);
    setRunning(true);

    const indexByQuery = new Map(queries.map((q, i) => [q, i]));
    const local: BulkRow[] = initRows.map((r) => ({ ...r, results: [] }));

    try {
      const res = await fetch("/api/check/bulk?stream=1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queries, categories }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(`server ${res.status}: ${text.slice(0, 200)}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split("\n\n");
        buf = blocks.pop() ?? "";
        for (const block of blocks) {
          const ev = parseSseBlock(block);
          if (!ev) continue;
          if (ev.event === "result") {
            const r = ev.data as ProviderResult;
            const idx = indexByQuery.get(r.query);
            if (idx === undefined) continue;
            local[idx] = {
              ...local[idx],
              results: [...local[idx].results, r],
            };
            setRows([...local]);
          } else if (ev.event === "query_done") {
            const s = ev.data as CheckSummary;
            const idx = indexByQuery.get(s.query);
            if (idx === undefined) continue;
            local[idx] = {
              ...local[idx],
              summary: s,
              results: s.results,
              done: true,
            };
            setRows([...local]);
          } else if (ev.event === "error") {
            setError((ev.data as { message: string }).message);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label
              htmlFor="bulk-text"
              className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Paste names
            </label>
            <textarea
              id="bulk-text"
              data-testid="bulk-textarea"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (parsedFromFile) clearFile();
              }}
              rows={8}
              placeholder={"one name per line\nor, comma, separated\nkairos\nlunarcore"}
              disabled={running}
              className="block w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-sm placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none disabled:opacity-50"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Or upload CSV / TXT
            </label>
            <input
              type="file"
              accept=".csv,.txt"
              onChange={onFileChange}
              data-testid="bulk-file"
              disabled={running}
              className="block w-full rounded-md border border-dashed border-border bg-card/50 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-foreground file:px-2 file:py-1 file:text-xs file:font-semibold file:text-background disabled:opacity-50"
            />
            {fileName ? (
              <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-xs">
                <span className="font-mono text-foreground">
                  {fileName} ({parsed.length})
                </span>
                <button
                  type="button"
                  onClick={clearFile}
                  className="text-muted-foreground hover:text-foreground"
                >
                  clear
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                First column = name. Optional second column = label.
              </p>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Categories
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_CATEGORIES.map((c) => {
              const active = categories.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCategory(c)}
                  disabled={running}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground hover:border-foreground/50"
                  } disabled:opacity-50`}
                >
                  {CATEGORY_LABEL[c]}
                </button>
              );
            })}
          </div>
        </div>

        {overLimit && (
          <div className="rounded-md border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
            {parsed.length} names parsed — max is {MAX_BULK}. Trim the list and try again.
          </div>
        )}

        {error && !overLimit && (
          <div className="rounded-md border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            data-testid="bulk-submit"
            disabled={running || parsed.length === 0 || overLimit || categories.length === 0}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running
              ? "Checking…"
              : parsed.length > 0
                ? `Check ${parsed.length} ${parsed.length === 1 ? "name" : "names"}`
                : "Check names"}
          </button>
          {categories.length === 0 && (
            <span className="text-xs text-muted-foreground">
              Pick at least one category.
            </span>
          )}
        </div>
      </form>

      {rows.length > 0 && <BulkMatrix rows={rows} running={running} />}
    </div>
  );
}

function parseText(raw: string): Parsed[] {
  if (!raw.trim()) return [];
  const out: Parsed[] = [];
  const seen = new Set<string>();
  const tokens = raw
    .split(/[\n,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  for (const t of tokens) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ query: t });
  }
  return out;
}

function parseCsv(raw: string): Parsed[] {
  const out: Parsed[] = [];
  const seen = new Set<string>();
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = splitCsvLine(line);
    const query = (cells[0] ?? "").trim();
    if (!query) continue;
    if (out.length === 0 && /^(name|query|candidate)$/i.test(query)) continue;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const label = cells[1]?.trim();
    out.push({ query, label: label && label.length > 0 ? label : undefined });
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseSseBlock(block: string): { event: string; data: unknown } | null {
  const lines = block.split("\n");
  let event = "message";
  let data = "";
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return null;
  }
}
