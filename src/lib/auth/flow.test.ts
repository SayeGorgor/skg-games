import { describe, it, expect } from "vitest";
import {
  parseAuthIntent,
  sanitizeReturnTo,
  premiumDestination,
  shouldShowSignupUpsell,
  hasPremiumSubscription,
  authUrl,
  validAnonymousId,
} from "./flow";
describe("auth flow safety", () => {
  it("limits intents and keeps premium intent across forms", () => {
    expect(parseAuthIntent("premium")).toBe("premium");
    for (const input of [undefined, null, "admin", "Premium", {}])
      expect(parseAuthIntent(input)).toBe("standard");
    expect(authUrl("sign-in", "premium", "/games/alibi")).toContain(
      "intent=premium",
    );
  });
  it("rejects external redirects, protocol tricks and auth loops", () => {
    for (const value of [
      "https://evil.example",
      "//evil.example",
      "javascript:alert(1)",
      "/\\evil.example",
      "/\nevil",
      "/auth/complete",
      "/api/auth/sign-out",
      "/x/../auth/complete",
      null,
    ])
      expect(sanitizeReturnTo(value)).toBe("/");
    for (const value of [
      "/",
      "/account",
      "/games/perfect-stack?mode=practice&seed=ABC",
      "/games/alibi#clues",
    ])
      expect(sanitizeReturnTo(value)).toBe(value);
  });
  it("gates purchases without granting entitlement", () => {
    expect(premiumDestination(false, false)).toContain(
      "/auth/sign-up?intent=premium",
    );
    expect(premiumDestination(true, false)).toBe("/plus?purchase=1");
    expect(premiumDestination(true, true)).toBe("/account");
    const now = new Date("2026-10-28T00:00:00Z"),
      future = new Date("2026-11-28T00:00:00Z");
    for (const status of ["active", "trialing"])
      expect(
        hasPremiumSubscription({ status, currentPeriodEnd: future }, now),
      ).toBe(true);
    for (const status of ["incomplete", "past_due", "canceled"])
      expect(
        hasPremiumSubscription({ status, currentPeriodEnd: future }, now),
      ).toBe(false);
    expect(
      hasPremiumSubscription({ status: "active", currentPeriodEnd: now }, now),
    ).toBe(false);
    expect(
      hasPremiumSubscription({ status: "active", currentPeriodEnd: null }, now),
    ).toBe(false);
  });
  it("shows upsell only for standard new free accounts", () => {
    expect(shouldShowSignupUpsell(true, "standard", false)).toBe(true);
    expect(shouldShowSignupUpsell(false, "standard", false)).toBe(false);
    expect(shouldShowSignupUpsell(true, "premium", false)).toBe(false);
    expect(shouldShowSignupUpsell(true, "standard", true)).toBe(false);
  });
  it("accepts only well formed anonymous identifiers", () => {
    expect(validAnonymousId("12345678-1234-4123-8123-123456789abc")).toBe(true);
    for (const value of [
      "fake",
      null,
      {},
      "12345678-1234-4123-8123-123456789abc' OR TRUE",
    ])
      expect(validAnonymousId(value)).toBe(false);
  });
});
