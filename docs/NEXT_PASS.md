# Next pass: M7 model quality, tactical captain AI, analytics and performance

Entry condition: Pass 12G-R management implementation is frozen and reproducible. The M6 browser acceptance remains blocked until an execution environment can navigate the production application and IndexedDB test origins. Do not mislabel that host-blocked gate as passed.

Once the browser gate can execute, rerun `npm run test:m6g` and the inherited M6F IndexedDB test. Complete formal M3 human playthrough separately.

The next feature milestone is M7. Keep it bounded to quality rather than expanding the career world:

1. build a real tactical captain policy over public match state, replacing the explicit baseline fixture captain where enabled;
2. calibrate and quality-check format distributions, while preserving deterministic/versioned model contracts;
3. implement the V0.1 analytics still missing from the player experience, particularly partnerships, worm, Manhattan and wagon-wheel views where supported by canonical events;
4. close the V0.1 editing gap for names/colours/new-game roster import, or formally revise that product requirement;
5. measure and optimise the declared performance budgets on a reference machine;
6. run scenario grids for tactical dominance/exploits and model-quality acceptance.

Do not add multiyear careers, global competitions, transfers, contracts or finances until the V0.1 vertical slice has cleared M7 and M8.
