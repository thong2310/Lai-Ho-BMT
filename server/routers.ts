import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieName, getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { domainRouters } from "./domain-router";
import { mapsRouter } from "./maps/router";
import { locationRouter } from "./location-router";
import { paymentsRouter } from "./payments";
import * as db from "./db";
import {
  hashPassword,
  isDuplicateDatabaseError,
  normalizeEmail,
  toPublicUser,
  validateLocalName,
  validateLocalPassword,
  verifyPassword,
} from "./local-auth";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import type { InsertUser } from "../drizzle/schema";

const localRegistrationInput = z.object({
  name: z.string(),
  email: z.string(),
  password: z.string(),
});
const localLoginInput = z.object({
  email: z.string(),
  password: z.string(),
  role: z.enum(["customer", "driver", "admin"]),
});
const passwordChangeInput = z.object({
  currentPassword: z.string(),
  newPassword: z.string(),
});
const INVALID_CREDENTIALS = "Email hoặc mật khẩu không đúng";
const DUPLICATE_EMAIL = "Email này đã được sử dụng";

function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

function setLocalSessionCookie(
  ctx: {
    req: Parameters<typeof getSessionCookieName>[0];
    res: { cookie: Function };
  },
  token: string,
) {
  ctx.res.cookie(getSessionCookieName(ctx.req), token, {
    ...getSessionCookieOptions(ctx.req),
    maxAge: 365 * 24 * 60 * 60 * 1000,
  });
}

async function registerLocalUser(
  input: { name: string; email: string; password: string },
  role: "user" | "driver",
) {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const nameError = validateLocalName(name);
  const passwordError = validateLocalPassword(input.password);
  if (nameError) badRequest(nameError);
  if (!email || !email.includes("@") || email.length > 320)
    badRequest("Email không hợp lệ");
  if (passwordError) badRequest(passwordError);
  if (await db.getUserByEmail(email))
    throw new TRPCError({ code: "CONFLICT", message: DUPLICATE_EMAIL });
  const now = new Date();
  const values: InsertUser = {
    openId: `local_${randomUUID()}`,
    name,
    email,
    passwordHash: hashPassword(input.password),
    loginMethod: "local",
    role,
    lastSignedIn: now,
  };
  let user;
  try {
    user = await db.insertLocalUser(values);
  } catch (error) {
    if (isDuplicateDatabaseError(error))
      throw new TRPCError({ code: "CONFLICT", message: DUPLICATE_EMAIL });
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Dịch vụ xác thực tạm thời không khả dụng",
    });
  }
  if (!user)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Dịch vụ xác thực tạm thời không khả dụng",
    });
  const sessionToken = await sdk.signLocalSession(user.openId, {
    name: user.name ?? email,
  });
  return { user: toPublicUser(user), sessionToken };
}

async function loginLocalUser(input: {
  email: string;
  password: string;
  role: "customer" | "driver" | "admin";
}) {
  const email = normalizeEmail(input.email);
  const role = input.role === "customer" ? "user" : input.role;
  let user = email ? await db.getUserByEmail(email, role) : undefined;
  if (!user && role === "admin") {
    const bootstrapEmail = normalizeEmail(ENV.localAdminEmail);
    const bootstrapPassword = ENV.localAdminPassword;
    if (
      email &&
      email === bootstrapEmail &&
      input.password === bootstrapPassword
    ) {
      const name = (ENV.localAdminName || "Quản trị hệ thống")
        .trim()
        .slice(0, 120);
      const values: InsertUser = {
        openId: `local_admin_${randomUUID()}`,
        name: name || "Quản trị hệ thống",
        email,
        passwordHash: hashPassword(input.password),
        loginMethod: "local",
        role: "admin",
        lastSignedIn: new Date(),
      };
      try {
        user = await db.insertLocalUser(values);
      } catch (error) {
        if (!isDuplicateDatabaseError(error))
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message: "Dịch vụ xác thực tạm thời không khả dụng",
          });
        user = await db.getUserByEmail(email, "admin");
      }
    }
  }
  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: INVALID_CREDENTIALS });
  }
  const sessionToken = await sdk.signLocalSession(user.openId, {
    name: user.name ?? email,
  });
  return { user: toPublicUser(user), sessionToken };
}

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) =>
      opts.ctx.user ? toPublicUser(opts.ctx.user) : null,
    ),
    localRegisterCustomer: publicProcedure
      .input(localRegistrationInput)
      .mutation(async ({ ctx, input }) => {
        const result = await registerLocalUser(input, "user");
        setLocalSessionCookie(ctx, result.sessionToken);
        return result;
      }),
    localRegisterDriver: publicProcedure
      .input(localRegistrationInput)
      .mutation(async ({ ctx, input }) => {
        const result = await registerLocalUser(input, "driver");
        setLocalSessionCookie(ctx, result.sessionToken);
        return result;
      }),
    localLogin: publicProcedure
      .input(localLoginInput)
      .mutation(async ({ ctx, input }) => {
        const result = await loginLocalUser(input);
        setLocalSessionCookie(ctx, result.sessionToken);
        return result;
      }),
    admin: router({
      account: adminProcedure.query(({ ctx }) => toPublicUser(ctx.user)),
      changePassword: adminProcedure
        .input(passwordChangeInput)
        .mutation(async ({ ctx, input }) => {
          const currentError = validateLocalPassword(input.currentPassword);
          const newError = validateLocalPassword(input.newPassword);
          if (currentError || newError) badRequest(currentError ?? newError!);
          if (!verifyPassword(input.currentPassword, ctx.user.passwordHash)) {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: INVALID_CREDENTIALS,
            });
          }
          await db.updateUserPassword(
            ctx.user.openId,
            hashPassword(input.newPassword),
          );
          return { success: true } as const;
        }),
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(getSessionCookieName(ctx.req), {
        ...cookieOptions,
        maxAge: -1,
      });
      return {
        success: true,
      } as const;
    }),
  }),
  maps: mapsRouter,
  location: locationRouter,
  payments: paymentsRouter,
  ...domainRouters,
});

export type AppRouter = typeof appRouter;
