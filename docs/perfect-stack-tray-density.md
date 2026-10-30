# Perfect Stack tray density refinement

Desktop density below is preserved. The later [mobile gameplay refinement](perfect-stack-mobile-layout.md)
reclaims the header's space, sizes small/medium inventory to content, and
supersedes this report's original phone visible counts and row allocation.

## Scope and audit

The viewport-budgeted game architecture is preserved. This change touches only
tray presentation and shape fitting: no wider sidebar, smaller board, new palette,
piece pagination, hidden pieces, reordered slots, or game-rule changes.

Before refinement, the desktop tray used a 136px minimum grid track, 8px gaps,
8px card padding, and a row height calculated from the largest piece's possible
cell count. For a six-cell piece this made every row 141px high, even when most
shapes needed a much smaller bounding box. Actual laptop cards were about
190×141px, in two columns. Only four full cards fit at 1366×768.

The shape renderer already cropped its grid to occupied rows/columns. Its fixed
cell sizes, combined with the worst-case shared row height, still left excessive
card whitespace. Selected/placed states use outlines/opacity; all slots stay in
the same order after placement. Those behaviors are retained.

## Grid and card sizing

The grid uses:

```css
grid-template-columns: repeat(auto-fit, minmax(min(105px, 100%), 1fr));
grid-auto-rows: 106px;
gap: 6px;
```

Existing short-portrait cards retain their 104px row height. The chosen minimum
is therefore 105×104px; normal rows are 106px high. Desktop cards are approximately
129–130px wide. Card padding is 4px, tray padding is 6–8px, and scroll-content
padding is 2px. No repeated visible per-card text is added.
On touch screens the count and “Swipe to scroll” share one compact header row;
rotation instructions remain beside the board and grip guidance remains in Help.

Column count follows the tray's actual content width. Normal desktop sidebars
fit three columns; 390–440px phones also fit three, while 320–375px phones fall
back to two. A wide full-width tablet tray naturally fits more columns. No new
viewport breakpoint or column-count container query was necessary. Existing
height/layout breakpoints remain intact.

The tray remains `min-height: 0; overflow-y: auto; overscroll-behavior: contain`.
Native scrolling is available when needed. Taller screens expose additional rows
naturally, with no three-row cap. The outer tray bounds are unchanged.

## Shape normalization

Each card contains a flexible `.piece-viewport` with `container-type: size`.
`PieceShape` exposes its actual occupied row/column bounds as CSS custom properties.
CSS chooses one square cell size from the smaller of:

- The existing 18px ordinary-block size.
- Available viewport width after the shape's 2px column gaps, divided by columns.
- Available viewport height after row gaps, divided by rows.

Most shapes retain 18px blocks. Only unusually long/tall shapes fit down within
their own card; cells stay at least approximately 14px in tested layouts. Both
horizontal and vertical six-cell straight shapes were tested independently of
the random puzzle seed. Cells remain square, with no transform scaling or
distortion. Centering is based on the shape's bounding grid.

The drag ghost has no `.piece-viewport` wrapper and continues to use exact board
cell measurements. Its sizing, placement anchor, pointer capture, and hit testing
are unaffected. The 28px corner grip and click/tap/keyboard rotation are preserved.

Selection uses an inset outline without changing card dimensions. Focus rings
remain inset. Placed pieces remain faded in their original slots; the grid does
not reorder, remove, or repack pieces during gameplay.

## Measured overview

Counts below are **fully visible cards** at the top of an initially unplayed
13-piece hard puzzle; partial rows are not counted. Both themes produced the
same results. Light-mode layout was also measured with coarse-input styling.

| Viewport | Before columns / visible | After columns / visible | New card size |
| --- | --- | --- | --- |
| 1366×768 | 2 / 4 | 3 / 9 | 129×106px |
| 1440×900 | 2 / 6 | 3 / 13 | 130×106px |
| 1920×1080 | 2 / 8 | 3 / 13 | 130×106px |
| 440×956 | 2 / 2 | 3 / 3 | 124×106px |
| 430×932 | 2 / 2 | 3 / 3 | 120×106px |
| 390×844 | 2 / 2 | 3 / 3 | 107×106px |
| 375×667 | 2 / 2 | 2 / 2 | 156×104px |
| 360×640 | 2 / 2 | 2 / 2 | 149×104px |
| 320×568 | 2 / 2 | 2 / 2 | 129×104px |
| 768×1024 | 5 / 5 | 6 / 6 | 112×106px |

On 1366×768 the remaining inventory needs only a short scroll. At 1440×900 and
1920×1080 all 13 pieces fit. Narrow phones retain large touch targets instead of
forcing a third column. The layout does not enlarge the mobile tray or reduce
the board to expose more rows.

## Scroll stability

The new interaction test found that browser scroll anchoring could move the tray
by 10px when rotated/placed shapes changed their internal geometry. Setting
`overflow-anchor: none` on the scroll region fixes that without JavaScript scroll
restoration. React preserves the same scroll element and keyed piece buttons.

Tests explicitly retain a nonzero scroll offset through selecting, all four
rotations, timer updates, drag placement, undo, reset, keyboard placement, move
updates, and remaining counts 13/10/8/5/3/0. Slot positions/order remain unchanged.
Intentional wheel/swipe scrolling, drag edge scrolling, and native keyboard focus
scrolling to an off-screen piece still work.

## Verification

Run against the existing local dev server:

```text
node scripts/verify-stack-tray.mjs
node node_modules/tsx/dist/cli.mjs scripts/verify-stack-tray-interactions.ts
node scripts/verify-stack-viewport.mjs
node node_modules/tsx/dist/cli.mjs scripts/verify-stack.ts
node node_modules/typescript/bin/tsc --noEmit
```

- Tray checks cover ten viewport sizes in both themes, fully visible counts,
  useful card dimensions, shape containment, square cells, and longest-piece
  orientations.
- The pre-change baseline was captured with `--baseline`; `--compare` verified
  board, tray, statistics, and control positions/sizes stayed within 1px at every
  measured viewport. Baseline files are audit artifacts, not a normal test
  prerequisite. Capture a baseline before a future change if comparing again.
- The existing viewport suite passes 102 combinations across all three puzzle
  sizes, both themes, desktop/mobile/landscape, no page overflow, and visible
  stats/board/status/tray/44px controls.
- The gameplay suite passes full small/medium/hard Practice solves, Daily
  completion, rotation, invalid placement, repositioning, undo/reset, result
  dialogs, native touch scrolling, touch grip dragging after scrolling, and tray
  edge scrolling. Completion requests are intercepted in tests.
- No dependency, color token, board-size rule, sidebar-width rule, or game rule
  was changed. No numbering or badges were added.

Before/after geometry JSON, interaction results, and screenshots are in
`artifacts/stack-tray/` (Git-ignored). As before, extremely short screens show only
a usable portion of the tray; full-board viewport fit retains priority.

## Files changed in this refinement

- `src/components/games/perfect-stack-layout.css`
- `src/components/games/perfect-stack-game.tsx`
- `scripts/verify-stack-tray.mjs` (new)
- `scripts/verify-stack-tray-interactions.ts` (new)
- `docs/perfect-stack-tray-density.md` (new)
- `docs/perfect-stack-responsive-layout.md` (link to the refined tray behavior)
