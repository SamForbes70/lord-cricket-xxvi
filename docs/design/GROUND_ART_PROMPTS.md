# Ground art: AI prompts and how to add a painting

Owner direction, 20 November 2026: "generate the ground art with AI".

## Status

- **Aster Quay** has its painting (`apps/web/src/art/aster-quay.webp`).
- The other seven grounds show a **procedural floodlit stadium** drawn in SVG from the ground's name (`apps/web/src/world/ground-art.ts`). It works offline, and it covers grounds renamed in an edited world.
- **Superseded 20 November 2026:** the owner wants the art free and AI-made in the project, so no paid image service is used (see `docs/OWNER_DECISIONS_2026-11-13.md`). The prompts below stay as a brief for that work. Earlier note: the AI paintings for the seven are **not generated yet**. The session's image service (Abracadabrax, model GPT Image 2, 158 credits an image at the time of writing) asked for the owner to sign in again, and this session cannot sign in for the owner. The prompts below are ready to use.

## Licence check before an image goes in the game

Before a generated image is committed, the owner confirms that the image service's terms let the output be used in a distributed game. Record the service, model, date and prompt in the table at the end. Do not commit an image whose terms are unknown.

## Adding a painting

1. Export at 1600 by 900 or larger, convert to WebP (quality about 80, under 250 KB): `cwebp -q 80 in.png -o copperfield.webp`.
2. Save to `apps/web/src/art/grounds/<slug>.webp`; the slug is the ground name in lower case with hyphens (`northlight-park`).
3. Add one line to `PAINTINGS` in `apps/web/src/world/ground-art.ts`:
   `"northlight-park": new URL("../art/grounds/northlight-park.webp", import.meta.url).href,`
4. Run `npx vitest run tests/unit/ground-art.test.ts` and the UI browser suite.

## Shared style (append to every prompt)

> Rich, cinematic matte-painting style with gentle brush texture, the same family as a painted British county ground at dusk. Muted teal and brass colour grading. The field is empty of players. Keep the left third of the frame darker and quieter so text can sit over it. No people, no text, no logos, no advertising boards, no watermark. 16:9.

## Prompts

| Ground | Prompt (then add the shared style) |
| --- | --- |
| Copperfield | A painterly illustration of a fictional cricket ground at night, seen from a high wide angle behind the bowler's arm. Deep green oval outfield, pale pitch at the centre, low white picket boundary. On the far side, a Victorian red-brick pavilion with a weathered copper-green roof and a weathervane, modest stands, and old brick chimneys of a mill town beyond. Four tall floodlight towers cast cool white light; warm amber glow from the pavilion windows. Deep navy sky, soft haze round the lights. |
| Northlight Park | A painterly illustration of a fictional northern cricket ground on a clear cold night, high wide angle from the sightscreen. Dark pine forest behind a long timber stand, a faint green-blue aurora low in the sky, crisp white floodlight on a dewy outfield, a small slate-roofed pavilion with lit windows. |
| Westmere Oval | A painterly illustration of a fictional lakeside cricket oval in the last blue light after sunset, wide angle from the pavilion end. A still lake beyond the boundary reflects the floodlights; low grassy banks with deckchairs, a white weatherboard pavilion with a clock, a line of poplars bending in a light wind. |
| Ember Meadow | A painterly illustration of a fictional rural cricket ground at night in late summer, wide angle from behind the bowler. Hay meadows and hedgerows round the boundary, an old thatched-and-timber pavilion glowing with warm lantern light, a few embers from a distant bonfire drifting up, warm floodlights over a dry, fast outfield. |
| Silverfen | A painterly illustration of a fictional fenland cricket ground on a misty night, wide angle from square of the wicket. Flat wetlands and silver birches beyond the boundary, low mist rolling across the outfield edges, a brick pavilion with a white balcony, floodlight beams visible in the mist, a windmill silhouette on the horizon. |
| Larchwood Ground | A painterly illustration of a fictional hill-country cricket ground at night, wide angle from a grass bank. Steep larch-covered hills rise behind a wooden pavilion with a green roof and a covered verandah, a small terrace of seats cut into the bank, floodlights on lattice towers, a stream glinting beyond the far boundary. |
| Moonstone Fields | A painterly illustration of a fictional chalk-downland cricket ground under a large rising moon, high wide angle. Pale chalk paths over rolling downs, an old grey stone pavilion with arched windows, a ring of standing stones far off on the skyline, floodlights giving the outfield a silvery sheen. |

## Generated images (fill in when added)

| Ground | Service and model | Date | Terms checked by | File |
| --- | --- | --- | --- | --- |
| Aster Quay | Existing painting from #90 | | | `art/aster-quay.webp` |
