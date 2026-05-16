export function slug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function handle(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_]+/g, "");
}

export function domainLabel(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/^-+|-+$/g, "");
}

export function safeQuery(input: string): string {
  return input.trim().slice(0, 80);
}
