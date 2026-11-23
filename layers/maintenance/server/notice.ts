// The holding page maintenance mode shows the public: drawn here, on the server, with no app behind
// it, so nothing on it can fail while the rest of the site is closed. It wears the theatre's name,
// logo and colours, and gives the box office's contact details from the organisation's settings.
import { useSetting, wordsFrom } from '#kit'
import { getBrand } from '#modules/core'
import catalogue from '../i18n/en-GB.json'

const words = wordsFrom(catalogue)

const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]!)

/** Paragraphs from text a person typed: a blank line starts a new one, a single line break stays. */
function paragraphs(text: string): string {
  return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`).join('\n    ')
}

// The page's look, around the theatre's colours, radius and display font set on :root.
const STYLE = [
  '* { box-sizing: border-box; }', // not-policy: the page's look
  'body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 2rem 1rem; background: var(--bg); color: var(--ink); font: 1.0625rem/1.6 var(--body); }', // not-policy: the page's look
  'main { width: 100%; max-width: 34rem; }', // not-policy: the page's look
  '.logo { display: block; max-height: 4rem; width: auto; margin: 0 0 1.5rem; }', // not-policy: the page's look
  '.kicker { margin: 0 0 .75rem; font-size: .8125rem; letter-spacing: .12em; text-transform: uppercase; color: var(--soft); }', // not-policy: the page's look
  'h1 { margin: 0 0 1rem; font-family: var(--display); font-size: clamp(1.75rem, 6vw, 2.5rem); line-height: 1.15; text-wrap: balance; }', // not-policy: the page's look
  'h2 { margin: 0 0 .5rem; font-size: 1rem; }', // not-policy: the page's look
  'p { margin: 0 0 1rem; }', // not-policy: the page's look
  'ul { margin: 0 0 1rem; padding: 0; list-style: none; }', // not-policy: the page's look
  '.box { margin-top: 1.5rem; padding: 1.25rem 1.25rem .25rem; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); }', // not-policy: the page's look
  'a { color: var(--link); font-weight: 600; overflow-wrap: anywhere; }', // not-policy: the page's look
  '.soft { color: var(--soft); }', // not-policy: the page's look
  '.thanks { margin-top: 1.5rem; }', // not-policy: the page's look
].join('\n  ')

export interface Notice {
  name: string | null
  heading: string
  message: string
  backBy: string | null
  email: string | null
  phone: string | null
}

/** What the holding page says now, from the settings. */
export async function currentNotice(): Promise<Notice> {
  return {
    name: await useSetting('core.site.name') as string | null,
    heading: (await useSetting('maintenance.notice.heading') as string | null) ?? words('maintenance.notice.heading'),
    message: (await useSetting('maintenance.notice.message') as string | null) ?? words('maintenance.notice.message'),
    backBy: await useSetting('maintenance.notice.back-by') as string | null,
    email: await useSetting('core.organisation.contact-email') as string | null,
    phone: await useSetting('core.organisation.contact-phone') as string | null,
  }
}

/** How long to ask machines to wait before trying again, in seconds. */
export async function retryAfter(): Promise<number> {
  return await useSetting('maintenance.search.retry-after') as number
}

/** The holding page as a whole document. `setup`: the site has no Owner yet, so point the installer to setup. */
export async function noticePage(options: { setup?: boolean } = {}): Promise<string> {
  const notice = await currentNotice()
  const brand = await getBrand()
  const light = brand.tokens.light
  const dark = brand.tokens.dark
  const name = notice.name ?? words('maintenance.notice.default-name')
  const logo = brand.logo
    ? `<img class="logo" src="${escape(brand.logo.url)}" alt="${escape(brand.logo.alt || name)}"${brand.logo.width ? ` width="${brand.logo.width}"` : ''}${brand.logo.height ? ` height="${brand.logo.height}"` : ''}>`
    : `<p class="kicker">${escape(name)}</p>`
  const contact: string[] = []
  if (notice.email) contact.push(`<li>${escape(words('maintenance.notice.email'))} <a href="mailto:${escape(notice.email)}">${escape(notice.email)}</a></li>`)
  if (notice.phone) contact.push(`<li>${escape(words('maintenance.notice.phone'))} <a href="tel:${escape(notice.phone.replace(/[^\d+]/g, ''))}">${escape(notice.phone)}</a></li>`)
  const mode = (t: typeof light) => `--bg:${t.background};--surface:${t.surface};--line:${t.border};--ink:${t.text};--soft:${t.muted};--link:${t.link}`
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escape(words('maintenance.notice.title'))} · ${escape(name)}</title>
<style>
  ${brand.tokens.fontFaces}
  :root { color-scheme: light dark; ${mode(light)}; --radius: ${brand.tokens.radius}; --display: ${brand.tokens.displayFont}; --body: ${brand.tokens.bodyFont ?? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'}; }
  @media (prefers-color-scheme: dark) { :root { ${mode(dark)}; } }
  ${STYLE}
</style>
</head>
<body>
<main>
  ${logo}
  <h1>${escape(notice.heading)}</h1>
  ${paragraphs(notice.message)}
  ${notice.backBy ? `<p>${escape(words('maintenance.notice.back-by', { when: notice.backBy }))}</p>` : ''}
  <p><strong>${escape(words('maintenance.notice.booked-heading'))}</strong> ${escape(words('maintenance.notice.booked'))}</p>
  <section class="box">
    <h2>${escape(words('maintenance.notice.contact-heading'))}</h2>
    <p>${escape(words(contact.length ? 'maintenance.notice.contact' : 'maintenance.notice.contact-no-details'))}</p>
    ${contact.length ? `<ul>${contact.join('')}</ul>` : ''}
  </section>
  ${options.setup ? `<p class="soft thanks">${escape(words('maintenance.notice.setup'))} <a href="/setup">${escape(words('maintenance.notice.setup-action'))}</a></p>` : ''}
  <p class="soft thanks">${escape(words('maintenance.notice.thanks'))}</p>
</main>
</body>
</html>`
}
