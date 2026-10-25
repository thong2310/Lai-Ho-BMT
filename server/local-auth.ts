import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { User } from "../drizzle/schema";

export const LOCAL_SESSION_APP_ID = "laixeho-local";
export const LOCAL_PASSWORD_MIN_LENGTH = 8;
export const LOCAL_PASSWORD_MAX_LENGTH = 128;
export const LOCAL_NAME_MIN_LENGTH = 2;
export const LOCAL_NAME_MAX_LENGTH = 120;

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_SALT_LENGTH = 16;

export type LocalRole = "user" | "driver" | "admin";
export type UserLike = Omit<User, "passwordHash"> & { passwordHash?: string | null };
export type PublicUser = Omit<User, "passwordHash">;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateLocalPassword(password: string): string | null {
  if (password.length < LOCAL_PASSWORD_MIN_LENGTH) {
    return "Mật khẩu phải có ít nhất 8 ký tự";
  }
  if (password.length > LOCAL_PASSWORD_MAX_LENGTH) {
    return "Mật khẩu không được vượt quá 128 ký tự";
  }
  return null;
}

export function validateLocalName(name: string): string | null {
  const length = name.trim().length;
  if (length < LOCAL_NAME_MIN_LENGTH) return "Họ tên phải có từ 2 đến 120 ký tự";
  if (length > LOCAL_NAME_MAX_LENGTH) return "Họ tên phải có từ 2 đến 120 ký tự";
  return null;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(SCRYPT_SALT_LENGTH);
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, encoded: string | null | undefined): boolean {
  const parts = encoded?.split("$") ?? [];
  const validFormat = parts.length === 3 && parts[0] === "scrypt";
  try {
    const salt = validFormat ? Buffer.from(parts[1], "base64url") : Buffer.alloc(SCRYPT_SALT_LENGTH);
    const expected = validFormat
      ? Buffer.from(parts[2], "base64url")
      : Buffer.alloc(SCRYPT_KEY_LENGTH);
    if (salt.length === 0 || expected.length !== SCRYPT_KEY_LENGTH) return false;
    const actual = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
    return validFormat && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Removes passwordHash before any user leaves the server boundary. */
export function toPublicUser(user: UserLike): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

export function isDuplicateDatabaseError(error: unknown): boolean {
  const candidate = error as { code?: string; errno?: number; sqlMessage?: string } | null;
  return candidate?.code === "ER_DUP_ENTRY" || candidate?.errno === 1062;
}

export function isLocalUser(user: User): boolean {
  return user.loginMethod === "local" || user.openId.startsWith("local_");
}
