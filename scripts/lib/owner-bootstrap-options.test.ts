import { expect, it, vi } from "vitest";
import {
  parseBootstrapOptions,
  bootstrapConnection,
  bootstrapConfirmation,
  verifyExecutionApproval,
  safeBootstrapError,
  OwnerBootstrapError,
} from "./owner-bootstrap-options";
import { runOwnerBootstrapCli } from "./owner-bootstrap-cli";
const args = [
  "--user-id",
  "11111111-1111-4111-8111-111111111111",
  "--environment",
  "development",
  "--project-id",
  "example-project",
  "--branch-id",
  "br-example",
  "--expected-host",
  "ep-example.us-east-2.aws.neon.tech",
  "--expected-database",
  "postgres",
  "--operator-reference",
  "ops-review-001",
  "--console-verified",
];
const connection =
  "postgresql://operator:secret-password@ep-example.us-east-2.aws.neon.tech/postgres?sslmode=require";
it("defaults to dry run and requires explicit bootstrap credentials, never DATABASE_URL", () => {
  const options = parseBootstrapOptions(args);
  expect(options.execute).toBe(false);
  expect(() =>
    bootstrapConnection({ DATABASE_URL: connection }, options),
  ).toThrow("explicit bootstrap connection");
  expect(
    bootstrapConnection(
      { SKG_RBAC_BOOTSTRAP_DATABASE_URL: connection },
      options,
    ),
  ).toBe(connection);
});
it.each(
  [
    [],
    ["--execute"],
    [...args, "--force"],
    [...args, "--user-id", "22222222-2222-4222-8222-222222222222"],
    [...args, "--execute", "--dry-run"],
  ].map((argv) => ({ argv })),
)("rejects missing, duplicate and ambiguous arguments", ({ argv }) => {
  expect(() => parseBootstrapOptions(argv)).toThrow();
});
it.each([
  ["--user-id", "person@example.test"],
  ["--user-id", ""],
  ["--environment", "staging"],
  ["--operator-reference", "ops@example.test"],
  ["--operator-reference", "secret password"],
  ["--operator-reference", "x".repeat(65)],
  ["--project-id", ""],
  ["--branch-id", ""],
  ["--expected-host", "attacker.example.test"],
  ["--expected-database", "db?override"],
])("rejects invalid target or operator input %s", (flag, value) => {
  const copy = [...args];
  copy[copy.indexOf(flag) + 1] = value;
  expect(() => parseBootstrapOptions(copy)).toThrow();
});
it("requires explicit independent Console attestation", () => {
  expect(() =>
    parseBootstrapOptions(args.filter((arg) => arg !== "--console-verified")),
  ).toThrow();
});
it.each([
  "postgresql://operator:secret-password@ep-other.us-east-2.aws.neon.tech/postgres",
  "postgresql://operator:secret-password@ep-example.us-east-2.aws.neon.tech/wrong-db",
  "postgresql://operator:secret-password@ep-example.us-east-2.aws.neon.tech/postgres?host=evil",
  `${connection}&sslmode=disable`,
  `${connection}&options=unsafe`,
  "not-a-connection",
  "https://operator:secret-password@ep-example.us-east-2.aws.neon.tech/postgres",
])(
  "refuses unsafe or mismatched connection targets without echoing secrets",
  (url) => {
    expect(() =>
      bootstrapConnection(
        { SKG_RBAC_BOOTSTRAP_DATABASE_URL: url },
        parseBootstrapOptions(args),
      ),
    ).toThrow(OwnerBootstrapError);
    try {
      bootstrapConnection(
        { SKG_RBAC_BOOTSTRAP_DATABASE_URL: url },
        parseBootstrapOptions(args),
      );
      throw new Error("unexpected success");
    } catch (error) {
      expect(safeBootstrapError(error)).not.toMatch(
        /secret-password|operator:|postgresql:|unsafe/,
      );
    }
  },
);
it("binds deliberate execution approval to every selected target field", () => {
  const options = parseBootstrapOptions([...args, "--execute"]);
  expect(() => verifyExecutionApproval(options)).toThrow("approval");
  const token = bootstrapConfirmation(options);
  expect(() =>
    verifyExecutionApproval({ ...options, confirmation: token }),
  ).not.toThrow();
  for (const changed of [
    { userId: "22222222-2222-4222-8222-222222222222" },
    { environment: "preview" as const },
    { branchId: "br-other" },
    { projectId: "other-project" },
    { expectedDatabase: "other" },
    { operatorReference: "ops-other" },
    { expectedHost: "ep-other.us-east-2.aws.neon.tech" },
  ])
    expect(() =>
      verifyExecutionApproval({ ...options, ...changed, confirmation: token }),
    ).toThrow();
});
it("requires a second production-specific acknowledgment", () => {
  const copy = [...args];
  copy[copy.indexOf("--environment") + 1] = "production";
  const options = parseBootstrapOptions([...copy, "--execute"]);
  const token = bootstrapConfirmation(options);
  expect(() =>
    verifyExecutionApproval({ ...options, confirmation: token }),
  ).toThrow("production-specific");
  expect(() =>
    verifyExecutionApproval({
      ...options,
      confirmation: token,
      productionConfirmation: `PRODUCTION:${token}`,
    }),
  ).not.toThrow();
});
it("does not connect before input/approval checks and offers safe help", async () => {
  const factory = vi.fn();
  const io = { out: vi.fn(), error: vi.fn() };
  expect(await runOwnerBootstrapCli(["--help"], {}, io, factory)).toBe(0);
  expect(
    await runOwnerBootstrapCli(args, { DATABASE_URL: connection }, io, factory),
  ).toBe(1);
  expect(
    await runOwnerBootstrapCli(
      [...args, "--execute"],
      { SKG_RBAC_BOOTSTRAP_DATABASE_URL: connection },
      io,
      factory,
    ),
  ).toBe(1);
  expect(factory).not.toHaveBeenCalled();
  expect(JSON.stringify(io.error.mock.calls)).not.toContain("secret-password");
});
it("closes a failed connection and never emits raw driver errors or retries", async () => {
  const client = {
    connect: vi
      .fn()
      .mockRejectedValue(
        new Error(`secret-password ${connection} person@example.test`),
      ),
    query: vi.fn(),
    end: vi.fn(),
  };
  const factory = vi.fn(async () => client);
  const io = { out: vi.fn(), error: vi.fn() };
  expect(
    await runOwnerBootstrapCli(
      args,
      { SKG_RBAC_BOOTSTRAP_DATABASE_URL: connection },
      io,
      factory,
    ),
  ).toBe(1);
  expect(client.end).toHaveBeenCalledOnce();
  expect(factory).toHaveBeenCalledOnce();
  expect(client.query).not.toHaveBeenCalled();
  expect(JSON.stringify(io.error.mock.calls)).not.toMatch(
    /secret-password|postgresql:|person@example/,
  );
});
