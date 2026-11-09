import { ApiTokenClaims } from "@ftc/shared";
import { describe, expect, it } from "vitest";
// The web app has no test runner of its own; this pure module is tested here.
import {
  DEMO_ACCOUNTS,
  demoLoginConfigured,
  publicDemoCredentials,
  signInErrorMessage,
  verifyDemoLogin,
} from "../../web/lib/demoAuth";

// Throwaway values for tests only.
const env = { DEMO_USER_PASSWORD: "tester-pass-123", ADMIN_PASSWORD: "admin-pass-456" };

describe("verifyDemoLogin", () => {
  it("logs in the tester with the right password and gives the user role", () => {
    expect(verifyDemoLogin("tester@fridgetocart.demo", env.DEMO_USER_PASSWORD, env)).toEqual({
      id: "demo:tester",
      email: "tester@fridgetocart.demo",
      name: "Tester",
      role: "user",
    });
  });

  it("logs in the admin with the right password and gives the admin role", () => {
    expect(verifyDemoLogin("aditi@fridgetocart.demo", env.ADMIN_PASSWORD, env)).toMatchObject({
      id: "demo:admin",
      email: "aditi@fridgetocart.demo",
      role: "admin",
    });
  });

  it("rejects a wrong password", () => {
    expect(verifyDemoLogin("tester@fridgetocart.demo", "wrong-password", env)).toBeNull();
    expect(verifyDemoLogin("aditi@fridgetocart.demo", "wrong-password", env)).toBeNull();
  });

  it("does not accept one account's password for the other account", () => {
    expect(verifyDemoLogin("tester@fridgetocart.demo", env.ADMIN_PASSWORD, env)).toBeNull();
    expect(verifyDemoLogin("aditi@fridgetocart.demo", env.DEMO_USER_PASSWORD, env)).toBeNull();
  });

  it("rejects an unknown email, even with a real password", () => {
    expect(verifyDemoLogin("nobody@fridgetocart.demo", env.DEMO_USER_PASSWORD, env)).toBeNull();
    expect(verifyDemoLogin("tester@fridgetocart.demo.evil.io", env.DEMO_USER_PASSWORD, env)).toBeNull();
  });

  it("compares email case-insensitively and ignores surrounding spaces", () => {
    expect(verifyDemoLogin("TESTER@FridgeToCart.Demo", env.DEMO_USER_PASSWORD, env)?.id).toBe("demo:tester");
    expect(verifyDemoLogin("  Aditi@fridgetocart.demo ", env.ADMIN_PASSWORD, env)?.role).toBe("admin");
  });

  it("keeps passwords case-sensitive", () => {
    expect(verifyDemoLogin("tester@fridgetocart.demo", env.DEMO_USER_PASSWORD.toUpperCase(), env)).toBeNull();
  });

  it("rejects an empty password", () => {
    expect(verifyDemoLogin("tester@fridgetocart.demo", "", env)).toBeNull();
  });

  it("disables an account whose password is missing or too short", () => {
    expect(verifyDemoLogin("tester@fridgetocart.demo", "", {})).toBeNull();
    expect(verifyDemoLogin("tester@fridgetocart.demo", "short", { DEMO_USER_PASSWORD: "short" })).toBeNull();
    // The other account keeps working.
    expect(verifyDemoLogin("aditi@fridgetocart.demo", env.ADMIN_PASSWORD, { ADMIN_PASSWORD: env.ADMIN_PASSWORD })?.role).toBe("admin");
  });
});

describe("accounts", () => {
  it("has exactly two accounts with distinct stable ids and emails", () => {
    expect(DEMO_ACCOUNTS).toHaveLength(2);
    expect(new Set(DEMO_ACCOUNTS.map((a) => a.id)).size).toBe(2);
    expect(new Set(DEMO_ACCOUNTS.map((a) => a.email)).size).toBe(2);
    expect(DEMO_ACCOUNTS.map((a) => a.role).sort()).toEqual(["admin", "user"]);
  });

  it("produces ids and emails the API accepts in its token claims", () => {
    for (const a of DEMO_ACCOUNTS) {
      expect(ApiTokenClaims.safeParse({ sub: a.id, email: a.email, name: a.name }).success).toBe(true);
    }
  });
});

describe("demoLoginConfigured / publicDemoCredentials", () => {
  it("reports whether any account can log in", () => {
    expect(demoLoginConfigured(env)).toBe(true);
    expect(demoLoginConfigured({})).toBe(false);
    expect(demoLoginConfigured({ ADMIN_PASSWORD: env.ADMIN_PASSWORD })).toBe(true);
  });

  it("exposes only the tester credentials, never the admin's", () => {
    const shown = publicDemoCredentials(env);
    expect(shown).toEqual({ email: "tester@fridgetocart.demo", password: env.DEMO_USER_PASSWORD });
    expect(JSON.stringify(shown)).not.toContain("aditi");
    expect(JSON.stringify(shown)).not.toContain(env.ADMIN_PASSWORD);
  });

  it("shows nothing when the tester password is not configured", () => {
    expect(publicDemoCredentials({ ADMIN_PASSWORD: env.ADMIN_PASSWORD })).toBeNull();
    expect(publicDemoCredentials({ DEMO_USER_PASSWORD: "short" })).toBeNull();
  });
});

describe("signInErrorMessage", () => {
  it("gives a clear message for invalid credentials without saying which part was wrong", () => {
    expect(signInErrorMessage("CredentialsSignin")).toBe("Incorrect email or password.");
    expect(signInErrorMessage(undefined)).toBeNull();
    expect(signInErrorMessage("Configuration")).toBe("Sign-in failed. Please try again.");
  });
});
