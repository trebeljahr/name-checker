import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

const COOKIE_NAME = "passport_uid";
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 90;

export type PassportSession = {
  userId: string;
  plan: "free" | "pro";
  signedIn: boolean;
};

export async function getOrCreatePassportSession(): Promise<PassportSession> {
  const jar = await cookies();
  let uid = jar.get(COOKIE_NAME)?.value;
  if (!uid) {
    uid = randomBytes(12).toString("hex");
    jar.set(COOKIE_NAME, uid, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: COOKIE_MAX_AGE_S,
      path: "/",
    });
  }
  return {
    userId: uid,
    plan: process.env.PASSPORT_DEFAULT_PLAN === "pro" ? "pro" : "free",
    signedIn: true,
  };
}

export async function readPassportSession(): Promise<PassportSession | null> {
  const jar = await cookies();
  const uid = jar.get(COOKIE_NAME)?.value;
  if (!uid) return null;
  return {
    userId: uid,
    plan: process.env.PASSPORT_DEFAULT_PLAN === "pro" ? "pro" : "free",
    signedIn: true,
  };
}
