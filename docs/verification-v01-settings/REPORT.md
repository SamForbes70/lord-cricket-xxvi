# V0.1 settings: 115% text scale

This slice adds 115% text scale to exhibition and career screens. The imported-roster career uses the saved career scale. Match text scale, commentary and layout persist across reloads. Invalid saved values fall back to supported defaults.

The production build, type check and lint passed on Linux. Four career checks and four match checks passed across Chromium and Firefox. They cover persistence, invalid values, navigation to roster career and narrow-screen layouts at 115%.

This slice does not complete the full V01-007 accessibility and navigation acceptance. Later checks must cover all required keyboard, focus, reduced-motion and player-navigation cases.
