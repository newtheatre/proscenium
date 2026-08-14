/**
 * Email sending utilities using Resend.
 *
 * The API key is read from `runtimeConfig.resendApiKey` (env
 * `NUXT_RESEND_API_KEY`), falling back to the bare `RESEND_API_KEY` env var.
 * The sender address comes from `runtimeConfig.resendFromEmail` (env
 * `NUXT_RESEND_FROM_EMAIL`). When no key is configured, sends become no-ops
 * with a logged warning rather than errors.
 */

import { getResend } from './resend'

interface SendEmailOptions {
  to: string
  subject: string
  html: string
}

/**
 * Send an email via Resend.
 *
 * @example
 * ```ts
 * await sendEmail({
 *   to: 'user@example.com',
 *   subject: 'Welcome',
 *   html: '<p>Hello!</p>',
 * })
 * ```
 */
export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<void> {
  const resend = getResend()
  if (!resend) {
    console.warn(`[Email] Skipping send (no Resend key configured): "${subject}" to ${to}`)
    return
  }

  const resendFromEmail = useRuntimeConfig().resendFromEmail
  const { error } = await resend.emails.send({
    from: resendFromEmail || 'no-reply@tickets.newtheatre.org.uk',
    to,
    subject,
    html,
  })

  if (error) {
    console.error('[Email] Failed to send email:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to send email',
    })
  }
}

// ── Booking Emails ──────────────────────────────────────────────────────────

interface BookingTicket {
  pricePaid: number
  ticketType: { name: string }
}

interface BookingEmailData {
  /** Needed to mint the access token; the reference alone no longer grants access. */
  bookingId: string
  bookingRef: string
  customerName: string
  customerEmail: string
  showTitle: string
  venueName: string
  performanceDate: Date
  tickets: BookingTicket[]
  customerNotes?: string | null
  showSlug: string
}

/**
 * Escape a value for interpolation into an email's HTML body.
 *
 * `customerName` and `customerNotes` come from the unauthenticated booking
 * endpoint, where the caller also chooses the recipient — unescaped, that puts
 * attacker markup inside a DKIM-signed message from the theatre's domain.
 * Staff-entered values are escaped too; a rule with exceptions gets misapplied.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escape, then keep the customer's line breaks visible in the HTML body. */
function escapeMultiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>')
}

/*
 * The Worker's system timezone is UTC, so every formatter of a performance
 * time must pin Europe/London explicitly or a 19:30 BST curtain-up renders as
 * 18:30 for eight months of the year.
 */
const THEATRE_TIME_ZONE = 'Europe/London'

function formatEmailDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    timeZone: THEATRE_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatEmailTime(date: Date): string {
  return date.toLocaleTimeString('en-GB', {
    timeZone: THEATRE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatEmailPrice(pence: number): string {
  if (pence === 0) return 'Free'
  return `\u00A3${(pence / 100).toFixed(2)}`
}

function buildTicketTable(tickets: BookingTicket[]): string {
  // Group by name AND price paid so a type sold at more than one price shows one
  // row per price and the rows sum to the total.
  const grouped = new Map<string, { name: string, count: number, unitPrice: number }>()
  for (const ticket of tickets) {
    const key = `${ticket.ticketType.name}:${ticket.pricePaid}`
    const existing = grouped.get(key)
    if (existing) {
      existing.count++
    }
    else {
      grouped.set(key, { name: ticket.ticketType.name, count: 1, unitPrice: ticket.pricePaid })
    }
  }

  const rows = Array.from(grouped.values())
    .map(t => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5;">${t.count}&times; ${escapeHtml(t.name)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatEmailPrice(t.unitPrice * t.count)}</td>
      </tr>
    `)
    .join('')

  const total = tickets.reduce((sum, t) => sum + t.pricePaid, 0)

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 16px 0;">
      <thead>
        <tr style="background-color: #f5f5f5;">
          <th style="padding: 8px 12px; text-align: left; font-weight: 600;">Tickets</th>
          <th style="padding: 8px 12px; text-align: right; font-weight: 600;">Price</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td style="padding: 10px 12px; font-weight: 700;">Total</td>
          <td style="padding: 10px 12px; text-align: right; font-weight: 700; font-size: 16px;">${formatEmailPrice(total)}</td>
        </tr>
      </tfoot>
    </table>
  `
}

/**
 * Send a booking confirmation email.
 *
 * Sent immediately after a new reservation is created. Contains the booking
 * reference, show / performance details, ticket breakdown, and a link to
 * view the booking online.
 */
export async function sendBookingConfirmationEmail(data: BookingEmailData): Promise<void> {
  const { public: { baseURL } } = useRuntimeConfig()
  // A signed, expiring token rather than the booking reference. The reference is
  // printed below for the customer to quote at the box office, which is exactly
  // why it cannot also be the thing that unlocks the booking.
  const token = await signBookingToken(data.bookingId, bookingTokenExpiry(data.performanceDate))
  const bookingUrl = `${baseURL}/whats-on/${data.showSlug}/booking/${data.bookingRef}?t=${encodeURIComponent(token)}`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb; color: #1a1a1a;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">

    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="margin: 0 0 8px; font-size: 24px; color: #7c3aed;">Nottingham New Theatre</h1>
      <p style="margin: 0; color: #737373; font-size: 14px;">Booking Confirmation</p>
    </div>

    <!-- Main card -->
    <div style="background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e5e5e5;">

      <!-- Greeting -->
      <p style="margin: 0 0 20px; font-size: 16px;">Hi ${escapeHtml(data.customerName)},</p>
      <p style="margin: 0 0 24px; font-size: 16px;">
        Thank you for your booking! Your reservation has been confirmed. Here are the details:
      </p>

      <!-- Booking reference -->
      <div style="text-align: center; background-color: #faf5ff; border: 2px dashed #7c3aed; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <p style="margin: 0 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #737373;">Booking Reference</p>
        <p style="margin: 0; font-size: 32px; font-weight: 700; font-family: monospace; letter-spacing: 4px; color: #7c3aed;">${data.bookingRef}</p>
      </div>

      <!-- Show details -->
      <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <h2 style="margin: 0 0 12px; font-size: 18px;">${escapeHtml(data.showTitle)}</h2>
        <table cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <td style="padding: 4px 8px 4px 0; color: #737373; font-size: 14px;">📅</td>
            <td style="padding: 4px 0; font-size: 14px;">${formatEmailDate(data.performanceDate)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 8px 4px 0; color: #737373; font-size: 14px;">🕐</td>
            <td style="padding: 4px 0; font-size: 14px;">${formatEmailTime(data.performanceDate)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 8px 4px 0; color: #737373; font-size: 14px;">📍</td>
            <td style="padding: 4px 0; font-size: 14px;">${escapeHtml(data.venueName)}</td>
          </tr>
        </table>
      </div>

      <!-- Tickets -->
      ${buildTicketTable(data.tickets)}

      ${data.customerNotes
        ? `<div style="background-color: #fffbeb; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
            <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; color: #92400e;">Special Requirements</p>
            <p style="margin: 0; font-size: 14px; color: #78716c;">${escapeMultiline(data.customerNotes)}</p>
          </div>`
        : ''}

      <!-- CTA -->
      <div style="text-align: center; margin-top: 24px;">
        <a href="${bookingUrl}" style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
          View Your Booking
        </a>
      </div>
    </div>

    <!-- Important info -->
    <div style="background: #ffffff; border-radius: 12px; padding: 24px; margin-top: 16px; border: 1px solid #e5e5e5;">
      <h3 style="margin: 0 0 12px; font-size: 16px;">🎟️ Collecting Your Tickets</h3>
      <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #525252; line-height: 1.8;">
        <li>Please arrive at the box office before the performance starts.</li>
        <li>Have your booking reference <strong>${data.bookingRef}</strong> ready to quote.</li>
        <li>Payment is collected when you pick up your tickets.</li>
      </ul>
      <p style="margin: 12px 0 0; font-size: 13px; color: #78716c;">
        Want to track your bookings across NNT sites?
        <a href="https://auth.newtheatre.org.uk/forgot-password" style="color: #7c3aed;">Set a password</a>
        for your NNT account — it already exists for this email address.
      </p>
    </div>

    <!-- Footer -->
    <div style="text-align: center; margin-top: 32px; font-size: 12px; color: #a3a3a3;">
      <p style="margin: 0 0 4px;">Nottingham New Theatre</p>
      <p style="margin: 0;">
        If you need to make changes to your booking, please contact the box office.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim()

  await sendEmail({
    to: data.customerEmail,
    subject: `Booking Confirmed — ${data.showTitle} (${data.bookingRef})`,
    html,
  })
}

/**
 * Send a booking cancellation email.
 *
 * Sent when a reservation is moved to CANCELLED status. Notifies the
 * customer that their booking has been cancelled and they no longer need
 * to attend.
 */
export async function sendBookingCancellationEmail(data: Omit<BookingEmailData, 'customerNotes'>): Promise<void> {
  const { public: { baseURL } } = useRuntimeConfig()
  const whatsOnUrl = `${baseURL}/whats-on`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb; color: #1a1a1a;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">

    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="margin: 0 0 8px; font-size: 24px; color: #7c3aed;">Nottingham New Theatre</h1>
      <p style="margin: 0; color: #737373; font-size: 14px;">Booking Cancellation</p>
    </div>

    <!-- Main card -->
    <div style="background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e5e5e5;">

      <p style="margin: 0 0 20px; font-size: 16px;">Hi ${escapeHtml(data.customerName)},</p>
      <p style="margin: 0 0 24px; font-size: 16px;">
        Your booking for <strong>${escapeHtml(data.showTitle)}</strong> has been cancelled.
      </p>

      <!-- Cancelled booking details -->
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <p style="margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #dc2626; font-weight: 600;">Cancelled</p>
        <p style="margin: 0 0 8px; font-size: 14px;"><strong>Reference:</strong> ${data.bookingRef}</p>
        <p style="margin: 0 0 4px; font-size: 14px;"><strong>Show:</strong> ${escapeHtml(data.showTitle)}</p>
        <p style="margin: 0 0 4px; font-size: 14px;"><strong>Date:</strong> ${formatEmailDate(data.performanceDate)} at ${formatEmailTime(data.performanceDate)}</p>
        <p style="margin: 0; font-size: 14px;"><strong>Venue:</strong> ${escapeHtml(data.venueName)}</p>
      </div>

      ${buildTicketTable(data.tickets)}

      <p style="margin: 0 0 24px; font-size: 14px; color: #525252;">
        If you did not request this cancellation or believe this is a mistake, please contact the box office.
      </p>

      <!-- CTA -->
      <div style="text-align: center;">
        <a href="${whatsOnUrl}" style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
          Browse What's On
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; margin-top: 32px; font-size: 12px; color: #a3a3a3;">
      <p style="margin: 0 0 4px;">Nottingham New Theatre</p>
      <p style="margin: 0;">
        Need help? Contact the box office and we'll be happy to assist.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim()

  await sendEmail({
    to: data.customerEmail,
    subject: `Booking Cancelled — ${data.showTitle} (${data.bookingRef})`,
    html,
  })
}

/**
 * Send a booking reminder email.
 *
 * Optional — could be triggered by a scheduled task (e.g. 24 hours before
 * the performance). Reminds the customer about their upcoming booking.
 */
export async function sendBookingReminderEmail(data: BookingEmailData): Promise<void> {
  const { public: { baseURL } } = useRuntimeConfig()
  // A signed, expiring token rather than the booking reference. The reference is
  // printed below for the customer to quote at the box office, which is exactly
  // why it cannot also be the thing that unlocks the booking.
  const token = await signBookingToken(data.bookingId, bookingTokenExpiry(data.performanceDate))
  const bookingUrl = `${baseURL}/whats-on/${data.showSlug}/booking/${data.bookingRef}?t=${encodeURIComponent(token)}`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb; color: #1a1a1a;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">

    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="margin: 0 0 8px; font-size: 24px; color: #7c3aed;">Nottingham New Theatre</h1>
      <p style="margin: 0; color: #737373; font-size: 14px;">Booking Reminder</p>
    </div>

    <!-- Main card -->
    <div style="background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e5e5e5;">

      <p style="margin: 0 0 20px; font-size: 16px;">Hi ${escapeHtml(data.customerName)},</p>
      <p style="margin: 0 0 24px; font-size: 16px;">
        Just a reminder that your booking for <strong>${escapeHtml(data.showTitle)}</strong> is coming up soon!
      </p>

      <!-- Show details -->
      <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <h2 style="margin: 0 0 12px; font-size: 18px;">${escapeHtml(data.showTitle)}</h2>
        <table cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <td style="padding: 4px 8px 4px 0; color: #737373; font-size: 14px;">📅</td>
            <td style="padding: 4px 0; font-size: 14px;">${formatEmailDate(data.performanceDate)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 8px 4px 0; color: #737373; font-size: 14px;">🕐</td>
            <td style="padding: 4px 0; font-size: 14px;">${formatEmailTime(data.performanceDate)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 8px 4px 0; color: #737373; font-size: 14px;">📍</td>
            <td style="padding: 4px 0; font-size: 14px;">${escapeHtml(data.venueName)}</td>
          </tr>
        </table>
      </div>

      <!-- Booking reference reminder -->
      <div style="text-align: center; background-color: #faf5ff; border: 2px dashed #7c3aed; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <p style="margin: 0 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #737373;">Your Booking Reference</p>
        <p style="margin: 0; font-size: 28px; font-weight: 700; font-family: monospace; letter-spacing: 4px; color: #7c3aed;">${data.bookingRef}</p>
      </div>

      <p style="margin: 0 0 24px; font-size: 14px; color: #525252;">
        Remember to arrive at the box office before the show starts with your booking reference ready. We look forward to seeing you!
      </p>

      <!-- CTA -->
      <div style="text-align: center;">
        <a href="${bookingUrl}" style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
          View Your Booking
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; margin-top: 32px; font-size: 12px; color: #a3a3a3;">
      <p style="margin: 0 0 4px;">Nottingham New Theatre</p>
      <p style="margin: 0;">See you at the show!</p>
    </div>
  </div>
</body>
</html>
  `.trim()

  await sendEmail({
    to: data.customerEmail,
    subject: `Reminder: ${data.showTitle} — ${formatEmailDate(data.performanceDate)} (${data.bookingRef})`,
    html,
  })
}
