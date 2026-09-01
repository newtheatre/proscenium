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

  // Nobody asked for this one, so it says who made it and why before it asks for anything.
  'set-password': (context: TemplateContext): Rendered => {
    const url = String(context.url)
    const until = expiry(context.expiresAt as Date)
    return {
      subject: 'An account has been made for you at the New Theatre',
      html: layout(`<p>Hello ${context.name},</p>
<p>The theatre has made you an account. Choose a password and it is ready to use.</p>
<p><a href="${url}">Choose my password</a></p>
<p>The link works until ${until}. If you were not expecting this, tell the IT Manager rather than
ignoring it.</p>`),
      text: `Hello ${context.name},

The theatre has made you an account. Choose a password and it is ready to use:

${url}

The link works until ${until}. If you were not expecting this, tell the IT Manager rather than
ignoring it.

The Nottingham New Theatre`,
    }
  },

  // Names what went, never what remains: a message read by the wrong person must not inventory
  // the ways into the account.
  'method-removed': (context: TemplateContext): Rendered => {
    const method = String(context.method)
    const url = String(context.securityUrl)
    return {
      subject: 'A sign-in method was removed from your account',
      html: layout(`<p>Hello ${context.name},</p>
<p>The ${method} sign-in was just removed from your New Theatre account.</p>
<p>If that was you, there is nothing to do. If it was not, sign in and check your security
settings now.</p>
<p><a href="${url}">My security settings</a></p>`),
      text: `Hello ${context.name},

The ${method} sign-in was just removed from your New Theatre account.

If that was you, there is nothing to do. If it was not, sign in and check your security settings
now:

${url}

The Nottingham New Theatre`,
    }
  },

  'room-booked': (context: TemplateContext): Rendered => {
    const room = String(context.room)
    const when = String(context.when)
    return {
      subject: `${room} is yours, ${when}`,
      html: layout(`<p>Hello ${context.name},</p>
<p>${room} is booked for you, ${when}.</p>
<p>${context.title}</p>
<p><a href="${String(context.roomsUrl)}">See your bookings</a>, where you can cancel it if your
plans change.</p>`),
      text: `Hello ${context.name},

${room} is booked for you, ${when}.

${String(context.title)}

See your bookings, or cancel it if your plans change:

${String(context.roomsUrl)}

The Nottingham New Theatre`,
    }
  },

  'room-cancelled': (context: TemplateContext): Rendered => {
    const room = String(context.room)
    const when = String(context.when)
    return {
      subject: `Cancelled: ${room}, ${when}`,
      html: layout(`<p>Hello ${context.name},</p>
<p>Your booking of ${room}, ${when}, is cancelled and the slot is free for somebody else.</p>
<p>${context.title}</p>
<p>If that was not you, <a href="${String(context.roomsUrl)}">check your bookings</a>.</p>`),
      text: `Hello ${context.name},

Your booking of ${room}, ${when}, is cancelled and the slot is free for somebody else.

${String(context.title)}

If that was not you, check your bookings:

${String(context.roomsUrl)}

The Nottingham New Theatre`,
    }
  },

  'room-requested': (context: TemplateContext): Rendered => ({
    subject: `Asked for: ${String(context.room)}, ${String(context.when)}`,
    html: layout(`<p>Hello ${context.name},</p>
<p>Your request for ${context.room}, ${context.when}, is with the Theatre Manager. The slot is held
while somebody decides, so nobody else can take it in the meantime.</p>
<p>${context.title}</p>
<p><a href="${String(context.roomsUrl)}">See your bookings</a></p>`),
    text: `Hello ${context.name},

Your request for ${String(context.room)}, ${String(context.when)}, is with the Theatre Manager. The
slot is held while somebody decides, so nobody else can take it in the meantime.

${String(context.title)}

${String(context.roomsUrl)}

The Nottingham New Theatre`,
  }),

  'room-request-raised': (context: TemplateContext): Rendered => ({
    subject: `A room has been asked for: ${String(context.room)}`,
    html: layout(`<p>Hello ${context.name},</p>
<p>${context.who} has asked for ${context.room}, ${context.when}.</p>
<p>${context.title}</p>
<p>The slot is held until somebody answers. <a href="${String(context.queueUrl)}">Open the queue</a></p>`),
    text: `Hello ${context.name},

${String(context.who)} has asked for ${String(context.room)}, ${String(context.when)}.

${String(context.title)}

The slot is held until somebody answers. Open the queue:
${String(context.queueUrl)}

The Nottingham New Theatre`,
  }),

  'room-request-waiting': (context: TemplateContext): Rendered => ({
    subject: `A room request is waiting: ${String(context.room)}`,
    html: layout(`<p>Hello ${context.name},</p>
<p>A request for ${context.room}, ${context.when}, has been waiting for a decision.</p>
<p>${context.title}</p>
<p>The slot is held until somebody answers, so nobody else can book it while it waits.</p>`),
    text: `Hello ${context.name},

A request for ${String(context.room)}, ${String(context.when)}, has been waiting for a decision.

${String(context.title)}

The slot is held until somebody answers, so nobody else can book it while it waits.

The Nottingham New Theatre`,
  }),

  'room-request-expired': (context: TemplateContext): Rendered => ({
    subject: `Lapsed: ${String(context.room)}, ${String(context.when)}`,
    html: layout(`<p>Hello ${context.name},</p>
<p>Your request for ${context.room}, ${context.when}, lapsed because nobody answered it in time.
The slot is free again, so it can be asked for or booked afresh.</p>
<p>${context.title}</p>`),
    text: `Hello ${context.name},

Your request for ${String(context.room)}, ${String(context.when)}, lapsed because nobody answered
it in time. The slot is free again, so it can be asked for or booked afresh.

${String(context.title)}

The Nottingham New Theatre`,
  }),

  // One decision or five, the same shape: a list, so a batch never becomes a run of emails.
  'room-approved': (context: TemplateContext): Rendered => {
    const bookings = context.bookings as { room: string, title: string, when: string }[]
    const moved = context.moved ? `They are in ${String(context.moved)}, which is not the room asked for.` : ''
    return {
      subject: bookings.length === 1
        ? `Approved: ${bookings[0]!.room}, ${bookings[0]!.when}`
        : `Approved: ${bookings.length} room requests`,
      html: layout(`<p>Hello ${context.name},</p>
<p>${bookings.length === 1 ? 'Your request has been approved.' : 'Your requests have been approved.'} ${moved}</p>
<ul>${bookings.map(booking => `<li>${booking.room}, ${booking.when}: ${booking.title}</li>`).join('')}</ul>
<p><a href="${String(context.roomsUrl)}">See what you hold</a></p>`),
      text: `Hello ${context.name},

${bookings.length === 1 ? 'Your request has been approved.' : 'Your requests have been approved.'} ${moved}

${bookings.map(booking => `- ${booking.room}, ${booking.when}: ${booking.title}`).join('\n')}

See what you hold: ${String(context.roomsUrl)}

The Nottingham New Theatre`,
    }
  },

  // The reason is shown word for word, because it is what the requester was told (criterion 2).
  'room-rejected': (context: TemplateContext): Rendered => {
    const bookings = context.bookings as { room: string, title: string, when: string }[]
    const reason = String(context.reason ?? '')
    return {
      subject: bookings.length === 1
        ? `Not approved: ${bookings[0]!.room}, ${bookings[0]!.when}`
        : `Not approved: ${bookings.length} room requests`,
      html: layout(`<p>Hello ${context.name},</p>
<p>${bookings.length === 1 ? 'Your request was not approved.' : 'Your requests were not approved.'}</p>
<ul>${bookings.map(booking => `<li>${booking.room}, ${booking.when}: ${booking.title}</li>`).join('')}</ul>
<p>Why: ${reason}</p>
<p>The slot is free again. <a href="${String(context.roomsUrl)}">See what you hold</a></p>`),
      text: `Hello ${context.name},

${bookings.length === 1 ? 'Your request was not approved.' : 'Your requests were not approved.'}

${bookings.map(booking => `- ${booking.room}, ${booking.when}: ${booking.title}`).join('\n')}

Why: ${reason}

The slot is free again. See what you hold: ${String(context.roomsUrl)}

The Nottingham New Theatre`,
    }
  },

  'room-reminder': (context: TemplateContext): Rendered => {
    const bookings = context.bookings as { room: string, title: string, when: string }[]
    const one = bookings.length === 1
    return {
      subject: one
        ? `Tomorrow: ${bookings[0]!.room}, ${bookings[0]!.when}`
        : `Tomorrow: ${bookings.length} rooms booked`,
      html: layout(`<p>Hello ${context.name},</p>
<p>${one ? 'You have a room booked tomorrow.' : 'You have rooms booked tomorrow.'}</p>
<ul>${bookings.map(booking => `<li>${booking.room}, ${booking.when}: ${booking.title}</li>`).join('')}</ul>
<p>If you no longer need ${one ? 'it' : 'them'}, <a href="${String(context.roomsUrl)}">cancel</a> so
somebody else can have the slot.</p>`),
      text: `Hello ${context.name},

${one ? 'You have a room booked tomorrow.' : 'You have rooms booked tomorrow.'}

${bookings.map(booking => `- ${booking.room}, ${booking.when}: ${booking.title}`).join('\n')}

If you no longer need ${one ? 'it' : 'them'}, cancel so somebody else can have the slot:
${String(context.roomsUrl)}

The Nottingham New Theatre`,
    }
  },

  'room-series-booked': (context: TemplateContext): Rendered => ({
    subject: `Booked: ${String(context.count)} rehearsals in ${String(context.room)}`,
    html: layout(`<p>Hello ${context.name},</p>
<p>${context.count} bookings in ${context.room} are confirmed, from ${context.first} to
${context.last}.</p>
<p>${context.title}</p>
<p><a href="${String(context.roomsUrl)}">See what you hold</a>. Cancelling asks whether you mean
one week or the whole run.</p>`),
    text: `Hello ${context.name},

${String(context.count)} bookings in ${String(context.room)} are confirmed, from
${String(context.first)} to ${String(context.last)}.

${String(context.title)}

See what you hold: ${String(context.roomsUrl)}
Cancelling asks whether you mean one week or the whole run.

The Nottingham New Theatre`,
  }),

  'room-series-requested': (context: TemplateContext): Rendered => ({
    subject: `Asked for: ${String(context.count)} rehearsals in ${String(context.room)}`,
    html: layout(`<p>Hello ${context.name},</p>
<p>Your request for ${context.count} bookings in ${context.room}, from ${context.first} to
${context.last}, is waiting for a decision.</p>
<p>${context.title}</p>
<p>The slots are held while somebody decides, so nobody else can book them meanwhile.</p>`),
    text: `Hello ${context.name},

Your request for ${String(context.count)} bookings in ${String(context.room)}, from
${String(context.first)} to ${String(context.last)}, is waiting for a decision.

${String(context.title)}

The slots are held while somebody decides, so nobody else can book them meanwhile.

The Nottingham New Theatre`,
  }),

  // Names the occurrences rather than the count, because which weeks went is the question a
  // member will have (C-111 criterion 5).
  'room-series-cancelled': (context: TemplateContext): Rendered => {
    const days = context.days as string[]
    return {
      subject: `Cancelled: ${days.length} bookings in ${String(context.room)}`,
      html: layout(`<p>Hello ${context.name},</p>
<p>These bookings in ${context.room} are cancelled, and the slots are free again.</p>
<ul>${days.map(day => `<li>${day}</li>`).join('')}</ul>`),
      text: `Hello ${context.name},

These bookings in ${String(context.room)} are cancelled, and the slots are free again.

${days.map(day => `- ${day}`).join('\n')}

The Nottingham New Theatre`,
    }
  },

  'room-blackout-cancelled': (context: TemplateContext): Rendered => {
    const bookings = context.bookings as { room: string, title: string, when: string }[]
    const one = bookings.length === 1
    return {
      subject: one
        ? `Cancelled: ${bookings[0]!.room}, ${bookings[0]!.when}`
        : `Cancelled: ${bookings.length} bookings`,
      html: layout(`<p>Hello ${context.name},</p>
<p>${one ? 'A room you booked has' : 'Rooms you booked have'} been closed: ${context.reason}.</p>
<p>${one ? 'This booking is' : 'These bookings are'} cancelled. Nothing is rebooked automatically,
so please book again if you still need the space.</p>
<ul>${bookings.map(booking => `<li>${booking.room}, ${booking.when}: ${booking.title}</li>`).join('')}</ul>
<p><a href="${String(context.roomsUrl)}">Find another slot</a></p>`),
      text: `Hello ${context.name},

${one ? 'A room you booked has' : 'Rooms you booked have'} been closed: ${String(context.reason)}.

${one ? 'This booking is' : 'These bookings are'} cancelled. Nothing is rebooked automatically, so
please book again if you still need the space.

${bookings.map(booking => `- ${booking.room}, ${booking.when}: ${booking.title}`).join('\n')}

Find another slot: ${String(context.roomsUrl)}

The Nottingham New Theatre`,
    }
  },

  'room-bumped': (context: TemplateContext): Rendered => {
    const offered = context.offered ? String(context.offered) : null
    return {
      subject: `Moved: ${String(context.room)}, ${String(context.when)}`,
      html: layout(`<p>Hello ${context.name},</p>
<p>Your booking of ${context.room}, ${context.when}, has been given to something with a higher
claim on the room: ${context.reason}.</p>
<p>${context.title}</p>
${offered
  ? `<p>You have been booked into <strong>${offered}</strong> instead, and that slot is held for
you. If it does not suit, cancel it and book something else.</p>`
  : `<p>Nothing equivalent was free nearby, so nothing has been booked in its place. Please find
another slot.</p>`}
<p><a href="${String(context.roomsUrl)}">See what you hold</a></p>`),
      text: `Hello ${context.name},

Your booking of ${String(context.room)}, ${String(context.when)}, has been given to something with
a higher claim on the room: ${String(context.reason)}.

${String(context.title)}

${offered
  ? `You have been booked into ${offered} instead, and that slot is held for you. If it does not suit, cancel it and book something else.`
  : 'Nothing equivalent was free nearby, so nothing has been booked in its place. Please find another slot.'}

See what you hold: ${String(context.roomsUrl)}

The Nottingham New Theatre`,
    }
  },

  'room-no-show': (context: TemplateContext): Rendered => {
    const stopped = context.underPreApproval === true
    return {
      subject: stopped ? 'Your bookings now need approving first' : 'A booking you did not use',
      html: layout(`<p>Hello ${context.name},</p>
<p>${context.room}, ${context.title}, was booked and not used. That is ${context.count} now.</p>
${stopped
  ? `<p>From now on every room you book is checked by a person before it is held. That lifts once
your record is back below ${context.preApprovalAt}.</p>`
  : `<p>At ${context.preApprovalAt}, every booking you make is checked by a person first. If you
cannot use a room, cancelling frees it for somebody else and costs you nothing.</p>`}
<p><a href="${String(context.roomsUrl)}">See your bookings</a></p>`),
      text: `Hello ${context.name},

${String(context.room)}, ${String(context.title)}, was booked and not used. That is
${String(context.count)} now.

${stopped
  ? `From now on every room you book is checked by a person before it is held. That lifts once your record is back below ${String(context.preApprovalAt)}.`
  : `At ${String(context.preApprovalAt)}, every booking you make is checked by a person first. If you cannot use a room, cancelling frees it for somebody else and costs you nothing.`}

See your bookings: ${String(context.roomsUrl)}

The Nottingham New Theatre`,
    }
  },

  'external-received': (context: TemplateContext): Rendered => ({
    subject: `Asked for: a union room, ${String(context.when)}`,
    html: layout(`<p>Hello ${context.name},</p>
<p>Your request for a room through the Students' Union, ${context.when}, is with the Theatre
Manager, who fills in the union's form.</p>
<p>${context.title}</p>
<p>The union decides which room we get, so nothing is held yet. You will hear when the form is in,
and again when they answer.</p>`),
    text: `Hello ${context.name},

Your request for a room through the Students' Union, ${String(context.when)}, is with the Theatre
Manager, who fills in the union's form.

${String(context.title)}

The union decides which room we get, so nothing is held yet. You will hear when the form is in, and
again when they answer.

The Nottingham New Theatre`,
  }),

  'external-raised': (context: TemplateContext): Rendered => ({
    subject: `A union room has been asked for: ${String(context.when)}`,
    html: layout(`<p>Hello ${context.name},</p>
<p>${context.who} has asked for a union room, ${context.when}.</p>
<p>${context.title}</p>
<p><a href="${String(context.queueUrl)}">Fill in the form</a></p>`),
    text: `Hello ${context.name},

${String(context.who)} has asked for a union room, ${String(context.when)}.

${String(context.title)}

Fill in the form: ${String(context.queueUrl)}

The Nottingham New Theatre`,
  }),

  'external-submitted': (context: TemplateContext): Rendered => ({
    subject: `With the union: ${String(context.when)}`,
    html: layout(`<p>Hello ${context.name},</p>
<p>The form for ${context.title}, ${context.when}, is in with the union. They decide which room we
get, so this may not be the room you asked for.</p>
<p><a href="${String(context.roomsUrl)}">See what you have asked for</a></p>`),
    text: `Hello ${context.name},

The form for ${String(context.title)}, ${String(context.when)}, is in with the union. They decide
which room we get, so this may not be the room you asked for.

See what you have asked for: ${String(context.roomsUrl)}

The Nottingham New Theatre`,
  }),

  'external-assigned': (context: TemplateContext): Rendered => ({
    subject: `You have ${String(context.room)}, ${String(context.when)}`,
    html: layout(`<p>Hello ${context.name},</p>
<p>The union has given us <strong>${context.room}</strong> (${context.where}) for ${context.title},
${context.when}.</p>
<p><a href="${String(context.roomsUrl)}">See what you hold</a></p>`),
    text: `Hello ${context.name},

The union has given us ${String(context.room)} (${String(context.where)}) for
${String(context.title)}, ${String(context.when)}.

See what you hold: ${String(context.roomsUrl)}

The Nottingham New Theatre`,
  }),

  'external-reassigning': (context: TemplateContext): Rendered => ({
    subject: `Asking the union again: ${String(context.when)}`,
    html: layout(`<p>Hello ${context.name},</p>
<p>The union offered us ${context.room} for ${context.title}, ${context.when}, and it is not
suitable for what you need it for. We have gone back to them, which adds a few days.</p>
<p><a href="${String(context.roomsUrl)}">See what you have asked for</a></p>`),
    text: `Hello ${context.name},

The union offered us ${String(context.room)} for ${String(context.title)},
${String(context.when)}, and it is not suitable for what you need it for. We have gone back to
them, which adds a few days.

See what you have asked for: ${String(context.roomsUrl)}

The Nottingham New Theatre`,
  }),

  'external-rejected': (context: TemplateContext): Rendered => ({
    subject: `Not going to the union: ${String(context.when)}`,
    html: layout(`<p>Hello ${context.name},</p>
<p>Your request for a union room for ${context.title}, ${context.when}, is not being sent.</p>
<p>Why: ${context.reason}</p>
<p><a href="${String(context.roomsUrl)}">Find another slot</a></p>`),
    text: `Hello ${context.name},

Your request for a union room for ${String(context.title)}, ${String(context.when)}, is not being
sent.

Why: ${String(context.reason)}

Find another slot: ${String(context.roomsUrl)}

The Nottingham New Theatre`,
  }),

  // The union's side is a person and a form, so withdrawing ours does not withdraw theirs.
  'external-withdrawn': (context: TemplateContext): Rendered => ({
    subject: `Withdrawn: ${String(context.who)}, ${String(context.when)}`,
    html: layout(`<p>Hello ${context.name},</p>
<p>${context.who} has withdrawn their request for ${context.title}, ${context.when}.</p>
<p>The union still has our booking for ${context.room} (reference: ${context.reference}), so it
needs cancelling with them by hand.</p>`),
    text: `Hello ${context.name},

${String(context.who)} has withdrawn their request for ${String(context.title)},
${String(context.when)}.

The union still has our booking for ${String(context.room)} (reference:
${String(context.reference)}), so it needs cancelling with them by hand.

The Nottingham New Theatre`,
  }),

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
  'membership-expiring': (context: TemplateContext): Rendered => {
    const on = String(context.expiresOn)
    return {
      subject: 'Your membership is running out',
      html: layout(`<p>Hello ${context.name},</p>
<p>Your Nottingham New Theatre membership runs out on ${on}.</p>
<p>Membership is bought at the Students' Union, not from us, so renew it there and we will pick
the change up from their record.</p>
<p>Nothing is lost if you let it lapse: your account, your bookings and your history all stay.</p>`),
      text: `Hello ${context.name},

Your Nottingham New Theatre membership runs out on ${on}.

Membership is bought at the Students' Union, not from us, so renew it there and we will pick the
change up from their record.

Nothing is lost if you let it lapse: your account, your bookings and your history all stay.

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
