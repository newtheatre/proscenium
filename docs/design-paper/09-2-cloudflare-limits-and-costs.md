# Cloudflare limits and costs

A theatre on the Workers Paid plan should pay the 5 US dollar monthly minimum and little else, because the included allowances are far above what one theatre uses. Figures are from Cloudflare's documentation on 16 November 2026, in US dollars.

## Why the paid plan is assumed

- **Email Sending needs it.** On the free plan a Worker can only send to verified addresses, so tickets and receipts could not be sent.
- **CPU time.** The free plan allows 10 ms a request, which server-rendering a page or building a PDF will exceed.
- **Queries.** The free plan allows 50 database queries per request; paid allows 1,000.

## What the paid plan includes each month

| Product | Included | Beyond that |
| --- | --- | --- |
| Workers requests | 10 million | $0.30 per million |
| Workers CPU time | 30 million ms | $0.02 per million ms |
| D1 rows read | 25 billion | $0.001 per million |
| D1 rows written | 50 million | $1.00 per million |
| D1 storage | 5 GB | $0.75 per GB |
| KV reads | 10 million | $0.50 per million |
| KV writes | 1 million | $5.00 per million |
| Queues operations | 1 million | $0.40 per million |
| Durable Object requests | 1 million | $0.15 per million |
| R2 storage | 10 GB | $0.015 per GB |
| Email Sending | 3,000 emails | $0.35 per 1,000 |

Email is the only allowance a busy theatre is likely to pass. A month with 10,000 emails costs about $2.45 extra.

## Limits that shape the design

| Limit | Value | Consequence |
| --- | --- | --- |
| Bound parameters per query | 100 | Chunk at 90; never bind one parameter per row |
| Database size | 10 GB | Ample for one theatre; files go to R2, never the database |
| Queries per request | 1,000 | A batch counts as one; long jobs go to a queue |
| Query duration | 30 seconds | Reports are built in the background |
| Statement length | 100 KB | Bulk imports are chunked |
| Memory per isolate | 128 MB | Exports and PDFs are streamed |
| CPU per request | 30 seconds by default, up to 5 minutes | Heavy work goes to a queue |
| Cron triggers per account | 250 | One or two triggers that fan out to tasks, as Mailflare does |
| KV writes | 1 million a month | KV is for caches and sessions, not for counters |

## Still to check

- Durable Object duration charges for screens that stay connected all evening.
- Whether a deploy button can also provide a Durable Object and dead-letter queues in one step. (Checked on 16 November 2026: it creates the database, file store, cache and queue with nothing typed.)
- Limits on Cloudflare Images and Turnstile, which were not read.

## Sources

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)

**Checked on 16 November 2026, from Cloudflare's documentation.** Email Sending is for transactional email only; its FAQ says it may not be used for marketing email, which is why mailings are not in the first release. It reports each message's outcome (delivered, deferred, bounced, failed, rejected, complained) as events on a queue, and suppresses hard bounces and complaints itself. One message takes at most 50 recipients. The daily quota starts low and grows with reputation, with no published figure, and the product is in beta. Still to prove on a real sending domain: that those events reach a Worker carrying the message id.
