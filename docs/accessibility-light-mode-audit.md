# SKG Games light-mode accessibility audit

Latest Perfect Stack correction: its game and results markup are restored exactly
to the pre-audit version. No piece/cell numbering or added badges are rendered.
Original piece positioning, drag outlines, selected-tab treatment, victory-board
stroke width, mobile result font size, and footer link decoration are restored.
Current color values (including approved board-border colors) are preserved.
Earlier descriptions of non-color improvements below are historical audit notes,
not the current Perfect Stack design. No new whole-app conformance claim is made.

Audited October 30, 2026. Changes preserve the warm neutrals, SKG logo, original
brand fills, page structure, and the previously requested header dimensions.

Follow-up design direction: light mode remains a color variant of dark mode.
Light-only piece numbers, check marks, and Alibi selection text were removed from
the tray, board, results, and suspect cards. Dark mode is the reference: its original
drag-ghost border is restored; only light-mode piece shapes are borderless.
Light disabled controls, completed suspects, empty stars, and board target shadows
now inherit the same visual treatment as dark mode. Approved stronger light
borders, accessible color tokens, and existing board boundaries remain intact.
The measurements below describe the original audit unless explicitly updated.

## Standard and method

Target WCAG 2.2 AA: normal text >=4.5:1, large text >=3:1, and required
component/graphical boundaries and focus indicators >=3:1. Primary reading text
already exceeds the approximately 7:1 target. This is a measured engineering audit,
not a claim of complete WCAG conformance or a replacement for assistive-technology
user testing.

References:

