export const HELP = `name-check — check name availability across trademarks, domains, socials, app stores, package registries, and code hosts.

Usage:
  name-check <name> [options]
  name-check --list

Options:
  -c, --category <list>      comma list: trademark,domain,social,appstore,package,code
  -p, --provider <list>      comma list of provider ids (overrides categories)
  -x, --exclude  <list>      comma list of provider ids to skip
  -t, --timeout  <ms>        per-provider timeout (default 12000)
      --concurrency <n>      max parallel requests (default 10)
      --all                  show all rows including 'unknown'
      --json                 emit machine-readable JSON
      --list                 list available providers and exit
  -h, --help                 show this help

Examples:
  name-check kairosprotocol
  name-check outpostkairos -c trademark,domain
  name-check kairos -p tmview,domain-com,domain-gg,bluesky --json
  name-check kairos -x x,instagram,tiktok
`;
