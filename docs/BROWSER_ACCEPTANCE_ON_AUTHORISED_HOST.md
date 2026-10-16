# M6 browser acceptance outside the restricted execution host

This host's managed Chromium returns `net::ERR_BLOCKED_BY_ADMINISTRATOR` before app JavaScript loads. Repeating the test on the same host cannot produce a meaningful product verdict, and restrictions must not be bypassed.

On an authorised development machine with Node 22+ and working browser networking:

```sh
npm ci
npx playwright install chromium firefox
npm run build
npx playwright test --config playwright.m6g.portable.config.ts
```

To rerun M6F IndexedDB in that environment, adapt `playwright.m6f.config.ts` to remove the Linux-only executable path (or run with a correctly provisioned Playwright browser), build the season persistence bundle with `npm run season:persistence:bundle`, and run the resulting test. Do not change assertion semantics or suppress failures. Capture browser versions, command outputs, screenshots, errors and final test status.

This work is not a substitute for that execution. Pass 12G-R remains acceptance BLOCKED pending these results.
