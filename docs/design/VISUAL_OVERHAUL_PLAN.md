# Visual overhaul plan: studio-quality look and feel

Owner direction, 20 November 2026: "Build a comprehensive plan on how to get the look and feel of the game up to studio quality. Then don't winge, be an AI of action." The owner's reference was a mobile cricket auction screen (dark floodlit stadium, glossy panels, bold condensed type, gold accents, player cards with big ratings, team badges everywhere).

We take the **genre conventions** from that reference, not its look: no copied layout, art, names, logos or trade dress. Lord Cricket keeps its own identity (pine, brass, the crests, Aster Quay) and pushes it into a night-match broadcast style.

## Where it stands (audit, 20 November 2026)

- Three screens were restyled in the Pavilion pass (#90): club selection, career home and the match scoreboard. Everything else uses the original light, form-like styling: Squad and Contracts are spreadsheets, Exhibition setup is a bare form, Statistics, Tournaments, Scenarios and Rain are plain lists, and the auction is a table.
- No player imagery exists; players are names in a table. Ratings are hidden numbers.
- Typography is system sans plus Georgia. No display face, no numerals with presence.
- Constraints the overhaul must keep: WCAG AA contrast (an automated audit checks 4.5:1 on match copy against the nearest solid background colour), 150% text scale and 200% zoom without horizontal scroll, reduced motion, keyboard focus, offline play (no web fonts or images from the internet), and the browser tests, which find controls by role and name.

## Design direction: "Floodlit"

| Element | Decision |
| --- | --- |
| Backdrop | Night stadium: deep pine-navy gradient with soft floodlight glows, solid base colour underneath for contrast checks |
| Surfaces | Raised glass panels (solid dark fill, 1px light edge, inner highlight, soft shadow); gold-edged "hero" panels for the thing that matters on each screen |
| Accent | Brass gold for primary actions, ratings and highlights; team kit colours for identity; red only for danger and wickets; green for success and runs |
| Type | Barlow Condensed (bold, upper case) for headings, numbers and buttons; Inter for body text. Both bundled offline under the SIL Open Font Licence |
| Numbers | Big tabular numerals for scores, ratings, wallets, overs |
| Identity | Crests on every team mention; generated player portraits in kit colours; role icons (bat, ball, gloves, all-rounder) |
| Motion | Short, purposeful: card lift on hover, lot reveal, wicket and boundary flashes. All off under reduced motion |

## Phases

1. **Design system (foundation).** Tokens for colour, type, spacing, radii and elevation; the Floodlit backdrop; restyled buttons (gold primary, glass secondary, danger), selects and inputs, tabs, tables (sticky header, zebra, hover), panels, chips and badges, focus rings. Applied globally so every screen lifts at once.
2. **Player identity.** A public overall rating (OVR) per player and format, shown everywhere a player appears. Procedurally drawn player portraits (SVG: head, cap or helmet, shirt in the club's kit colours, a consistent face per player id), role icons, and a reusable player card (portrait, OVR, role, key attributes, contract or price).
3. **Hero screens.**
   - **Auction:** three columns like a broadcast auction room: the teams' wallets and bidding status, the player on the block as a large card with the current bid, and your squad's make-up against the balance rules; a big gold Bid button.
   - **Squad:** a grid of player cards with filters by role, with the existing table kept as a view for detail.
   - **Match:** a broadcast score bug (crests, score, overs, target, rate), batter and bowler cards, a recent-balls strip, decision panel as a styled tray.
   - **Career home:** fixture hero with both crests and the ground art; next action as a gold call to action.
4. **Remaining screens.** Exhibition setup (team picker cards with crests), Tournaments, Scenarios and Rain (cards with art headers), Statistics (leaderboard cards), Contracts, Settings.
5. **Art.** One illustration per ground (eight), club banners, and an app icon. Needs an artist or an image generator with clear licence terms; until then, procedural SVG stadium silhouettes per ground and the existing Aster Quay painting. Owner decision needed on how art is sourced.
6. **Motion and sound polish.** Transitions between screens, the lot reveal, boundary and wicket moments, and optional crowd ambience tied to the existing audio settings.
7. **Quality.** Contrast and zoom audits on every screen, before and after screenshots in `docs/verification-visual-overhaul/`, Chromium and Firefox, Windows CI.

## Delivery

Each phase ships through its own pull request with green hosted CI. Phase 1 and 2 and the auction and squad parts of phase 3 go first, because they change how the whole game feels. No game rule, engine, save format or test locator changes for looks alone.

## Definition of studio quality (what "done" means)

- No screen looks like a form or a spreadsheet at first glance; every screen has a clear hero element.
- Every team mention has its crest; every player mention can show the player's face and rating.
- Consistent type scale, spacing and colour across all screens; nothing in the original light theme left behind.
- Passes contrast, zoom, reduced-motion and keyboard checks; plays offline.
- A person who has not seen it before describes it as a game, not a tool. (Needs a playtest to establish.)
