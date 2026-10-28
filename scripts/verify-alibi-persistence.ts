import assert from "node:assert/strict";
import { chromium, type Page } from "@playwright/test";
import { dailyAlibi, type DailyAlibiCase } from "../src/lib/games/alibi";
import { getGameDate } from "../src/lib/game-date";
const puzzle: DailyAlibiCase = { ...dailyAlibi, challengeDate: getGameDate() };
const storageKey = "skg-progress-v1";
async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ??
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  try {
    const base = process.env.STACK_TEST_URL ?? "http://localhost:3000";
    for (const suspect of puzzle.suspects.filter(
      (s) => s.key === "ava" || s.key === "marcus",
    )) {
      const context = await browser.newContext({
        viewport: suspect.correct
          ? { width: 1440, height: 1000 }
          : { width: 390, height: 844 },
      });
      await context.addInitScript(() => {
        const state = window as Window & { firstAlibiLocked?: boolean };
        new MutationObserver(() => {
          const cards =
            document.querySelectorAll<HTMLButtonElement>(".suspect-card");
          if (cards.length && state.firstAlibiLocked === undefined)
            state.firstAlibiLocked = Array.from(cards).every(
              (card) => card.disabled,
            );
        }).observe(document, { childList: true, subtree: true });
      });
      let posts = 0;
      const errors: string[] = [];
      context.on("page", (page) =>
        page.on("pageerror", (error) => errors.push(error.message)),
      );
      await context.route("**/api/games/complete", async (route) => {
        posts++;
        const body = route.request().postDataJSON();
        assert.equal(body.gameSlug, "daily-alibi");
        assert.equal(body.solved, suspect.correct);
        assert.deepEqual(body.result, { suspect: suspect.key });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, persisted: false }),
        });
      });
      const page = await context.newPage();
      const modal = (target: Page = page) =>
        target.getByRole("dialog", {
          name: suspect.correct ? "Case closed." : "That alibi holds up.",
          exact: true,
        });
      async function snapshot(target: Page = page) {
        await modal(target).waitFor();
        return {
          text: await modal(target).innerText(),
          selected: await target
            .locator(".suspect-card.selected strong")
            .innerText(),
          locked: await target.locator(".suspect-card:disabled").count(),
          inline: await target.locator(".accusation p").innerText(),
        };
      }
      async function fresh() {
        await page.goto(base + "/games/alibi", { waitUntil: "networkidle" });
        await page.locator(".suspect-card").first().waitFor();
      }
      await fresh();
      assert.equal(
        await page.locator(".suspect-card:not(:disabled)").count(),
        4,
      );
      assert(
        await page
          .getByRole("button", { name: "Make accusation" })
          .isDisabled(),
      );
      await page
        .getByRole("button", { name: new RegExp(suspect.name) })
        .click();
      assert.equal(
        await page.evaluate((key) => localStorage.getItem(key), storageKey),
        null,
        "Selection alone must not persist a result",
      );
      await page.getByRole("button", { name: "Make accusation" }).click();
      const original = await snapshot();
      assert.equal(original.locked, 4);
      assert.equal(original.inline, suspect.explanation);
      assert.equal(posts, 1);
      const saved = await page.evaluate(
        (key) => localStorage.getItem(key),
        storageKey,
      );
      assert(saved);
      const stored = JSON.parse(saved),
        entry = stored.dailyAlibiResults[puzzle.challengeDate];
      assert.equal(entry.accusedSuspectId, suspect.key);
      assert.equal(entry.completed, true);
      assert.equal(stored.alibiSolved, suspect.correct);
      assert(!JSON.stringify(entry).includes(suspect.explanation));
      const anonymousId = await page.evaluate(() =>
        localStorage.getItem("skg-anonymous-id"),
      );
      assert(anonymousId);
      await modal().getByRole("link", { name: "Back to SKG Games" }).click();
      await page.waitForURL(base + "/");
      await page.waitForFunction(
        (expected) =>
          document
            .querySelector(".today-progress strong")
            ?.textContent?.includes(expected),
        suspect.correct ? "1 / 2" : "0 / 2",
      );
      const completed = await page
        .locator(".today-progress strong")
        .innerText();
      assert(completed.includes(suspect.correct ? "1 / 2" : "0 / 2"));
      await page.locator('a.game-card[href="/games/alibi"]').click();
      assert.deepEqual(await snapshot(), original);
      assert.equal(posts, 1);
      await page.reload({ waitUntil: "networkidle" });
      assert.deepEqual(await snapshot(), original);
      assert.equal(
        await page.evaluate(
          () =>
            (window as Window & { firstAlibiLocked?: boolean })
              .firstAlibiLocked,
        ),
        true,
        "Restoration must not render a playable accusation first",
      );
      await modal().getByRole("button", { name: "Review evidence" }).click();
      await page.locator(".suspect-card").last().dispatchEvent("click");
      assert.equal(
        await page.locator(".suspect-card.selected strong").innerText(),
        suspect.name,
      );
      assert.equal(
        await page.getByRole("button", { name: "Make accusation" }).count(),
        0,
      );
      await page.goto(
        base +
          "/games/perfect-stack?mode=practice&difficulty=small&seed=alibi-regression",
        { waitUntil: "networkidle" },
      );
      await page.locator(".stack-grid").waitFor();
      assert.equal(await page.locator(".piece-card.placed").count(), 0);
      assert(
        !(await page
          .getByRole("button", { name: "Reset", exact: true })
          .isDisabled()),
      );
      await fresh();
      assert.deepEqual(await snapshot(), original);
      const reopened = await context.newPage();
      await reopened.goto(base + "/games/alibi", { waitUntil: "networkidle" });
      assert.deepEqual(await snapshot(reopened), original);
      await reopened.close();
      assert.equal(
        posts,
        1,
        "Navigation, refresh and reopen must not submit again",
      );
      assert.equal(
        await page.evaluate((key) => localStorage.getItem(key), storageKey),
        saved,
        "Hydration must not rewrite progress",
      );
      assert.equal(
        await page.evaluate(() => localStorage.getItem("skg-anonymous-id")),
        anonymousId,
      );
      await page.evaluate(
        () => (document.documentElement.dataset.theme = "dark"),
      );
      assert.deepEqual(await snapshot(), original);
      console.log(
        "PASS",
        suspect.correct ? "correct" : "incorrect",
        "accusation: Home/Stack return, refresh/reopen, identical final state, no unlocked flash, no duplicate POST or progress writes",
      );
      const unknown = {
        ...stored,
        dailyAlibiResults: {
          [puzzle.challengeDate]: { ...entry, accusedSuspectId: "missing" },
        },
      };
      const legacy = {
        alibiSolved: true,
        dailyAlibiResults: { [puzzle.challengeDate]: { completed: true } },
      };
      const stale = {
        ...stored,
        dailyAlibiResults: {
          [puzzle.challengeDate]: {
            ...entry,
            puzzleFingerprint: "alibi-v1-0000000000000000",
          },
        },
      };
      const previous = new Date(puzzle.challengeDate + "T12:00:00Z");
      previous.setUTCDate(previous.getUTCDate() - 1);
      const previousDate = previous.toISOString().slice(0, 10);
      const yesterday = {
        ...stored,
        alibiSolvedDate: previousDate,
        dailyAlibiResults: {
          [previousDate]: { ...entry, challengeDate: previousDate },
        },
      };
      for (const changed of [unknown, legacy, stale, yesterday]) {
        await page.evaluate(
          ({ key, value }) => localStorage.setItem(key, value),
          { key: storageKey, value: JSON.stringify(changed) },
        );
        await fresh();
        assert.equal(
          await page.locator(".suspect-card:not(:disabled)").count(),
          4,
        );
        assert.equal(
          await page.getByRole("button", { name: "Make accusation" }).count(),
          1,
        );
        assert.equal(await page.getByRole("dialog").count(), 0);
      }
      assert.equal(posts, 1);
      assert.deepEqual(errors, []);
      console.log(
        "PASS stale/unknown/legacy/previous-date entries stay playable",
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
