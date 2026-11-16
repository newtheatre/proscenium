# Your theatre

This folder is yours. Upstream never changes anything in it after your first release, so updates
merge without conflicts.

- `content/pages/` holds your public pages as Markdown. `content/pages/index.md` is the home page.
  Quote a setting with `:setting{name="core.locale.currency"}`; only settings marked quotable work.
- `app/` overrides upstream's pages and components: a file here with the same path wins.
- `server/` adds your own server routes.
- `layers/x-<name>/` holds a module of your own, shaped like upstream's modules; its id starts with `x-`.
- `migrations/` holds the migrations for your own modules' tables (`bun run db:generate -- --owner site`).
- `public/` holds static files, such as your logo.
- `package.json` lists any packages your own code needs.
