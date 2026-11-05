import { writeFileSync } from "node:fs";
import { alibiCatalog } from "../src/lib/games/daily-alibi/catalog";
import {
  validateAlibiCatalog,
  getAlibiCaseFingerprint,
} from "../src/lib/games/daily-alibi/validation";

const errors = validateAlibiCatalog(alibiCatalog);
console.log(
  `[Daily Alibi Validation] ${alibiCatalog.length} cases, ${errors.length} structural errors. Natural-language logic is not automatically proven.`,
);
if (errors.length) {
  console.error(errors);
  process.exitCode = 1;
}
if (process.argv.includes("--report")) {
  const checklist =
    "- [ ] Evidence is internally consistent and sufficient.\n- [ ] Exactly one culprit remains; exclusions rule out all three others.\n- [ ] Motives alone do not identify the culprit.\n- [ ] No undisclosed fact is required.\n- [ ] Explanation follows from displayed clues.\n- [ ] Independent editor playtested the case.\n";
  writeFileSync(
    "docs/DAILY-ALIBI-EDITORIAL-REVIEW.md",
    `# Daily Alibi editorial review\n\n${alibiCatalog.length} authored cases. Structural validation is automated; independent human editorial sign-off is pending. These are explicit closed-world puzzles, not claims about real-world forensic certainty. Several starter cases use authenticated alibi elimination; expand this balance as the library grows.\n\n` +
      alibiCatalog
        .map(
          (c) =>
            `## ${c.title}\n\nID: ${c.caseId}\n\nFingerprint: ${getAlibiCaseFingerprint(c)}\n\nMechanism: ${c.review.mechanism}\n\n${c.dek}\n\n${c.clues.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\nDeduction: ${c.review.deduction}\n\nOther suspects: ${c.review.exclusions.join(" ")}\n\n${checklist}`,
        )
        .join("\n"),
  );
  console.log(
    "Wrote docs/DAILY-ALIBI-EDITORIAL-REVIEW.md (human sign-off pending).",
  );
}
