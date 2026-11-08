# Responsive design and accessibility

Shared theme tokens and component-scoped CSS support daily logic and spatial puzzles without duplicating gameplay state. This guide consolidates the layout, tray-density, mobile-gameplay and light-mode accessibility reports. Private copies preserve the dated source reports; earlier mobile geometry is superseded below. The superseded source reports have been retired from the current tree.

## Layout boundaries

[Global styles](../src/app/globals.css) define content bounds, page/header gutters, panel spacing and semantic theme tokens. The mobile menu preserves navigation and theme controls. Alibi suspect cards reflow into a phone list; result/help dialogs scroll within the available viewport. Native dialogs have names, keyboard dismissal and focus restoration. Essential game actions generally use 44px targets; smaller links need separate target-size review.

Perfect Stack's [scoped layout](../src/components/games/perfect-stack-layout.css) reads actual puzzle dimensions and largest piece size. Small is 5x5 with five pieces, Medium 6x6 with eight, and Hard 8x8 with thirteen. No 7x7 mode or per-device game component is assumed.

## Desktop gameplay frame

At 900px and wider, the gameplay layout uses a dynamic-height budget minus the measured site header, toolbar/spacing and safe-area insets. A ResizeObserver supplies the actual header-height CSS token; the surrounding document can still scroll. The board sits beside a 300-440px sidebar containing statistics, inventory and controls. Short landscape layouts tighten spacing and sidebar width. Grid `minmax(0, 1fr)` and minimum-size resets let the board shrink without clipping controls.

The board viewport is a size container. Its square uses `min(100cqw, 100cqh, 800px)` and actual grid dimensions. Drag geometry uses rendered board cells, not tray previews. The board never scrolls. Ads/footer are outside the active game frame. Options exposes mode, difficulty, seed and new-puzzle controls without permanently consuming board space; Escape returns focus to its summary.

## Mobile document and gameplay regions

Below 900px, normal document flow separates site navigation/context from gameplay. Users scroll into play and back to navigation; there is no automatic fullscreen, scroll snapping or scroll-direction behavior. The header is not subtracted from game height:

```css
height: calc(100vh - var(--mobile-tab-bar-height, 0px));
height: calc(100dvh - var(--mobile-tab-bar-height, 0px));
```

Safe-area padding protects screen edges. No bottom tab bar exists; its optional token defaults to zero. The vertical grid allocates compact statistics, a flexible board/status region, inventory capped at 45dvh, and a separate 44px controls row. Short landscape phones retain two gameplay columns while header/context scroll away.

Mobile inventory tracks have a 105px minimum and 4px gaps. Rows use `max(96px, largest-piece-cell-count * 16px + 8px)`: 96px for current Small/Medium pieces and 104px for six-cell Hard pieces. Recorded layouts fit three columns at 360px and above, two at 320px. Short screens show fewer pieces rather than clipping the board or shrinking controls. At 390x844, historical checks showed all eight Medium pieces and nine of thirteen Hard pieces; these examples were not rerun for consolidation.

## Piece fitting and stable interaction

Desktop density uses a smaller footprint than the original two-column tray; historical 1440x900/1920x1080 checks fit all thirteen Hard pieces. Per-shape size containers choose square preview cells from available width/height after 2px gaps, capped at 18px. Long shapes shrink within their cards (approximately 14px minimum in recorded checks), without transform distortion.

Placed pieces stay faded in their original keyed slots. Rotation, timers and placement do not repack the inventory. The scroll region uses `overflow-anchor: none`, native scrolling, contained overscroll and inset focus indicators. Intentional keyboard focus and drag-edge scrolling still move the tray.

Mouse/pen drag pieces directly. Touch users swipe cards to scroll, tap to rotate or drag the 28px grip, which adds no tab stop. Empty mobile board cells and solved boards allow page panning; occupied cells retain pointer capture. ResizeObserver refreshes active-drag measurements. Keyboard selection/placement, undo/reset and solved-state locking remain. Results restore focus with `preventScroll` so closing them does not pull the page back to context.

## Accessible themes and motion

Semantic text tokens separate readable blue/gold/red/green text from decorative brand fills. `--control-border` identifies required form/board boundaries; decorative separators remain subtle. Theme state persists separately from puzzles. Both themes share game content, piece slots and existing disabled/placed fades. Earlier light-only numbers, check marks and selection labels were reverted and are not current UI.

The site includes a skip link, explicit focus, named controls/dialogs and live game-status messages. Reduced-motion CSS suppresses specified transitions/animations; inspect each new effect separately. Historical contrast/axe checks targeted WCAG AA text and required non-text boundaries, not whole-application certification. Inactive controls and decorative logos require different assessment from essential content. Physical devices and assistive technology still need testing.

## Reproduction and limits

With a reviewed local development server, existing scripts include `npm run test:responsive`, `npm run test:stack-browser`, `npm run test:stack-persistence`, `npm run test:alibi-persistence` and `npm run test:auth-browser`. Additional [scripts](../scripts/) cover viewport bounds, tray density/interactions, mobile gameplay and accessibility states. Review fixtures/interception before testing a configured environment. `CHROME_PATH` selects Chrome; URL overrides differ by script.

Recorded matrices cover both themes, all difficulties, phones/tablets/desktops, short landscape, touch emulation, long seeds, solved refreshes, scroll stability and keyboard interaction. Artifacts belong under ignored `artifacts/`. No browser suite was rerun for this documentation change. Chrome emulation and CSS text/viewport sizing do not prove physical Safari/Android toolbars, native zoom, notch handling or screen-reader usability.

## Related engineering

- [Authentication and account synchronization](AUTHENTICATION.md)
- [History and durable result queues](GAME-STATISTICS.md)
- [Account-backed board restoration](PERFECT-STACK-ACCOUNT-SYNC.md)
- [Puzzle generation and verification](PERFECT-STACK-V2.md)
- [Daily Alibi persistence](DAILY-ALIBI-PERSISTENCE.md)


## Historical measurements and reproduction entry points

The removed-report proposal does not turn old measurements into current guarantees. Recorded mobile initial visible-piece counts (Small/Medium/Hard) were 4/2/2 at 320x568, 5/6/3 at 360x640 and 375x667, 5/8/9 at 360x800, 375x812, 390x844 and 440x956, and 5/8/13 at 768x1024. Boards/controls take priority over exposing the full inventory. Older stationary-mobile height budgets and earlier tray row counts are superseded, with complete originals preserved privately.

The original light-theme contrast audit recorded muted text 3.30:1 to 4.65:1, functional blue 4.26:1 to 6.47:1, functional gold 1.93:1 to 5.52:1, and required input/board boundaries from 1.35:1/1.19:1 to 3.87:1/3.41:1. It separated semantic text/boundary tokens from decorative fills. Its targets were normal text 4.5:1, large text 3:1 and required non-text boundaries 3:1. Later design parity reverted experimental light-only identifiers; these recorded audit values do not certify all current states. See [text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) and [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Specific existing verification entry points are [viewport geometry](../scripts/verify-stack-viewport.mjs), [tray density](../scripts/verify-stack-tray.mjs), [tray interactions](../scripts/verify-stack-tray-interactions.ts), [accessibility](../scripts/verify-accessibility.mjs), [accessibility states](../scripts/verify-accessibility-states.mjs) and [mobile gameplay](../scripts/verify-stack-mobile.mjs). Inspect each script's runner and local-server requirements before use. Historical audit exceptions included a temporarily covered underlying navigation target while the mobile menu was open; target/focus/menu dismissal must still be tested, not generally exempted. No accessibility or browser suite ran during documentation preparation.
