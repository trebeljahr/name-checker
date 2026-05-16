import type { ProviderCategory } from "@starter/shared";

export type ParsedArgs = {
  query: string;
  categories?: ProviderCategory[];
  providers?: string[];
  excludeProviders?: string[];
  timeoutMs?: number;
  concurrency?: number;
  json: boolean;
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
    showAll: false,
    help: false,
    list: false,
  };
  const positional: string[] = [];
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
      case "--all":
        out.showAll = true;
        break;
      case "--list":
      case "--list-providers":
        out.list = true;
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
  out.query = positional.join(" ").trim();
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
