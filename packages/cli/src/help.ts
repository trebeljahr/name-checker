export const HELP = `name-check — check name availability across trademarks, domains, socials, app stores, package registries, and code hosts.

Usage:
  name-check <name> [options]
  name-check <name1> <name2> [...] [options]      (compare mode)
  name-check --compare <name1,name2,...> [options] (compare mode)
  name-check --list

Options:
  -c, --category <list>      comma list: trademark,domain,social,appstore,package,code
  -p, --provider <list>      comma list of provider ids (overrides categories)
  -x, --exclude  <list>      comma list of provider ids to skip
  -t, --timeout  <ms>        per-provider timeout (default 12000)
      --concurrency <n>      max parallel requests (default 10)
      --compare <names>      comma list of names to render side-by-side (also enabled by 2+ positional args)
      --all                  show all rows including 'unknown'
      --json                 emit machine-readable JSON
      --csv                  emit CSV (columns: query,providerId,providerName,category,status,detail,verifyUrl,durationMs)
      --md                   emit Markdown tables grouped by category
      --strict               exit 1 if ANY result is 'taken' or 'partial' (default: exit 1 only on 'likely_taken' verdict)
      --variants <n>         after the check, suggest N similar names and re-run a quick check on each (deterministic, no LLM)
      --list                 list available providers and exit
  -h, --help                 show this help

Examples:
  name-check kairosprotocol
  name-check outpostkairos -c trademark,domain
  name-check kairos -p tmview,domain-com,domain-gg,bluesky --json
  name-check kairos -x x,instagram,tiktok
  name-check --compare kairosprotocol,outpostkairos -c domain,package
  name-check kairosprotocol outpostkairos -c domain
  name-check apple --csv > apple.csv
  name-check apple --md > apple.md
  name-check apple --strict -c package      # exit 1 if any package is taken/partial
  name-check kairos --variants 10           # suggest 10 similar names with quick verdict each
`;
