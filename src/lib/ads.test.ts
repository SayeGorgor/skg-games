import { afterEach, describe, expect, it, vi } from "vitest";
import { adsEnabled } from "./ads";

afterEach(() => vi.unstubAllEnvs());

describe("site-wide advertising configuration", () => {
  it("defaults to disabled", () => {
    vi.stubEnv("NEXT_PUBLIC_ADS_ENABLED", undefined);
    expect(adsEnabled()).toBe(false);
  });

  it("enables advertising with the public switch", () => {
    vi.stubEnv("NEXT_PUBLIC_ADS_ENABLED", "true");
    expect(adsEnabled()).toBe(true);
  });

  it("requires explicit opt-in and ignores ADS_ENABLED", () => {
    vi.stubEnv("ADS_ENABLED", "true");
    for (const value of [undefined, "false", "", "TRUE", "1"]) {
      vi.stubEnv("NEXT_PUBLIC_ADS_ENABLED", value);
      expect(adsEnabled()).toBe(false);
    }
    vi.stubEnv("ADS_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_ADS_ENABLED", "true");
    expect(adsEnabled()).toBe(true);
  });
});
