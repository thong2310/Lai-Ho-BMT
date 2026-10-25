import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appRouter } from "../server/routers";
import type { TrpcContext } from "../server/_core/context";
import { sdk } from "../server/_core/sdk";
import { ENV } from "../server/_core/env";
import * as db from "../server/db";
import { hashPassword, verifyPassword } from "../server/local-auth";

vi.mock("../server/db", () => ({
  getUserByEmail: vi.fn(),
  insertLocalUser: vi.fn(),
  updateUserPassword: vi.fn(),
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(),
}));

const now = new Date("2026-01-01T00:00:00.000Z");
function user(
  role: "user" | "driver" | "admin",
  email = `${role}@example.com`,
) {
  return {
    id: role === "user" ? 1 : role === "driver" ? 2 : 3,
    openId: `local_${role}`,
    name:
      role === "user"
        ? "Khách hàng"
        : role === "driver"
          ? "Tài xế"
          : "Quản trị",
    email,
    passwordHash: hashPassword("correct-password"),
    loginMethod: "local",
    role,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  } as const;
}
function context(currentUser: TrpcContext["user"] = null) {
  const cookies: {
    name: string;
    value: string;
    options: Record<string, unknown>;
  }[] = [];
  const ctx: TrpcContext = {
    user: currentUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) =>
        cookies.push({ name, value, options }),
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
  return { ctx, cookies };
}

describe("local auth", () => {
  const originalAdmin = {
    name: ENV.localAdminName,
    email: ENV.localAdminEmail,
    password: ENV.localAdminPassword,
  };
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    ENV.localAdminName = originalAdmin.name;
    ENV.localAdminEmail = originalAdmin.email;
    ENV.localAdminPassword = originalAdmin.password;
  });

  it("hashes and verifies scrypt passwords without storing plaintext", () => {
    const encoded = hashPassword("correct-password");
    expect(encoded).toMatch(/^scrypt\$[^$]+\$[^$]+$/);
    expect(verifyPassword("correct-password", encoded)).toBe(true);
    expect(verifyPassword("wrong-password", encoded)).toBe(false);
    expect(encoded).not.toContain("correct-password");
  });

  it("registers customer and driver with separate roles and hides passwordHash", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue(undefined);
    vi.mocked(db.insertLocalUser).mockImplementation(
      async (values) => values as never,
    );
    const customer = context();
    const driver = context();
    const callerCustomer = appRouter.createCaller(customer.ctx);
    const callerDriver = appRouter.createCaller(driver.ctx);

    const customerResult = await callerCustomer.auth.localRegisterCustomer({
      name: " Khách hàng ",
      email: "CUSTOMER@Example.COM ",
      password: "correct-password",
    });
    const driverResult = await callerDriver.auth.localRegisterDriver({
      name: " Tài xế ",
      email: "DRIVER@Example.COM ",
      password: "correct-password",
    });

    expect(customerResult.user.role).toBe("user");
    expect(driverResult.user.role).toBe("driver");
    expect(customerResult.user.email).toBe("customer@example.com");
    expect(customerResult.user).not.toHaveProperty("passwordHash");
    expect(customer.cookies[0]?.options).toMatchObject({
      secure: true,
      sameSite: "none",
      httpOnly: true,
    });
    expect(driver.cookies[0]?.value).toBe(driverResult.sessionToken);
  });

  it("rejects weak registration passwords and uses a generic bad-login error", async () => {
    const caller = appRouter.createCaller(context().ctx);
    await expect(
      caller.auth.localRegisterCustomer({
        name: "Khách hàng",
        email: "a@example.com",
        password: "1234567",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Mật khẩu phải có ít nhất 8 ký tự",
    });

    vi.mocked(db.getUserByEmail).mockResolvedValue(user("user"));
    await expect(
      caller.auth.localLogin({
        email: "user@example.com",
        password: "wrong-password",
        role: "customer",
      }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Email hoặc mật khẩu không đúng",
    });
  });

  it("allows only admins to read the admin account", async () => {
    await expect(
      appRouter.createCaller(context(user("user")).ctx).auth.admin.account(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const result = await appRouter
      .createCaller(context(user("admin")).ctx)
      .auth.admin.account();
    expect(result.role).toBe("admin");
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("bootstraps only the configured first admin through admin login", async () => {
    ENV.localAdminName = "Quản trị kiểm thử";
    ENV.localAdminEmail = "admin@example.com";
    ENV.localAdminPassword = "bootstrap-password";
    vi.mocked(db.getUserByEmail).mockResolvedValue(undefined);
    vi.mocked(db.insertLocalUser).mockImplementation(
      async (values) =>
        ({ ...values, id: 9, createdAt: now, updatedAt: now }) as never,
    );
    const result = await appRouter.createCaller(context().ctx).auth.localLogin({
      email: "admin@example.com",
      password: "bootstrap-password",
      role: "admin",
    });
    expect(result.user.role).toBe("admin");
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(vi.mocked(db.insertLocalUser)).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "admin@example.com",
        role: "admin",
        loginMethod: "local",
      }),
    );
    await expect(
      appRouter.createCaller(context().ctx).auth.localLogin({
        email: "admin@example.com",
        password: "wrong-password",
        role: "admin",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("resolves local Bearer sessions without OAuth fallback", async () => {
    const localUser = user("user");
    vi.mocked(db.getUserByOpenId).mockResolvedValue(localUser);
    vi.mocked(db.upsertUser).mockResolvedValue(undefined);
    const token = await sdk.signLocalSession(localUser.openId, {
      name: localUser.name,
    });
    const oauthFallback = vi.spyOn(sdk, "getUserInfoWithJwt");
    const authenticated = await sdk.authenticateRequest({
      headers: { authorization: `Bearer ${token}` },
    } as TrpcContext["req"]);
    expect(authenticated.openId).toBe(localUser.openId);
    expect(oauthFallback).not.toHaveBeenCalled();
    oauthFallback.mockRestore();
  });
});
