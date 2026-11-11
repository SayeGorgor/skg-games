import { beforeEach, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("@sentry/nextjs", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock("./server", () => ({ auth: { getSession: vi.fn() } }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
import { auth } from "./server";
import { getDb } from "@/lib/db";
import { getViewer } from "./viewer";
beforeEach(() => vi.resetAllMocks());
it("logs swallowed session exceptions without their sensitive messages", async () => {
  vi.mocked(auth!.getSession).mockRejectedValue(
    new Error("private@example.com token=secret"),
  );
  expect(await getViewer()).toMatchObject({
    authenticated: false,
    premium: false,
  });
  expect(Sentry.logger.error).toHaveBeenCalledExactlyOnceWith(
    "Session lookup failed",
    {
      operation: "get_session",
      feature: "auth",
      outcome: "unexpected_failure",
    },
  );
});
it("keeps normal unauthenticated requests quiet", async () => {
  vi.mocked(auth!.getSession).mockResolvedValue({
    data: null,
    error: null,
  } as never);
  expect(await getViewer()).toMatchObject({ authenticated: false });
  expect(Sentry.logger.error).not.toHaveBeenCalled();
  expect(Sentry.logger.warn).not.toHaveBeenCalled();
});
it("logs returned session errors without response contents", async () => {
  vi.mocked(auth!.getSession).mockResolvedValue({
    data: null,
    error: { message: "secret", code: "private" },
  } as never);
  expect(await getViewer()).toMatchObject({ authenticated: false });
  expect(Sentry.logger.warn).toHaveBeenCalledExactlyOnceWith(
    "Session lookup returned an error",
    {
      operation: "get_session",
      feature: "auth",
      outcome: "failure",
    },
  );
});
it("preserves free play when profile or entitlement retrieval fails", async () => {
  vi.mocked(auth!.getSession).mockResolvedValue({
    data: {
      user: {
        id: "private-user",
        email: "private@example.com",
        name: "Private",
      },
    },
  } as never);
  vi.mocked(getDb).mockImplementation(() => {
    throw new Error("raw database payload");
  });
  expect(await getViewer()).toMatchObject({
    userId: "private-user",
    authenticated: true,
    premium: false,
  });
  expect(Sentry.logger.error).toHaveBeenCalledExactlyOnceWith(
    "Account entitlement lookup failed",
    {
      operation: "get_entitlement",
      feature: "auth",
      outcome: "unexpected_failure",
    },
  );
});
