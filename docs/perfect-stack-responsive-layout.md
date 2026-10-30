# Perfect Stack responsive layout

Mobile now uses normal document scrolling into a dedicated gameplay viewport;
see [the mobile refinement](perfect-stack-mobile-layout.md). This original report's
stationary-page allocation still describes desktop, but its mobile height budget
and header behavior are superseded.

The viewport architecture below is retained. Subsequent compact card sizing and
per-shape fitting are documented in [the tray density refinement](perfect-stack-tray-density.md),
which supersedes this report's original piece-card sizing details.

## Audit

The game lives in `PerfectStackSession` in `perfect-stack-game.tsx`; its board,
statistics, tray, and controls previously participated in a vertically flowing
page. Mode/difficulty cards, Practice actions, a large introduction, an ad
placeholder, and the footer added height before or after gameplay. Mobile stats
used 9px captions, and mobile tray cells could fall to 9px. The board's global
560px cap considered width more than the available game-screen height.

Supported configurations are 5×5 / 5 pieces, 6×6 / 8 pieces, and 8×8 / 13 pieces.
There is no configured 7×7 difficulty. Layout reads rows/columns and piece sizes
from the actual puzzle; it does not assume one configuration.

There is no bottom mobile tab bar in this checkout. The real navigation is the
shared `SiteHeader`, including its mobile menu. The drag ghost is fixed-position;
help and victory use native top-layer dialogs. Colors come from the existing
shared light/dark theme tokens. None of those palettes were changed.

## Viewport architecture

`perfect-stack-layout.css` scopes the layout to `.stack-game-shell` so other
games and pages keep their existing layouts. The shell is a grid with two rows:

1. The real header at its intrinsic height.
2. The remaining game area, with `minmax(0, 1fr)`.

The shell uses `height: 100vh` followed by `height: 100dvh`; its border-box padding
respects top, right, bottom, and left safe-area insets. Usable game height is the
dynamic viewport minus that actual header row and safe padding, then the game
toolbar and normal section spacing. No guessed header/tab-bar subtraction or
JavaScript size measurement is needed. The page does not scroll during play.

The toolbar retains the title/current mode/seed, help, and an Options disclosure.
Mode, difficulty, New puzzle, and Copy challenge remain available inside Options.
The panel supports Escape (returning focus to its summary) and outside-click
dismissal. Completed games show a compact Results action in place of help.

Wide layouts allocate a board column and a sidebar containing stats, the flexible
tray, and pinned controls. Narrow layouts allocate stats, board/status, tray,
and controls as separate grid rows. `display: contents` lets the existing sidebar
children occupy those rows without changing gameplay state or duplicating UI.

Ads and the footer are omitted from the active game frame; navigation back to
Games remains in the shared header. The ad in this checkout is a placeholder.
The brief/instructions remain in the board's status area and Help dialog.

## Board and pieces sizing

The board's immediate viewport has `container-type: size` and an explicit grid
row, independently of optional headings. The square is:

```css
width: min(100cqw, 100cqh, 800px);
aspect-ratio: 1;
```

It uses the smaller of its real available width/height, with an 800px useful
upper bound instead of the old 560px cap. The component exposes actual puzzle
rows/columns and uses `repeat(rows/cols, minmax(0, 1fr))` for the grid tracks.
After outer padding/borders, a cell's width is its share of the board's content
width after the column gaps. Rows are calculated the same way. Gaps vary from
2–6px with container size. Every row and column is visible; the board never
scrolls. Removing pieces or completing a game does not resize it.

The tray has `min-height: 0`. Only `.piece-grid` scrolls, using `overflow-y: auto`,
`overscroll-behavior: contain`, native scrollbars, and a focusable named region.
Its boundary, continued rows, and touch instruction make scrolling discoverable.
The grid uses auto-fit columns and keeps all pieces, including faded placed ones,
available. On roomy screens, short/few-piece puzzles display without scrolling.
Piece focus rings sit inside their cards so the scroll container cannot clip them.
Desktop card height accounts for the puzzle's maximum piece cell count; mobile
cards use 128px rows, and constrained screens use 104–112px rows. Shape cells
remain 14–18px rather than the old 9px minimum. Main controls remain at least
44px high; essential stat captions are 12px, with 18–24px values.

The page and board have no gameplay scrollbars. Help/results are independently
scrollable native dialogs; Options can scroll while temporarily open.

## Touch and drag behavior

Mouse/pen dragging still starts anywhere on a piece. Touch users can swipe a card
or the tray to scroll, tap a card to rotate, or drag the 28px corner grip to place.
Cards use `touch-action: pan-y`; the grip uses `touch-action: none`. The grip is
part of the existing keyboard-operable button, not an extra tab stop. Selecting
and placing with keyboard/click still works.

