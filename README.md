# Proscenium deploy check (throwaway)

This branch is not product code. It is the small skeleton used to prove that a theatre can get a
running copy on Cloudflare without creating any resource by hand. Delete the branch afterwards.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/MattA-Official/proscenium/tree/deploy-check)

## What to do

1. Press the button, signed in to your personal Cloudflare account. Accept the defaults
   (build command `bun run build`, deploy command `bun run deploy`).
2. When it finishes, open `https://<worker>.<subdomain>.workers.dev/api/core/health`.
   It should answer `{"d1":{"ok":1},"runtime":"Cloudflare-Workers"}`.

## What the check is looking for

- Were the D1 database, R2 bucket, KV namespace and queue created with no identifier typed in?
- Does the repository the button created in your GitHub account keep this repository's commit
  history (`git log` shows the same commits), or does it start fresh?
- Did the Worker take the name you typed, written into `wrangler.jsonc`?

## Clean up

Delete the Worker, the D1 database, the R2 bucket, the KV namespace and the queue it made, and
the repository the button created.
