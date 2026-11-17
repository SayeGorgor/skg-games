// Isolated synthetic UI only. No application server, credential or database use.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
mkdirSync("developer-docs", { recursive: true });
const generated = spawnSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "src/components/admin/user-directory.test.tsx",
  ],
  {
    env: { ...process.env, SKG_LOCAL_USERS_PREVIEW: "1" },
    windowsHide: true,
    stdio: "inherit",
  },
);
assert.equal(generated.status, 0);
const root = resolve("developer-docs");
const fixture = JSON.parse(
  readFileSync(resolve(root, "admin-users-fixture.json"), "utf8"),
);
const actionFixture = `const fixture=${JSON.stringify(fixture)};
export async function searchUsers(form) {
  window.__directorySubmission=Array.from(form.entries());
  const search=String(form.get("search")??"").trim().toLowerCase();
  const role=String(form.get("role")??"all");
  const entries=fixture.entries.filter(e=>(role==="all"||e.role===role)&&(!search||String(e.displayName).toLowerCase().includes(search)||String(e.email).toLowerCase().includes(search)));
  return {status:"ready",result:{...fixture,entries,total:entries.length,nextCursor:"synthetic-next",previousCursor:null,filters:{search,role,pageSize:Number(form.get("pageSize"))}}};
}`;
const output = await build({
  stdin: {
    contents: `import {createRoot} from "react-dom/client";
import {UserDirectory} from ${JSON.stringify(resolve("src/components/admin/user-directory.tsx"))};
const fixture=${JSON.stringify(fixture)};
createRoot(document.getElementById("directory")).render(<UserDirectory initial={{status:"ready",result:fixture}} actor={{userId:fixture.entries[0].userId,role:"owner"}}/>);`,
    loader: "tsx",
    resolveDir: process.cwd(),
  },
  outfile: resolve(root, "directory-preview.js"),
  write: false,
  bundle: true,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  logLevel: "error",
  plugins: [
    {
      name: "private-fixture-action",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) =>
          args.path.endsWith("/app/admin/users/actions")
            ? { path: "directory-action-fixture", namespace: "private-fixture" }
            : undefined,
        );
        builder.onLoad({ filter: /.*/, namespace: "private-fixture" }, () => ({
          contents: actionFixture,
          loader: "js",
        }));
      },
    },
  ],
});
const css =
  output.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "";
const script = Buffer.from(
  output.outputFiles.find((file) => file.path.endsWith(".js")).text,
).toString("base64");
const global = readFileSync("src/app/globals.css", "utf8")
  .split(String.fromCharCode(10))
  .filter((line) => !line.startsWith("@import"))
  .join(String.fromCharCode(10));
writeFileSync(
  resolve(root, "admin-users-hydrated.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${global}${css}body{padding:24px}</style><body><h1>Synthetic User Directory Interaction Test</h1><div id="directory"></div><script src="data:text/javascript;base64,${script}"></script></body></html>`,
);
const browser = await chromium.launch({
  headless: true,
  ...(process.platform === "win32" ? { channel: "msedge" } : {}),
});
try {
  const page = await browser.newPage();
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (value) => {
          window.__copiedDirectoryId = value;
        },
      },
    }),
  );
  await page.route(/^https?:/, (route) => route.abort());
  await page.goto(
    pathToFileURL(resolve(root, "admin-users-hydrated.html")).href,
  );
  await page
    .getByText("Role management is unavailable", { exact: false })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Manage role" }).count(),
    3,
  );
  for (const control of await page
    .getByRole("button", { name: "Manage role" })
    .all())
    assert(await control.isDisabled());
  for (const width of [360, 768, 1440]) {
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(
        (value) => document.documentElement.setAttribute("data-theme", value),
        theme,
      );
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      );
      const table = page.getByRole("region", { name: "User directory table" });
      await table.focus();
      await page.keyboard.press("ArrowRight");
      await page.screenshot({
        path: resolve(root, `admin-roles-${width}-${theme}.png`),
        fullPage: true,
      });
    }
  }
  await page
    .getByRole("button", { name: "Copy full immutable user ID" })
    .first()
    .click();
  assert.equal(
    await page.evaluate(() => window.__copiedDirectoryId),
    "00000000-0000-4000-8000-000000000001",
  );
  await page.getByLabel("Find an account").fill("example");
  await page.getByLabel("Application role").selectOption("admin");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await page.getByText("1 matching accounts", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Find an account").inputValue(),
    "example",
  );
  assert.equal(await page.getByLabel("Application role").inputValue(), "admin");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForFunction(() =>
    window.__directorySubmission?.some(
      ([key, value]) => key === "page" && value === "next:synthetic-next",
    ),
  );
  const submitted = await page.evaluate(() => window.__directorySubmission);
  assert(
    submitted.every(([key]) =>
      ["search", "role", "pageSize", "page"].includes(key),
    ),
  );
  assert(
    submitted.some(([key, value]) => key === "search" && value === "example"),
  );
  assert.equal(new URL(page.url()).search, "");
  console.log(
    "Hydrated filters retain values; pagination posts only query controls; ID copy works; no search terms in URLs.",
  );
} finally {
  await browser.close();
}