- [Text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [Non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- [Minimum target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

Theme inventory: `globals.css` defines the light palette in `:root`, with dark
overrides on `html[data-theme="dark"]`. Root-layout boot code and `ThemeToggle`
persist `skg-theme` and set that attribute. Tailwind is imported globally; there is
no separate color configuration or component stylesheet. Alibi has a separate
warm paper/ink token family, including selected, success, failure, disabled, modal,
backdrop, and focus colors. Inline game styles use CSS variables for colors and
otherwise specify board/shape geometry and drag positions.

The audit covers the homepage, Plus pricing, all four authentication forms,
Daily Alibi, and all three Perfect Stack difficulties. It includes navigation,
cards, ads, footer, game controls, help, selection, completion, success/failure,
error, hover, keyboard focus, and welcome-dialog states. Native form labels,
validation, dialog names, and keyboard interactions were inspected. There are no
custom checkbox/radio/select or tooltip implementations to audit in this checkout.

The existing Playwright and transitive `axe-core` installation is reused; no
dependency was added. Axe runs WCAG 2 A/AA, 2.1 AA, and 2.2 AA rules. An additional
browser scanner calculates visible text contrast from computed colors, alpha
compositing, ancestor opacity, effective background, font weight, and header zoom.
Brand-logo text and decorative graphics are excluded; inactive controls are
reported separately from required text. Required UI boundaries and actual keyboard
focus outlines are measured separately because axe does not fully assess them.

## Findings and semantic fixes

| Use and affected UI | Before | After | Correction |
| --- | --- | --- | --- |
| Muted text on raised surfaces: theme labels, piece-tray captions | 3.30:1 | 4.65:1 | `--muted`: `#777d86` to `#60656f` |
| Blue labels on white: cards, auth, help | 4.26:1 | 6.47:1 | New `--blue-text: #3157bf`; preserve `--blue` fills |
| Gold label on page: Plus pricing | 1.93:1 | 5.52:1 | New `--gold-text: #805b1a`; retain original gold on dark promotional panels |
| Auth input boundary against page-colored input | 1.35:1 | 3.87:1 | New `--control-border: #82796a` |
| Empty board tile boundary against raised board | 1.19:1 | 3.41:1 | Same control-border token |
| Functional success text | Original brand green unsuitable on light raised surfaces | >=4.5:1 | `--green-text: #326a4b` |
| Functional red labels | Avoid sharing decorative brand fills with text | >=4.5:1 | `--red-text: #9b414d` |
| Focus on permanently dark promotional panels | 2.87:1 with the new light focus color | >=3:1 | Locally inherit a pale-blue focus color |

Primary `--text: #111318`, secondary `--text-2: #555b65`, and the warm Alibi text
tokens remain unchanged. Primary headings measure 13.63–18.58:1, achieving AAA-level
contrast without absolute black. Secondary descriptions remain lower contrast to
retain hierarchy (for example 6.16:1 on the main page). Alibi clue text retains
strong ink-on-paper contrast. New text tokens do not change blue, gold, coral,
green, violet, cyan, rose, or lime tile/logo fills.

Alibi's `--alibi-control-border` and stronger hover-border token identify suspect
cards and result-dialog controls. Decorative page/card/panel separators keep their
existing `--border` and `--alibi-border` colors.

## Individual component corrections

- Inputs and meaningful board boundaries use semantic control borders. Board
  tiles retain their brand fill with a dark boundary in light mode; tray piece
  shapes are borderless. Dark drag ghosts retain their original subtle outline.
- Perfect Stack uses the same visible content in both themes. Screen-reader
  cell names retain occupancy and piece ID without adding visible numbers.
- Placed and dragged pieces use the same fading treatment in both themes;
  game messages remain live status updates.
- Alibi selection uses the existing selected surface with a stronger boundary.
  Completed suspects and disabled controls now use the existing dark-mode fades
  in both themes. The earlier light-only opacity and dashed-state overrides were removed.
- Keyboard focus is explicitly provided for form controls and restored for mobile
  difficulty tabs, whose selected-state rule previously removed the outline.
  A working skip-to-content link bypasses the repeated header.
- Text links have an underline. The password-reset and auth navigation targets
  meet the 24px AA minimum. Button links in the welcome dialog retain their primary
  button colors and sizing, including on hover.
- The welcome dialog has consistent internal padding. Narrow victory statistics
  scale within their existing cards so ordinary timer values remain on one line.
- The header's dimensions and proportional content scaling remain unchanged:
  approximately 75.06px high on desktop/tablet and 68.28px on mobile.

## Dark-mode protection

Original dark page, surface, raised-surface, muted-text, decorative-border, Alibi,
and brand-fill tokens are preserved. Comparing before/after browser records found
only the intended functional text-color changes: blue labels previously measured
4.06:1 on surfaces (now 7.35:1), and red home-card labels measured 3.13:1 (now
8.20:1). These are actual contrast failures, so they receive text-only variants.

Additional genuine accessibility corrections shared with dark mode are the skip
link, link identification/target sizing, mobile keyboard focus, welcome padding,
  and narrow result-statistic sizing. Dark inputs and empty board tiles use
`--control-border: #697382`, which reaches 3.12:1 against the raised board; general
decorative borders remain unchanged. The follow-up removes light-only numbering
and selection labels and adopts dark mode's opacity treatments in light mode.

## Verification and artifacts

- `node scripts/verify-accessibility.mjs`: 162 page/theme/viewport/state combinations
  at 390, 768, and 1440px; zero required text-contrast failures, zero unreviewed axe
  violations, and zero page overflow. Minimum measured required light text: 4.65:1;
  even large text in this matrix clears the normal-text minimum.
- `node node_modules/tsx/dist/cli.mjs scripts/verify-accessibility-states.mjs`:
  76 supplementary result, error, hover, disabled, form, welcome, free/premium account
  control, and keyboard states at 320, 768, 1024, and 1440px. It solves a real Stack
  puzzle entirely with the keyboard, measures focus and required boundaries, and
  intercepts completion requests to avoid writing test progress to the server.
  Zero axe violations; minimum measured light focus contrast 4.27:1 and light UI
  boundary contrast 3.41:1. Dark focus reaches at least 3.52:1 and the required
  dark input/tile boundaries reach at least 3.12:1.
- `scripts/verify-header.ts`: both themes, eight viewport widths, alignment,
  navigation, keyboard focus return, Escape, outside click, and link dismissal.
- `scripts/verify-responsive.ts`: both themes, twelve portrait/landscape viewport
  sizes from 320 to 2560px, all Stack difficulties, long seeds, scrolling help
  dialogs, and completed/restored Alibi success/failure states. Its obsolete header
  assertions were updated for the existing mobile-menu behavior and WCAG AA's
  24px target minimum; most full-size game and modal actions retain 44–48px targets.
- TypeScript is checked with `node node_modules/typescript/bin/tsc --noEmit`.

Machine-readable before/after text/color records, axe findings, interaction
measurements, and desktop/mobile screenshots are in `artifacts/accessibility/`
(ignored by Git). The audit scripts reproduce the checks against a running local
server; `TEST_BASE_URL` overrides the default `http://localhost:3000` and
`CHROME_PATH` overrides the local Chrome binary.

## Intentional exceptions and limits

- Six axe target-size warnings are retained as reviewed records: the open mobile
  dropdown temporarily covers part of the underlying Daily-mode link. The test
  checks the full target is >=44px and geometrically covered by that dropdown
  before classifying it. Escape, outside click, and focus leaving dismiss the
  menu; it does not leave a permanently undersized control. Other target-size
  warnings still fail the audit.
- Logo colors, decorative home preview tiles/illustrations, subtle structural
  borders, and the decorative green status dot remain unchanged. Their information
  is supplied by adjacent text; those decorations do not independently require
  3:1 contrast. Gold victory stars use the accessible functional token.
- Inactive controls are exempt from WCAG contrast requirements. The parity
  follow-up restores the dark-mode disabled/placed fades in light mode too.
- Client account controls use local public-viewer fixtures and the real welcome
  markup. The authenticated server-rendered Account page was source-reviewed and
  uses the same verified auth-panel tokens; no real account, paid checkout, email,
  or external OAuth flow was exercised. Checkout is not implemented in this repo.
- Automated color checks cannot certify every possible future puzzle, browser,
  custom user stylesheet, image, or assistive-technology behavior. The original SVG
  identifier treatment was removed in the parity follow-up. No blanket WCAG AAA
  or whole-application conformance claim is made.

## Files modified

- `src/app/globals.css`
- `src/components/site-header.tsx`
- `src/components/games/perfect-stack-game.tsx`
- `src/components/games/stack-victory.tsx`
- `src/components/games/alibi-game.tsx`
- `scripts/verify-accessibility.mjs` (new)
- `scripts/verify-accessibility-states.mjs` (new)
- `scripts/verify-responsive.ts`
- `docs/accessibility-light-mode-audit.md` (new)
