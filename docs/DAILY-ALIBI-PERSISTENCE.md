# Daily Alibi completed results

Daily accusations are saved inside the existing `skg-progress-v1` localStorage object, under `dailyAlibiResults[challengeDate]`. A version-1 snapshot contains `completed`, `challengeDate`, `challengeNumber`, `puzzleFingerprint`, `accusedSuspectId`, and `completedAt`. It stores neither suspect objects nor explanation text nor a second copy of correctness.

`client-progress.ts` validates the snapshot's structure, date, challenge number, content fingerprint and accused suspect against the loaded case. The fingerprint is a deterministic, browser-safe FNV-1a 64-bit hash of canonical public case content, ordered by suspect key. It is content identity, not a security mechanism. A changed case cannot reuse an old accusation merely because its date or number was reused. Correctness, suspect name and explanation are reconstructed from the current matching case.

The Alibi page supplies New York's `getGameDate()` at request time. A client-ready gate prevents rendering an unlocked accusation screen before reading storage. The keyed session initializes its existing selection and result states directly from a validated snapshot. Fresh and restored outcomes use the same result modal and inline explanation. Suspect controls remain disabled for both correct and incorrect completed results.

Only a new user accusation saves progress and submits the existing completion API. The submission ref starts locked for a restored result; restoration never calls the accusation handler, writes progress, submits another attempt, or replays a completion animation. Reopening a final case displays its settled result. A second mounted tab also checks for an existing final result before submitting.

Missing, legacy, unknown-suspect, mismatched or malformed results are ignored and leave gameplay available. An existing valid final accusation cannot be overwritten by a later accusation for that case. Other dates and unrelated progress properties remain intact. The anonymous ID and Perfect Stack's separate progress store are unchanged.

The existing homepage **solved** indicator continues to credit correct accusations only; an incorrect accusation is nevertheless a **completed**, immutable case result. New solved flags include `alibiSolvedDate` so they expire on another Daily date. Undated legacy flags remain compatible with the old homepage indicator but cannot lock a case without a restorable accusation.

Run `npm test`, `npm run lint`, `npm run build`, and, with a development server running, `npm run test:alibi-persistence`. The browser verifier checks correct and incorrect results, Home/Perfect Stack navigation, refresh/reopen, exact explanation restoration, no unlocked first render, one completion request, untouched anonymous identity, and safe handling of legacy/stale/previous-day entries. Set `CHROME_PATH` or `STACK_TEST_URL` if needed. Completion POSTs are intercepted in this focused UI verifier.

## Theme presentation

Daily Alibi uses the existing global `html[data-theme]` source and `skg-theme` preference. The theme toggle and pre-hydration bootstrap are unchanged. No theme information is added to saved accusations.

`globals.css` defines Alibi tokens for page/panel/raised surfaces, evidence paper and ink, text, borders, red accents and button states, selection, success/danger, focus, disabled controls, shadows and modal backdrops. The root values create a warm ivory case file with parchment evidence, cream suspects, a red selection tint, green success and muted-red failure cards. Dark overrides retain the charcoal surfaces, warm paper evidence and existing gold/red noir accents. Shared header styling follows the normal SKG header tokens.

Existing result state supplies presentation-only `correct`/`incorrect` suspect classes and `success`/`failure` accusation classes. Color changes are entirely CSS-driven, so switching themes does not remount or reset the game. Disabled suspect cards stay readable and do not gain hover effects.

Run `npm run test:alibi-theme` against a running development server. It captures Light/Dark screenshots at 1440/1024/768/390 pixels, checks live selection and result preservation, refresh/navigation in the opposite theme, unchanged saved progress, no duplicate submissions, disabled hover behavior, and sampled text/control contrast of at least 4.5:1. Screenshots are written to ignored `artifacts/alibi-theme/`.
