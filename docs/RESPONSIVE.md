# Responsive layouts

Shared spacing and content bounds live in `src/app/globals.css` as
`--content-max`, `--page-gutter`, `--header-gutter`, and `--panel-space`.
Responsive rules sit beside their components. Layout changes use CSS rather
than viewport listeners or duplicate mobile components.

The header keeps navigation, theme, streak, and Plus accessible in two rows on
phones. Home progress remains visible. Perfect Stack places stats before the
board below 1024px; its board is bounded at 560px and tray previews use CSS cell
sizes. Drag ghosts continue to use the actual rendered board cell dimensions.
Alibi suspects become two columns on tablets and one on phones. Disabled,
unselected suspects retain opacity and grayscale styling.

Dialogs scroll internally within the dynamic viewport, with sticky headings
and 44px close controls. Ads stay outside gameplay and fit their container.
Perfect Stack includes responsive loading and retry states.

## Verification

Run `npm run test:responsive` against the development server on port 3000.
The script uses installed Chrome (`CHROME_PATH` can override the executable).
Screenshots are saved under `artifacts/responsive`.

The layout matrix covers Home, Plus, Alibi, and all three Practice Stack sizes,
in light and dark themes, at widths 320, 360, 390, 430, 768, 1024, 1280, 1440,
1920, and 2560. Extra 844×390 and 720×450 viewports cover short landscape and
reduced available space. It checks horizontal overflow, header touch targets,
mobile progress visibility, board/tray bounds, long seeds, instructions,
Alibi success/failure modals, selection preservation, and completed refreshes.

`npm run test:stack-browser` checks pointer geometry at 320, 390, 768, and 1440,
rotation, invalid placement restoration, solving all sizes, completion locking,
and emulated touch dragging/edge scrolling. `npm run test:stack-persistence`
checks completed Daily restoration independently for each difficulty.

These checks use desktop Chrome and touch emulation; physical iOS/Android
browser testing remains advisable. The 720×450 viewport is a layout proxy,
not a native browser zoom test.
