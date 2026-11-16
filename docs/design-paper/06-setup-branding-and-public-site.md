# Setup, branding and the public site

A theatre goes from nothing to a branded, working site in one sitting, without a command line. This tab is where Parts A and B meet, so it describes the experience only.

## First run

1. Fork the repository and press a deploy button. Cloudflare creates the Worker, database, file store and queues from the configuration.
2. Open the new site. A setup screen applies the database migrations and creates the first owner account with a passkey.
3. A wizard asks for the theatre's name, time zone, currency, season pattern and brand colour, and offers a preset for the type of theatre.
4. The wizard offers modules to switch on. Each has its own short setup, with sensible defaults, that can be finished later.
5. A demo mode fills the site with sample productions so a committee can try it before committing.

The target is under 30 minutes from fork to a branded site with a what's-on page.

## What lives where

| Lives in the app (database) | Lives in the fork (repository) |
| --- | --- |
| Name, logo, favicon, colour, fonts | Public page content: about, policies, news, history |
| Module switches and every setting | Page layouts and components a theatre chooses to redesign |
| Roles, permissions, custom fields | Deploy configuration and domain |
| Email templates and sender identity | The upstream release the fork has merged |
| Productions, listings and everything operational | A theatre's own extra module, if it writes one |

Branding in the app survives updates and travels with the database, as it does in Flytower.

## Public pages

- Pages are written with Nuxt Content in the fork's site folder, the only part of the repository a theatre edits.
- Ready-made components drop into any page: what's on, a production page, a booking button, a season grid, a committee list, a policy number quoted live.
- A theatre that wants its own design replaces the page or the layout in its fork. The platform's version stays the default for everyone else.
- Listings and production pages come from the database, so the public site is never stale and never needs a redeploy for a new show.
- Starter content ships marked as placeholder, and a check lists what a theatre has not yet replaced.
- Content is edited through Git (decided). Nuxt Studio is documented as an option for theatres whose editors do not use Git.

## Looking after it

- An admin page shows the running version, pending migrations, the last backup and the health of queues and scheduled tasks.
- Backups run nightly to the theatre's own file store and can be downloaded.
- Updates arrive as a pull request in the fork; merging it deploys.
- A handover checklist for a new site owner: who holds the Cloudflare account, the domain, the repository and the owner role.
