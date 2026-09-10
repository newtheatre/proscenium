// Where every public address of the old site lands (K-125). nuxt.config.ts turns the map into
// 301 route rules, and the cutover runbook in docs/operations.md quotes it.

export const ALUMNI_SITE = 'https://alumni.newtheatre.org.uk'
export const MAILING_LIST_URL = 'https://newtheatre.us3.list-manage.com/subscribe?u=ce5311ce46fe45638f90f4022&id=97e4899eb8'

// A key ending /** covers everything beneath it and the bare path too, so a bare path that lands
// somewhere else takes its own row: the exact rule wins over the wildcard for that one path.
export const OLD_SITE_REDIRECTS: Record<string, string> = {
  // Editorial pages
  '/technical': '/technical-specification',
  '/festival': '/whats-on',
  '/alumni': `${ALUMNI_SITE}/`,
  '/alumni/**': `${ALUMNI_SITE}/register`,
  '/mailing-list': MAILING_LIST_URL,
  '/mailing-list/**': MAILING_LIST_URL,
  '/get-involved/creatives': '/get-involved',
  '/get-involved/stagecraft': '/training/modules',

  // A member's own screens
  '/account': '/account/profile',
  '/account/reservations': '/qr',
  '/account/shifts': '/rota',
  '/account/tab': '/account/profile',
  '/backstage': '/board',
  '/bar/tab': '/tonight/till',

  // Front of house, which the show-night shell replaced
  '/foh': '/tonight',
  '/foh/tonight': '/tonight',
  '/foh/scan': '/tonight/door',
  '/foh/practice-tickets': '/tonight/door',
  '/foh/age-checks': '/tonight/age-checks',
  '/foh/emergency': '/tonight/emergency',
  '/foh/backstage': '/tonight/board',
  '/foh/contacts': '/tonight',
  '/foh/bar/till': '/tonight/till',
}

// The one family a route rule cannot express: /whats-on/<slug> and the booking pages under it.
// A /whats-on/** rule would take /whats-on itself with it, so server/routes/whats-on answers.
export function oldShowRedirect(slug: string, rest: string[] = []): string {
  if (rest[0] === 'booking') return '/qr'
  return `/shows/${encodeURIComponent(slug)}`
}
