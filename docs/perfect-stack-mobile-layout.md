# Perfect Stack mobile gameplay region

## Scope

Perfect Stack now uses two normal document regions below 900px wide:

1. The SKG site header and Perfect Stack title/context/help/options.
2. A dedicated gameplay region containing stats, the full board, status, pieces,
   and Check solution / Undo / Reset.

The player scrolls normally from context into gameplay and can scroll back up.
Nothing automatically scrolls the player, watches scroll direction, invokes
fullscreen, fixes the entire game to the screen, or imposes scroll snapping.
Only the internal inventory scrolls when it actually overflows.

Desktop retains its existing viewport-budgeted board/sidebar composition. Before/
after measurements at 1024×768, 1366×768, 1440×900, and 1920×1080 in both themes
confirm identical header, context, board, tray, stats, and control geometry to
within 1px. Existing desktop card density, colors, and board sizing are preserved.

## Header and viewport height

The page-specific mobile shell uses normal block flow, automatic height, and
visible overflow. The real site header remains relative/non-sticky; its normal
mobile spacing is restored rather than compressing it to save game space. The
context toolbar remains above the gameplay region and scrolls away with it.

The gameplay region uses:

```css
height: calc(100vh - var(--mobile-tab-bar-height, 0px));
height: calc(100dvh - var(--mobile-tab-bar-height, 0px));
```

Its internal padding respects top/bottom safe-area insets. The outer page already
respects left/right safe areas. The global header is **not subtracted** from game
height. Native document scrolling can align `#perfect-stack-play` to the viewport;
the application does not call `scrollIntoView` to do that for the player.

No SKG bottom tab bar or existing bar-height token exists in this checkout. The
optional `--mobile-tab-bar-height` hook defaults to zero; a future actual bar can
supply its measured/shared height. Matching page-bottom space permits the shorter
gameplay region to align correctly when that hook is used. No guessed tab-bar
height is reserved today.

## Mobile allocation

One DOM/component serves all difficulties. CSS reads actual puzzle columns and
the largest piece's cell count, rather than branching on device names or creating
separate pages for Small/Medium/Hard.

The vertical gameplay grid allocates:

- A compact 32–40px stats row, with 12px labels and 20–22px values.
- A flexible board/status region with a useful minimum derived from board columns
  (target 32px cells plus board/status spacing). The minimum is capped on very
  short screens so pieces and controls can still fit.
- A content-sized inventory row, capped at 45dvh and allowed to shrink/scroll.
- A separate 44px controls row.

The board remains `min(available container width, available container height,
800px)`, square and centered. Actual puzzle rows/columns define the grid. It never
scrolls or clips. Status remains visible; it is not hidden after interaction.

The inventory now uses its natural row count when it fits. Small (5-piece) and
medium (8-piece) puzzles use 96px cards; hard puzzles (largest pieces have six
cells) use 104px cards. This is calculated from actual maximum piece size. The
105px minimum track, thin native scrollbar, compact padding, and 4px gaps permit
three columns at 360px and above in the tested phone layouts; 320px falls back
to two. The existing per-shape fit retains square, recognizable blocks and the
28px drag grip. Desktop remains on its previous sizing and spacing.

Cards remain in their original slots after placement, with existing fades. Row
count does not collapse or reorder during play, so placement and timer updates
do not shuffle the inventory or reset its scroll offset.

Short mobile landscape windows retain the two-column gameplay arrangement, but
the header/context still scroll away. Obsolete rules that fitted header and game
into one phone viewport were removed; compact short-desktop rules are unchanged.

## Touch, keyboard, and results

Empty board cells allow native vertical panning. A swipe on the empty board can
therefore scroll the document into gameplay without placing a piece. Occupied
cells retain direct dragging and pointer capture. Once solved, board cells allow
page panning again. Tray swipes scroll the inventory; its grips still start touch
drags. Tap/click rotation and keyboard select/place are retained.

Native-touch tests swipe into gameplay and back to site navigation, and separately
verify tray scrolling, tap rotation, grip dragging after scrolling, edge scrolling,
and placement. Tray operations preserve the current document scroll offset rather
than assuming the document must stay at zero.

