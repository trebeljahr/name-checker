import type { ProviderCategory } from "@starter/shared";

export type ParsedArgs = {
  query: string;
  compare?: string[];
  categories?: ProviderCategory[];
  providers?: string[];
  excludeProviders?: string[];
  timeoutMs?: number;
  concurrency?: number;
  json: boolean;
  csv: boolean;
  md: boolean;
  strict: boolean;
  showAll: boolean;
  help: boolean;
  list: boolean;
};

const VALID_CATEGORIES: ReadonlyArray<ProviderCategory> = [
  "trademark",
  "domain",
  "social",
  "appstore",
  "package",
  "code",
];

export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    query: "",
    json: false,
    csv: false,
    md: false,
    strict: false,
    showAll: false,
    help: false,
    list: false,
  };
  const positional: string[] = [];
  const compareExplicit: string[] = [];
  let compareFlagged = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case "-h":
      case "--help":
        out.help = true;
        break;
      case "--json":
        out.json = true;
        break;
      case "--csv":
        out.csv = true;
        break;
      case "--md":
      case "--markdown":
        out.md = true;
        break;
      case "--strict":
        out.strict = true;
        break;
      case "--all":
        out.showAll = true;
        break;
      case "--list":
      case "--list-providers":
        out.list = true;
        break;
      case "--compare":
        compareFlagged = true;
        compareExplicit.push(...splitCsv(argv[++i]));
        break;
      case "-c":
      case "--category":
      case "--categories":
        out.categories = parseCategoryList(argv[++i]);
        break;
      case "-p":
      case "--provider":
      case "--providers":
        out.providers = splitCsv(argv[++i]);
        break;
      case "-x":
      case "--exclude":
        out.excludeProviders = splitCsv(argv[++i]);
        break;
      case "-t":
      case "--timeout":
        out.timeoutMs = Number(argv[++i]);
        break;
      case "--concurrency":
        out.concurrency = Number(argv[++i]);
        break;
      default:
        if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
        positional.push(a);
    }
  }

  const names = [...positional, ...compareExplicit].filter(Boolean);
  if (compareFlagged || names.length > 1) {
    out.compare = names;
    out.query = names[0] ?? "";
  } else {
    out.query = names[0] ?? "";
  }

  if (out.csv && out.md) throw new Error("--csv and --md are mutually exclusive");
  if (out.json && (out.csv || out.md))
    throw new Error("--json cannot combine with --csv or --md");

  return out;
}

function splitCsv(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCategoryList(v: string | undefined): ProviderCategory[] {
  return splitCsv(v).map((c) => {
    if (!VALID_CATEGORIES.includes(c as ProviderCategory))
      throw new Error(`Unknown category: ${c}. Valid: ${VALID_CATEGORIES.join(",")}`);
    return c as ProviderCategory;
  });
}