Pointer capture, board hit testing, piece orientation, validity checks, and game
completion logic are retained. The existing active-drag ResizeObserver refreshes
cell/ghost metrics if the board changes size. Drag edge autoscrolling now moves
only the tray while the pointer is inside its bounds; it never scrolls the page.
No game `zoom` or transform scaling is used.

## Responsive conditions

- Default: two columns, with a 300–440px sidebar and flexible board region.
- Below 900px when height is over 600px: vertical stats/board/tray/controls.
- Portrait below 600px wide and up to 740px high: tighter spacing and local header
  whitespace, compact stats, and a 140px tray budget. Controls/text remain usable.
- Landscape up to 600px high: two columns with a 260–380px sidebar.
- Landscape up to 420px high: compact header/stat rows and omit redundant tray/
  board captions to reclaim height. Board status and primary controls stay visible.
- Coarse input: show the concise swipe/tap/grip hint in place of the tray caption.

These are content/space conditions, not per-device size exceptions. Existing
theme colors, radii, shadows, and piece colors are reused in both themes.

## Verification

Commands, against the running local Next server:

```text
node scripts/verify-stack-viewport.mjs
node node_modules/tsx/dist/cli.mjs scripts/verify-stack.ts
node node_modules/tsx/dist/cli.mjs scripts/verify-stack-persistence.ts
node node_modules/tsx/dist/cli.mjs scripts/verify-responsive.ts
node node_modules/typescript/bin/tsc --noEmit
```

`TEST_BASE_URL` overrides the layout test URL; `STACK_TEST_URL` overrides the
gameplay test URL. Both default to `http://localhost:3000`. `CHROME_PATH` overrides
the installed Chrome binary. Test completions are intercepted, avoiding server
progress writes.

The layout matrix covers both themes and all three difficulties at 17 sizes
(102 combinations), including coarse-input styling in light mode. It verifies
no page overflow/scroll, a square board, every cell within board bounds, all
essential regions within the viewport, 44px controls, 12px stat labels, readable
piece cells, and no horizontal tray clipping. Daily mode is also checked for all
three difficulties in both themes. Options fit short windows, dismiss on Escape,
and return focus; focusing a distant piece scrolls only the tray.

Representative 8×8 measurements (CSS pixels, rounded):

| Viewport | Full board | Cell | Controls | Page scroll |
| --- | ---: | ---: | ---: | --- |
| 320×568 | 194 | 21 | 44 | None |
| 360×640 | 266 | 29 | 44 | None |
| 390×844 | 357 | 41 | 44 | None |
| 768×1024 | 485 | 53 | 44 | None |
| 1366×768 | 512 | 56 | 44 | None |
| 1920×1080 | 800 | 92 | 44 | None |
| 844×390 landscape | 225 | 24 | 44 | None |
| 568×320 landscape | 156 | 16 | 44 | None |

Gameplay regression checks cover starting, rotation, valid placement, invalid
placement, picking up/repositioning, undo/reset, Check solution, full solves of
all three Practice difficulties, separate Daily progress, result dialogs,
frozen solved state, new puzzles, and API validation. Board/ghost dimensions are
checked after viewport changes. The native-touch test uses browser touch input
to swipe the tray, tap to rotate, drag a grip after scrolling, edge-scroll the
tray, and drop a piece onto the board while the page stays stationary.
The saved-progress suite also verifies independent Small/Medium snapshots,
refresh/reopening, original moves/time/stars, no empty-board flash, no duplicate
submissions, stale/corrupt records, date isolation, and Practice/Daily separation.
The existing general responsive suite checks the unaffected home, Plus, and Alibi
pages alongside all Stack difficulties and scrollable help/result dialogs.

Artifacts and screenshots are in `artifacts/stack-viewport/` and
`artifacts/stack/` (Git-ignored).

## Limits

Very short/small viewports cannot fit a full-width 8×8 board alongside readable
stats, a usable piece row, the app header, and 44px controls. The square therefore
gets smaller on 320×568 and especially 568×320; it stays complete while pieces
scroll. On the shortest landscape viewport, only part of a piece-card row is
visible at a time. Moving to portrait increases the available board size.

Real Safari/Android browser-toolbar animation and physical notch hardware were
not directly tested; the layout relies on dynamic viewport units and safe-area
environment variables. The implementation targets the project's modern browsers
with CSS size containers. A future bottom tab bar should be inserted as another
intrinsic shell row, not layered over the game or accounted for with a guessed
height constant. No bottom tab bar exists to reserve space for today.

## Files modified

- `src/components/games/perfect-stack-game.tsx`
- `src/components/games/perfect-stack-layout.css` (new)
- `src/components/games/stack-how-to-play.tsx`
- `src/components/games/stack-victory.tsx`
- `scripts/verify-stack.ts`
- `scripts/verify-stack-viewport.mjs` (new)
- `scripts/verify-stack-persistence.ts`
- `scripts/verify-responsive.ts`
- `docs/perfect-stack-responsive-layout.md` (new)
