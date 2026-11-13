import { expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(path.join(directory, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [path.join(directory, entry.name)]
        : [],
  );
}
it("keeps bootstrap isolated from all request code and lifecycle commands", () => {
  for (const file of sourceFiles("src")) {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(
      /(?:from|import\()\s*["'][^"']*(?:scripts\/bootstrap-owner|scripts\/lib\/owner-bootstrap)/,
    );
  }
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  expect(pkg.scripts["admin:bootstrap-owner"]).toBe(
    "tsx scripts/bootstrap-owner.ts",
  );
  for (const [name, command] of Object.entries(pkg.scripts))
    if (name !== "admin:bootstrap-owner")
      expect(String(command)).not.toContain("bootstrap-owner");
  for (const file of sourceFiles("scripts/lib").filter(
    (file) => !file.endsWith(".test.ts"),
  )) {
    if (file.includes("owner-bootstrap"))
      expect(readFileSync(file, "utf8")).not.toMatch(
        /from ["']@sentry|from ["'].*lib\/db|from ["']dotenv|console\./,
      );
  }
});
