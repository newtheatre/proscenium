# Review against Nuxt 4 best practices

Reviewed: `next` at `dacf1e4` (16 November 2026). Scope: the Nuxt app and server in `layers/core`, the root
`nuxt.config.ts` and the `site/` folder, read against Nuxt's own guidance on
[accessibility](https://nuxt.com/docs/4.x/guide/best-practices/accessibility),
[hydration](https://nuxt.com/docs/4.x/guide/best-practices/hydration),
[performance](https://nuxt.com/docs/4.x/guide/best-practices/performance) and
[plugins](https://nuxt.com/docs/4.x/guide/best-practices/plugins), plus general Nuxt 4 conventions (layers,
data fetching, server routes, auto-imports). Nuxt UI component choice and inline Tailwind are left to the
separate review.

This is a reading of the code. Nothing was run, measured or changed, so the performance findings are
reasoned from the code and want a measurement before and after any fix.

Priorities: **P1** affects people using the site now, or will once box office traffic arrives. **P2** is a
clear departure from the guidance with a contained fix. **P3** is tidying.

| # | Priority | Area | Finding |
|---|---|---|---|
| 1 | P1 | Accessibility | Focus stays where it was after a client-side navigation |
| 2 | P1 | Hydration | The colour mode is corrected after the page mounts, so it can flash |
| 3 | P1 | Performance | One page render makes four to six internal API calls, each repeating the same database reads |
| 4 | P2 | Performance | Every navigation inside a shell waits on a request to `/api/core/access` |
| 5 | P2 | Accessibility | No title template, so tabs and announcements never name the theatre |
| 6 | P2 | Accessibility | A filtered or searched list does not announce its new result |
| 7 | P2 | Plugins | A plugin replaces the global `$fetch` |
| 8 | P2 | Performance | Turnstile is loaded with a hand-written script tag |
| 9 | P2 | Performance | The brand stylesheet blocks rendering and is cached for only a minute |
| 10 | P2 | Performance | Signed-in dialogs, the palette and passkey code sit in every visitor's first load |
| 11 | P2 | Performance | Every catalogue of every module, and the test fixture's, is bundled eagerly |
| 12 | P2 | Conventions | Three pages call `history.replaceState(null, …)` behind Vue Router's back |
| 13 | P2 | Data fetching | `PageList` gives `useFetch` a fixed key while its query changes |
| 14 | P2 | Hydration | The dark logo follows the operating system, not the chosen mode |
| 15 | P3 | Server | The Nitro plugins run in the opposite order to the one their comment promises |
| 16 | P3 | Server | Bindings are remembered in a module variable for internal calls |
| 17 | P3 | Conventions | `composables/` holds plain utilities, and auto-imports are imported by hand |
| 18 | P3 | Conventions | Redirects are decided in page setup rather than route middleware |
| 19 | P3 | Conventions | `useState` holds functions and promises |
| 20 | P3 | Hydration | Dates are formatted by hand; fixed element ids |
| 21 | P3 | Performance | Link prefetching and route rules are left at their defaults |

## P1

### 1. Focus stays where it was after a client-side navigation

Every layout already has `<main id="main" tabindex="-1">` (`layers/core/app/layouts/centred.vue:14`,
`console.vue:88`, `default.vue:76`, `members.vue:44`) and `app.vue:5` has `<NuxtRouteAnnouncer />`, but
nothing moves focus. After following a link a keyboard or screen-reader user is left on the link they
pressed (or on `<body>` if it has gone), with the whole header to cross again. The guidance says not to
assume focus moves by itself.

**Fix.** Add `layers/core/app/plugins/focus-main.client.ts`: in `useRouter().afterEach((to, from) => …)`,
skip when `to.path === from.path` (so list filters, which only change the query, keep focus), then
`await nextTick()` and `document.getElementById('main')?.focus()`. `PageSteps.vue:59-63` already moves
focus to its own heading between steps and can stay as it is.

### 2. The colour mode is corrected after the page mounts

Two places change the mode once the app is already on screen:

- `layers/core/app/plugins/appearance.client.ts:8-21` waits for `app:mounted`, fetches the public settings
  and then sets `colorMode.preference` to the site's starting mode. A first-time visitor on a site that
  starts dark sees light first.
- `layers/core/app/layouts/default.vue:14-22` toggles the `dark` class on `<html>` by hand in `onMounted`
  to pin public pages light, and again in `onBeforeUnmount`. A visitor in dark mode sees a dark public page
  flip to light, and the layout is writing to the same class the colour-mode module owns.

Both are the pattern the hydration guide warns about: the server and the first paint disagree with what the
client decides a moment later.

**Fix.** Let the server know the answer before it renders.

- Set `colorMode: { storage: 'cookie' }` (supported by `@nuxtjs/color-mode`, which Nuxt UI brings). The
  server then renders the right class. A first-time visitor has no cookie, so a small server middleware
  can set it to `core.appearance.default` when it is absent. `CHOSEN_KEY` in `localStorage`
  (`AccountMenu.vue:36`) can become a second cookie, or go away if the first-visit cookie is only written
  when the person has not chosen.
- Pin the public pages with the module's own forced mode: a global route middleware sets
  `to.meta.colorMode = 'light'` for addresses outside the shells when `core.appearance.public-dark` is off.
  That removes the DOM writes in `default.vue` altogether.
- The plugin then has nothing left to do and can be deleted, which also answers the plugins guide
  ("prefer composition over plugins").

### 3. One page render makes four to six internal API calls

A server render of a console page calls `/api/core/access` (`middleware/access.global.ts:13`),
`/api/core/branding` (`layouts/console.vue:10`), `/api/core/navigation` (`console.vue:12`),
`/api/core/viewer` (`composables/useViewer.ts:16`), `/api/core/settings/public` (`AccountMenu.vue:16`) and
then the page's own data. A public page calls three of them (`layouts/default.vue:7-8`, `AccountMenu.vue:13`).

Each call goes through the whole of `defineRoute` (`layers/core/kit/route.ts:99-153`) with a fresh
context and an empty cache (`kit/context.ts:75`), so each one separately reads the module states
(`kit/modules-store.ts:14`), the whole settings table (`kit/settings-store.ts`), the session row and the
account row (`server/identity/access.ts:16-19`), and counts against the rate limit. That is roughly four
D1 queries multiplied by every call, before any real work: twenty or more for a console page, and a dozen
for a public page, which is the path a busy on-sale will hit hardest.

**Fix.** Any one of these, in rising order of effort:

1. Share the per-request cache between the calls of one render. If internal calls made with
   `useRequestFetch` carry the original event's context (worth confirming, see finding 16), the settings
   map, module states and resolved actor can hang off the outer event and be reused instead of being
   read again.
2. Replace the shell's separate calls with one, for example `/api/core/shell?path=…`, answering the
   access decision, viewer, brand, public settings and the shell's navigation together, fetched once with
   `useAsyncData('core:shell', …)` and read by the existing composables.
3. Cache what is the same for everybody. The brand and the public settings do not depend on the viewer;
   an isolate-memory or KV copy keyed on the brand revision and a settings revision removes them from
   most renders.

## P2

### 4. Every navigation inside a shell waits on `/api/core/access`

`middleware/access.global.ts:9-22` awaits a request on every navigation whose address is under a shell,
client-side ones included, so each click in the console costs a round trip before the page starts to
load. The server already enforces the ability on every API route, and the viewer's permitted entries are
already in the payload (`useViewer`, `useNavigation`).

**Fix.** Keep the request on the server render and for addresses the client knows nothing about. On the
client, answer from the navigation already fetched when the target matches an entry the viewer was given,
and only ask the server otherwise. `fatal: true` (`:17,19,21`) is right for the client and has no effect
on the server, so it can stay.

### 5. No title template

Pages set a bare title (`PageFrame.vue:11`, `pages/sign-in/index.vue:5`, `pages/[...slug].vue:6` and five
more), and nothing sets `titleTemplate`. Tabs read "Sign in" with no theatre name, and the route announcer
reads the same.

**Fix.** In `app.vue`, add a script with
`useHead({ titleTemplate: t => t ? `${t} · ${brandName}` : brandName })`, taking the name from `useBrand()`.

### 6. A filtered list does not announce its result

`PageList.vue` puts the count in the table's caption (`:260-262`) and beside the pagination, but changing a
filter or the search only changes the query, so the route announcer says nothing and no live region
changes. `SettingsSearch.vue:27-32` already does this properly with `role="status"`.

**Fix.** Either a visually hidden `role="status"` paragraph holding `pageLabel`, or Nuxt's `useAnnouncer()`
with `<NuxtAnnouncer />` beside the route announcer in `app.vue`, called from a `watch` on `total`.

### 7. A plugin replaces the global `$fetch`

`plugins/confirm-its-you.client.ts:13-28` swaps `globalThis.$fetch` for a wrapper that opens the "confirm
it is you" dialogue and retries. Nuxt's custom-fetch recipe says `$fetch` is deliberately not globally
configurable because modules depend on its behaviour. There are practical gaps too: instances made with
`$fetch.create` are not wrapped (`:27` copies the original), and the eighteen calls that go through
`callIdentity` use the browser's `fetch` (`composables/useIdentity.ts:9`) and never reach it, which is why
`pages/account/passkey.vue:22` has to repeat the retry by hand.

**Fix.** Provide the wrapper as its own instance instead: a plugin that returns `provide: { api }`, where
`api` wraps `$fetch.create()` with the same retry, and a `useAPI` made with `createUseFetch` for
components. Move the nine `$fetch` call sites in `layers/core/app` and `callIdentity` on to it. The global
is then untouched.

### 8. Turnstile is loaded by hand

`components/TurnstileCheck.vue:9-23` appends a script tag itself. A failed load rejects inside `onMounted`
with nothing shown to the person, the widget is never removed on unmount, and an expired token is never
reported. The performance guide points third-party scripts at Nuxt Scripts.

**Fix.** Use `@nuxtjs/turnstile` (its `<NuxtTurnstile>` handles load, reset and expiry) or `useScript`
from Nuxt Scripts with a manual trigger, and show a refusal when the check cannot load.

### 9. The brand stylesheet

`layouts/default.vue:24-26` links `/api/core/branding/theme.css?v=<revision>`, a render-blocking request to
the Worker on every public page, and `server/api/core/branding/theme.css.get.ts:8` caches it for sixty
seconds even though the address already changes with the revision.

**Fix.** Either inline it (`useHead({ style: [{ innerHTML: css }] })` from the brand data the layout
already has, which removes the request), or keep the link and send
`cache-control: public, max-age=31536000, immutable`, since a new brand gets a new address.

### 10. Signed-in code in every visitor's first load

`app.vue:9-10` mounts `ConfirmDialog` and `ConfirmItsYouDialog` on every page, and the second pulls in
`@simplewebauthn/browser` through `useIdentity.ts:3`. `layouts/console.vue:69` mounts the palette eagerly.
An audience member reading the public site downloads and hydrates all of it.

**Fix.** `<LazyConfirmDialog v-if="pending" />` and the same for the other dialogue (its `watch` on
`pending` at `ConfirmItsYouDialog.vue:51` then needs `immediate: true`), and
`<LazyCommandPalette hydrate-on-idle />` in the console. Run `nuxt analyze` afterwards to confirm the
entry chunk shrank.

### 11. Every catalogue is bundled eagerly

`composables/useT.ts:4-12` globs every module's catalogue with `eager: true`, so all strings of all
modules, switched on or not, are in the first chunk, and the list includes
`tests/fixtures/gallery/gallery/i18n/en-GB.json` (`:9`), which ships test strings in production builds.

**Fix.** Drop the fixture path from the production glob now (the gallery build can add it through its own
layer). As modules arrive, have `scripts/generate.ts` write one merged catalogue per shell, or move to
`@nuxtjs/i18n` with lazy locale files, which also prepares for a second language.

### 12. `history.replaceState(null, …)`

`pages/sign-in/link.vue:10`, `verify-address.vue:13` and `confirm-erasure.vue:14` clear the token from the
address with `history.replaceState(null, '', …)`. Vue Router keeps its own data in `history.state`;
replacing it with `null` loses it, which shows up as broken Back and scroll restoration.

**Fix.** `history.replaceState(history.state, '', location.pathname)`, or `useRouter().replace({ hash: '' })`.

### 13. `PageList` uses a fixed key with a changing query

`PageList.vue:57` calls `useFetch(props.route, { query, key: `core:list:${props.route}`, watch: [query] })`.
The key does not include the query, so page 2 and page 1 share one cache entry, and `watch: [query]`
repeats what `useFetch` already does for a reactive `query`.

**Fix.** Drop both options and let Nuxt derive the key from the address and query, or pass a computed key
that includes the query.

### 14. The dark logo follows the operating system

`layouts/default.vue:41-54` picks the dark logo with `media="(prefers-color-scheme: dark)"`, but the app's
mode is the `dark` class, which a person can set against their system. They can get a light logo on a dark
header. This overlaps with the Nuxt UI review (`UColorModeImage` exists for exactly this); it is listed
here because the fix for finding 2 makes the server know the mode, so the right logo can be rendered first
time.

## P3

### 15. Nitro plugin order

`server/plugins/identity.ts:2` says it "runs after the kit plugin". Nitro loads scanned plugins in path
order, so `identity.ts` runs before `kit.ts`. It is harmless today because `setAccessProvider` does not
need the registry at that moment. **Fix:** name them `01.kit.ts` and `02.identity.ts`, or correct the comment.

### 16. Remembered bindings

`kit/route.ts:75-84` keeps the Cloudflare `env` from an earlier request in a module variable for internal
calls that arrive without one, fed by a `request` hook on every request (`server/plugins/kit.ts:17`).
Calls made through `useRequestFetch` (which `useFetch` uses on the server) pass the original event's
context along, so this may no longer be needed. **Fix:** test a server render with the fallback removed;
if it passes, delete both. It ties in with finding 3, option 1.

### 17. Utilities in `composables/`

`composables/useIdentity.ts` exports `callIdentity`, `provePasskey`, `makePasskey`, `addMyPasskey` and
`nextPath` and no `useIdentity`; `useT.ts` exports `translate` and `hasMessage`; `useNavigation.ts` exports
`isCurrent`. They work because Nuxt auto-imports every export, but several files then import them by
relative path anyway (`DataBoundary.vue:5`, `PageForm.vue:11`, `RecoveryCodes.vue:3`, `console.vue:6`).
**Fix:** move plain functions to `app/utils/`, keep `use*` files for real composables, and drop the manual
imports. Shared code in `layers/core/shared/*.ts` is imported by relative path throughout; moving it under
`shared/utils/` and `shared/types/` would let Nuxt auto-import it on both sides.

### 18. Redirects in page setup

`pages/setup.vue:6-7`, `pages/sign-in/index.vue:14-15` and `pages/account/passkey.vue:12-13` fetch and then
`await navigateTo()` in setup. **Fix:** an inline `definePageMeta({ middleware })` (or a named one) does
the same before the page component is created. Related: seven pages repeat
`definePageMeta({ layout: 'console' })`; a `pages:extend` hook in the core layer, or a parent
`pages/console.vue`, could set the layout from the address once, which matters more when modules add pages.

### 19. `useState` holding functions and promises

`composables/useConfirm.ts:18` and `useConfirmItsYou.ts:12-14` keep a `resolve` function and a `Promise` in
`useState`. `useState` is meant for values that can be serialised into the payload. It works because these
are only ever set in the browser. **Fix:** a module-level `shallowRef` in a client-only composable says
what it is and cannot leak into a payload by accident.

### 20. Dates and ids

- `DataBoundary.vue:26` and `pages/sign-in/confirm-erasure.vue:10` format dates with `toLocale…String`.
  Both currently render only after mounting, so nothing mismatches today, but `<NuxtTime>` is the safe
  default once dates appear in server-rendered lists (box office will have many).
- `RecoveryCodes.vue:29` uses the fixed id `codes-heading`, and the modal forms use `new-venue` and
  `new-vocabulary`. `useId()` avoids clashes if any is ever rendered twice.

### 21. Prefetching and route rules

The console menu is a column of links, and by default each one prefetches its page when it becomes
visible. **Fix to consider:** `experimental.defaults.nuxtLink.prefetchOn: { interaction: true, visibility: false }`,
and a `build:manifest` hook that stops public pages prefetching console chunks. No `routeRules` are set;
once the per-viewer parts of the public shell are client-rendered (finding 3), public pages could take
`swr` and be served from cache during an on-sale.

## Already in line with the guidance

- `<NuxtRouteAnnouncer />`, a skip link first in every layout, `lang="en-GB"`, a visible focus ring and
  `prefers-reduced-motion` honoured in `main.css`.
- Browser storage is only read in `onMounted` (`PageForm.vue:120`, `PageSteps.vue:51`,
  `useStepsProgress.ts:26`), so drafts and progress never cause a mismatch.
- Data is fetched with `useFetch` or `useAsyncData` with keys and defaults, so it travels in the payload;
  the palette's data waits until it is first opened (`CommandPalette.vue:22-30`).
- List rows carry a real `NuxtLink` as well as the row click (`PageList.vue:326-338`); signing out is a
  POST from a button.
- Two app plugins, both client-only and cheap; fonts and icons bundled, nothing fetched from a third party
  apart from Turnstile.

## Noticed in passing, outside this review

Several screens hold English text in the template rather than going through `t()`:
`pages/setup.vue`, the `pages/sign-in/` pages, `pages/account/passkey.vue`, `RecoveryCodes.vue`, the venues,
vocabularies and email console pages, and the fallback refusals in `useIdentity.ts:17,20`.
