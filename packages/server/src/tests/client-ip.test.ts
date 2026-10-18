import { expect, it } from "vitest";
import { getClientIp } from "../lib/rate-limit-cache";

const req = (headers: Record<string, string>): Request =>
  new Request("http://localhost/api/check", { headers });

it("prefers the visitor Cloudflare names over the edge address", () => {
  expect(
    getClientIp(req({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "172.70.1.1" })),
  ).toBe("203.0.113.7");
});

it("falls back to the first X-Forwarded-For address, then X-Real-IP", () => {
  expect(getClientIp(req({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" }))).toBe("198.51.100.2");
  expect(getClientIp(req({ "x-real-ip": "198.51.100.3" }))).toBe("198.51.100.3");
  expect(getClientIp(req({}))).toBe("unknown");
});
