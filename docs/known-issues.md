# Known issues

Defects and gaps found and not fixed, with where the fix belongs. A problem recorded here is one
somebody chose not to solve yet; a problem nobody wrote down is one the next person rediscovers the
hard way.

Add a row when you find something you are not fixing in the same pull request. Delete it when it is
fixed, in the pull request that fixes it.

## Product

| What | Why it matters | Where it belongs |
| --- | --- | --- |
| **No per-IP rate limiting anywhere.** A-101 criterion 5 (10 registrations an hour per IP) and A-103 criterion 4 (20 sign-in attempts per 15 minutes per IP) are both unmet. Only the per-address halves are enforced. | One address is limited; one attacker with a list of addresses is not limited at all. | A-101, A-103. Needs the client IP, which on Workers is `CF-Connecting-IP`. |
| **`VERIFY_TOKEN_HOURS = 24` is hardcoded** in `server/utils/tokens.ts`, and J-104 criterion 1 says no policy number is. | It is a policy number the committee may want to move, and moving it is a deploy. | It has no key on the workshop register, so it needs one proposing before it can be configuration. |
| **`ADMIN_TOKEN_HOURS` has no consumer.** The key and its default exist; nothing issues a `SET_PASSWORD` token. | Nothing is broken, but the surface lists a setting that changes nothing. | A-116 and A-121, which introduce the paths that issue one. |
| **An unclaimed console-created account lives indefinitely.** The unverified-expiry sweep exempts password-less accounts, because a guest or console creation was never anybody's registration to complete (0026). | Nothing removes an account made from the console and never claimed, so the exemption is a hole rather than a carve-out until claiming exists. | A-116, which builds claiming and the expiry that belongs with it. |
| **An erased Fellow's citation still names them.** The roll keeps the citation through an erasure, which is what A-127 says to ship: it is public wording the theatre published at the time, and the award is the theatre's record rather than the person's. | It is the one place an erased person's name survives by design, and nobody has confirmed that is what the committee wants. | The committee, who A-127 asks to confirm it. Changing the answer is one line in the personal-data registry. |
| **A Google sign-in still names one account state.** `?refused=linked-elsewhere` says the Google identity is on another account. The disabled state no longer leaks (A-122 criterion 2), but this one does. | It is useful copy for the person and a fact about an account for anyone else. Lower stakes than disabled-ness, which is why it was left. | A-123, which builds the merge that refusal points at. |
| **Personal data is classified per table, not per column.** `shared/utils/personal-data.ts` says what each table holds and what erasure does to it; `docs/data-model.md` promises a per-column scrub classification. `ledger_entries` is the first table where this is actually lossy: it names a person three times (`actor_id`, `comp_approved_by`, `tab_debtor_id`) and the registry can key it on one. | Harmless today, because the ledger's classification is `keep` and all three columns are therefore treated alike. It stops being harmless the first time a table naming a person twice wants different treatment for each. | K-109. The registry would take a list of columns per table rather than one, and the export and erasure queries would build from that list. |
| **`content/` holds no pages**, so `check:content-tokens` passes over zero tokens. | The check is green by vacuum, and will not have been exercised on real content until J-110. | J-110. |


## Platform

| What | Why it matters | Where it belongs |
| --- | --- | --- |
| **Seven scheduled tasks are stubs.** `holds:release`, `training:expiry-sweep`, `sessions:sweep`, `shifts:remind`, `nights:close`, `backup` and `retention:sweep` are registered, run on their cron and do nothing but name the story they wait for. | A cron that fires and does nothing looks identical to one that fires and works. | Each named story. `backup` (K-108) is the one with no other cover. |
| **The end-to-end suites fail on a GitHub runner and pass locally.** Sharing one dev server across the suites is green locally from a cold cache, repeatedly; on CI the server answers 500 from the third suite onwards and a hundred and one tests fall over. Three causes were tested; two were real defects fixed on the way and neither was it. | The nightly end-to-end workflow is red until this is understood, so a browser regression would not be caught there. | Nothing yet. The next step is capturing the dev server's own output from a runner, which the harness currently discards. |
| **`requirePermission` reads `liveGrants` twice** for the same account in one request. | Two D1 round trips where one would do, on every guarded request. | Whenever the authorisation path is next touched. |
| **Nothing alerts on an unhealthy deploy.** `/api/health` returns 503 naming pending migrations and nobody is watching it. | The signal exists and reaches no one. | K-107 criterion 4. |

| **A build while `bun run dev` is running breaks the dev server.** The build recreates the local database file, and every write from the running server then fails with `SQLITE_READONLY_DBMOVED`. | The error names neither the cause nor the fix, which is to restart `bun run dev`. | Nothing yet: it would want the dev database and the build's to be different files. |

## Tooling and tests

| What | Why it matters | Where it belongs |
| --- | --- | --- |
| **`Bun.WebView` exposes `click`, `type`, `press` and `cdp`**, and `tests/helpers/webview.ts` reimplements the first two through `evaluate`. | The bespoke versions work and are tested, but they are bespoke: the native ones dispatch trusted events, which ours cannot. | A tidy-up when a test needs something `evaluate` cannot do, such as a real keypress. |
| **One Chrome profile leaks per test run**, about 130MB, from the probe in `skipReason()`. The rest are swept when the app stops. | It filled this machine's `/tmp` with 105 of them before the sweep existed. One a run is survivable; nothing cleans it. | The harness, when the probe can be made to report its directory. |
| **The fellowship roll's browser test fails on a cold `.nuxt`, in a full run only.** The award modal stays open with `awardedOn` undefined while the date segments visibly show the date typed into them; the person, the resolving meeting and the citation all fill. It passes on a warm cache, passes when the suite runs alone, and passes when the same flow is driven by hand against the same server. | The one browser case covering A-127's award path is unreliable, so a real regression there could hide behind a run everyone has learned to re-run. | Nothing yet. Four causes were tested and none was it: tmpfs pressure from leaked profiles, an unwarmed page, a helper that typed before Vue attached, and a submit racing the model's commit. The next step is watching what `UInputDate` emits, which needs the component instrumented rather than the DOM read. |
| **Two integration files are `test.todo` stubs**: `races` and `money`. CI counts them as passing. | K-121 claims a named regression suite that gates from day one, and those two are still empty. `erasure` is filled in as of K-109. | K-121, and the stories that make each case buildable. |
