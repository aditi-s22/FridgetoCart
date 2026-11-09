import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Email + password login for exactly two configured accounts. Passwords come from the
 * environment (never from code), and the server verifies them here. Pure functions so the rules
 * can be unit-tested without NextAuth.
 */

export type Role = "user" | "admin";
export type DemoUser = { id: string; email: string; name: string; role: Role };

type Account = DemoUser & { passwordEnv: "DEMO_USER_PASSWORD" | "ADMIN_PASSWORD" };

/** Stable ids: the API keys users (and their scans) by this id, so never change them. */
export const DEMO_ACCOUNTS: readonly Account[] = [
  { id: "demo:tester", email: "tester@fridgetocart.demo", name: "Tester", role: "user", passwordEnv: "DEMO_USER_PASSWORD" },
  { id: "demo:admin", email: "aditi@fridgetocart.demo", name: "Aditi", role: "admin", passwordEnv: "ADMIN_PASSWORD" },
];

/** A shorter password disables that account instead of accepting a weak one. */
export const MIN_PASSWORD_LENGTH = 8;

type Env = Record<string, string | undefined>;

// scrypt with a per-process random salt: both sides are hashed, then compared in constant time.
const SALT = randomBytes(16);
const derive = (secret: string) => scryptSync(secret, SALT, 32);

const configured = (env: Env, acct: Account): string | null => {
  const pw = env[acct.passwordEnv];
  return pw && pw.length >= MIN_PASSWORD_LENGTH ? pw : null;
};

/**
 * Returns the account when the email (case-insensitive) and password both match, else null.
 * Every account is hashed and compared on every call, so the time taken does not reveal whether
 * the email exists. The result is the same for an unknown email and a wrong password.
 */
export function verifyDemoLogin(emailInput: string, passwordInput: string, env: Env): DemoUser | null {
  const email = emailInput.trim().toLowerCase();
  const supplied = derive(passwordInput);
  let match: DemoUser | null = null;
  for (const acct of DEMO_ACCOUNTS) {
    const pw = configured(env, acct);
    // An unconfigured account is compared against a random value, so it can never match.
    const expected = derive(pw ?? randomBytes(16).toString("hex"));
    const passwordOk = timingSafeEqual(supplied, expected);
    if (passwordOk && pw !== null && email === acct.email) {
      match = { id: acct.id, email: acct.email, name: acct.name, role: acct.role };
    }
  }
  return match;
}

/** True when at least one account has a usable password configured. */
export function demoLoginConfigured(env: Env): boolean {
  return DEMO_ACCOUNTS.some((a) => configured(env, a) !== null);
}

/**
 * The tester credentials shown on the sign-in page so visitors can try the app. This is the only
 * account that is ever displayed; the admin account is never exposed.
 */
export function publicDemoCredentials(env: Env): { email: string; password: string } | null {
  const tester = DEMO_ACCOUNTS.find((a) => a.role === "user");
  const password = tester ? configured(env, tester) : null;
  return tester && password ? { email: tester.email, password } : null;
}

/** Shown on /signin when NextAuth redirects back with ?error=... */
export function signInErrorMessage(error: string | undefined): string | null {
  if (!error) return null;
  if (error === "CredentialsSignin") return "Incorrect email or password.";
  return "Sign-in failed. Please try again.";
}