Results restore trigger focus with `preventScroll`, preventing a result close
from unexpectedly scrolling the context toolbar back onto the screen. Help and
Options remain accessible by scrolling up; no permanent mobile header is added.

## Representative measurements

These are **fully visible cards** at tray scroll offset zero in an unplayed
puzzle, after the player reaches gameplay. Both themes produce the same layout.

| Phone viewport | Small visible | Medium visible | Hard visible |
| --- | --- | --- | --- |
| 320×568 | 4 / 5 | 2 / 8 | 2 / 13 |
| 360×640 | 5 / 5 | 6 / 8 | 3 / 13 |
| 360×800 | 5 / 5 | 8 / 8 | 9 / 13 |
| 375×667 | 5 / 5 | 6 / 8 | 3 / 13 |
| 375×812 | 5 / 5 | 8 / 8 | 9 / 13 |
| 390×844 | 5 / 5 | 8 / 8 | 9 / 13 |
| 440×956 | 5 / 5 | 8 / 8 | 9 / 13 |
| 768×1024 narrow tablet | 5 / 5 | 8 / 8 | 13 / 13 |

At 360×640, the small board is approximately 258px square while all five pieces
fit without internal scrolling. At 390×844, the medium board is approximately
354px square with all eight pieces visible. The 8×8 board remains approximately
306px square with nine visible pieces and internal scrolling for the remainder.

On physically short/narrow phones, the complete board and usable controls take
priority over showing every piece. Medium games on shorter phones need a small
tray scroll; large games scroll on phones. No whole-game zoom/transform scaling
or shrinking of the desktop board is used.

## Verification

```text
node scripts/verify-stack-mobile.mjs
node scripts/verify-stack-mobile.mjs --compare-desktop
node scripts/verify-stack-viewport.mjs
node node_modules/tsx/dist/cli.mjs scripts/verify-stack.ts
node node_modules/tsx/dist/cli.mjs scripts/verify-stack-tray-interactions.ts
node node_modules/tsx/dist/cli.mjs scripts/verify-stack-persistence.ts
node node_modules/tsx/dist/cli.mjs scripts/verify-responsive.ts
node node_modules/typescript/bin/tsc --noEmit
```

The optional desktop comparison uses the pre-change audit snapshot in
`artifacts/stack-mobile/desktop-before.json`; normal runs do not require that file.

The new mobile suite covers the ten requested phone sizes, plus narrow tablet
and two landscape sizes: 78 theme/difficulty/viewport combinations. It checks
initial navigation availability, user scrolling into gameplay and back, the full
square board/all cells, stats/status/controls, natural inventory fit, and native
swipes without accidental placement. 360×640/800 and 375×667/812 exercise smaller
and larger viewport heights to simulate expanded/collapsed browser chrome.

The existing 102-case viewport suite now distinguishes desktop's stationary page
from mobile's normal chrome-to-gameplay document scroll. Gameplay, scroll-stability,
saved-progress, and general responsive suites have the same distinction. Tests
intercept completion requests instead of writing test results to the server.

Artifacts and screenshots are in `artifacts/stack-mobile/`. Real physical Safari/
Android toolbar animations and notch hardware were not directly tested; dynamic
viewport units and safe-area environment variables provide the runtime behavior.
No real bottom tab bar exists to integrate in this checkout.

## Files changed for this refinement

- `src/components/games/perfect-stack-game.tsx`
- `src/components/games/perfect-stack-layout.css`
- `src/components/games/stack-victory.tsx`
- `scripts/verify-stack-mobile.mjs` (new)
- `scripts/verify-stack.ts`
- `scripts/verify-stack-viewport.mjs`
- `scripts/verify-stack-tray.mjs`
- `scripts/verify-stack-tray-interactions.ts`
- `scripts/verify-responsive.ts`
- `docs/perfect-stack-mobile-layout.md` (new)
- `docs/perfect-stack-responsive-layout.md`
- `docs/perfect-stack-tray-density.md`
