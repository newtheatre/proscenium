import { formatLondon } from '#shared/utils/london'

// Every message carries both parts (H-109 criterion 3), and any date in one is London-pinned,
// because the worker runs in UTC (0014).

export interface Rendered {
  subject: string
  html: string
  text: string
}

export interface TemplateContext {
  name: string
  [key: string]: unknown
}

function layout(body: string): string {
  return `<!doctype html><html lang="en-GB"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a">
${body}
<hr>
<p style="font-size:0.875rem;color:#555">The Nottingham New Theatre</p>
</body></html>`
}

function expiry(at: Date): string {
  return formatLondon(at, { dateStyle: 'full', timeStyle: 'short' })
}

const TEMPLATES = {
  'account-verify': (context: TemplateContext): Rendered => {
    const url = String(context.url)
    const until = expiry(context.expiresAt as Date)
    return {
      subject: 'Confirm your email address',
      html: layout(`<p>Hello ${context.name},</p>
<p>Confirm this address to finish setting up your account.</p>
<p><a href="${url}">Confirm my email address</a></p>
<p>The link works until ${until}. If you did not ask for this, ignore it and nothing happens.</p>`),
      text: `Hello ${context.name},

Confirm this address to finish setting up your account:

${url}

The link works until ${until}. If you did not ask for this, ignore it and nothing happens.

The Nottingham New Theatre`,
    }
  },

  'account-exists': (context: TemplateContext): Rendered => ({
    subject: 'You already have an account',
    html: layout(`<p>Hello ${context.name},</p>
<p>Someone tried to register with this address, and it already has an account. If that was you,
sign in as usual. If it was not, nothing has changed and there is nothing to do.</p>
<p><a href="${String(context.signInUrl)}">Sign in</a></p>`),
    text: `Hello ${context.name},

Someone tried to register with this address, and it already has an account. If that was you,
sign in as usual: ${String(context.signInUrl)}

If it was not, nothing has changed and there is nothing to do.

The Nottingham New Theatre`,
  }),
  // The old estate's reset emails always said one hour, whatever the token actually lasted.
  // This states the figure the token carries (A-108 criterion 2).
  'password-reset': (context: TemplateContext): Rendered => {
    const url = String(context.url)
    const until = expiry(context.expiresAt as Date)
    return {
      subject: 'Reset your password',
      html: layout(`<p>Hello ${context.name},</p>
<p>Someone asked to reset the password on this account. If it was you, follow the link.</p>
<p><a href="${url}">Set a new password</a></p>
<p>The link works until ${until}. If it was not you, ignore this: nothing has changed and your
password still works.</p>`),
      text: `Hello ${context.name},

Someone asked to reset the password on this account. If it was you, follow the link:

${url}

The link works until ${until}. If it was not you, ignore this: nothing has changed and your
password still works.

The Nottingham New Theatre`,
    }
  },

  'magic-link': (context: TemplateContext): Rendered => {
    const url = String(context.url)
    const until = expiry(context.expiresAt as Date)
    return {
      subject: 'Your sign-in link',
      html: layout(`<p>Hello ${context.name},</p>
<p>Follow this link to sign in. It works once.</p>
<p><a href="${url}">Sign in</a></p>
<p>The link works until ${until}. If you did not ask for it, ignore it: it signs nobody in but
whoever opens it from this mailbox.</p>`),
      text: `Hello ${context.name},

Follow this link to sign in. It works once:

${url}

The link works until ${until}. If you did not ask for it, ignore it.

The Nottingham New Theatre`,
    }
  },
} as const

export type TemplateName = keyof typeof TEMPLATES

// A template rendered against a payload missing a required field fails here rather than
// sending a message with a blank in it (H-109 criterion 5).
export function render(name: string, context: TemplateContext): Rendered {
  const template = TEMPLATES[name as TemplateName]
  if (!template) throw new Error(`no template \`${name}\``)

  const rendered = template(context)
  for (const [part, value] of Object.entries(rendered)) {
    if (value.includes('undefined') || value.includes('[object Object]')) {
      throw new Error(`template \`${name}\` rendered ${part} with a missing field`)
    }
  }
  return rendered
}
