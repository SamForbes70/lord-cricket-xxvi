# Next pass: M7C empirical calibration and browser acceptance

Pass 14 M7B added the optional in-app T20 tactical captain and an offline Cricsheet JSON match reference reader. Node tests and build gates passed, but the restricted Chromium host returns ERR_BLOCKED_BY_ADMINISTRATOR on localhost. M3 human acceptance remains pending; M6/M7 browser acceptance is not PASS.

Next: obtain an actual Cricsheet JSON ZIP under ODC-By terms, record SHA-256 and attribution, run the reference reader with at least 200 date-held-out T20 matches; compare matched innings/wicket/phase distributions against existing `SYNTHETIC_ALPHA` output. Then fit a NEW versioned parameter pack with independent validation. Do not mutate `synthetic-alpha-01`, historical event hashes or existing save/replay semantics.

Run M6F/M6G/M7B Playwright cases under a permitted Chromium and Firefox host, profile response times/IndexedDB/memory on a stated four-core 8GB reference machine. Add opponent end-to-end persistence, save/reload and accessibility evidence. Undertake human M3 match acceptance. Then tackle ODI/red-ball tactical and analytics coverage as independent explicitly gated scopes.

Do not claim M7 acceptance from the current synthetic samples or expand contracts, finance, multiyear or international careers.
