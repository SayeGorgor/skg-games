import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../../auth/viewer", () => ({ getViewer: vi.fn() }));
vi.mock("./account-progress", () => ({ readAccountStackProgress: vi.fn() }));
import { getViewer } from "../../auth/viewer";
import { readAccountStackProgress } from "./account-progress";
import { GET } from "../../../app/api/games/perfect-stack/daily-progress/route";
beforeEach(() => vi.resetAllMocks());
const request = (query = "") =>
  new Request(
    `https://skg.test/api/games/perfect-stack/daily-progress${query}`,
  );
it("requires a real session rather than client account flags", async () => {
  vi.mocked(getViewer).mockResolvedValue({
    userId: null,
    authenticated: false,
    premium: false,
    name: null,
    email: null,
  });
  expect((await GET(request())).status).toBe(401);
  expect(readAccountStackProgress).not.toHaveBeenCalled();
});
it("rejects account selectors, invalid dates and future days", async () => {
  vi.mocked(getViewer).mockResolvedValue({
    userId: "session-owner",
    authenticated: true,
    premium: false,
    name: null,
    email: null,
  });
  for (const query of [
    "?userId=someone-else",
    "?date=2026-02-30",
    "?date=9999-01-01",
    "?premium=true",
  ])
    expect((await GET(request(query))).status).toBe(400);
  expect(readAccountStackProgress).not.toHaveBeenCalled();
});
it("loads all difficulty results for the session owner with private no-store headers", async () => {
  vi.mocked(getViewer).mockResolvedValue({
    userId: "session-owner",
    authenticated: true,
    premium: false,
    name: null,
    email: null,
  });
  const data = {
    accountKey: "owner-key",
    challengeDate: "2026-11-04",
    difficulties: { small: null, medium: null, hard: null },
  };
  vi.mocked(readAccountStackProgress).mockResolvedValue(data);
  const response = await GET(request("?date=2026-11-04"));
  expect(await response.json()).toEqual(data);
  expect(readAccountStackProgress).toHaveBeenCalledWith(
    "session-owner",
    "2026-11-04",
  );
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
it("does not turn unknown server state into an empty playable result", async () => {
  vi.mocked(getViewer).mockResolvedValue({
    userId: "session-owner",
    authenticated: true,
    premium: false,
    name: null,
    email: null,
  });
  vi.mocked(readAccountStackProgress).mockRejectedValue(
    new Error("database down"),
  );
  expect((await GET(request())).status).toBe(503);
});
