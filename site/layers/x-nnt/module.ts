// NNT ONLY, TEMPORARY: remove after 8 December 2026, with site/app/utils/old-codes.ts.
// Old-system booking and pass emails link to /qr/<token> and /passes/<token>, and show their QR code
// as a picture from /qr/<token>/image.png. Those links must keep working while maintenance mode
// closes the site for the move, as the platform's own emailed links do.
import { defineModule } from '#kit'

export default defineModule({
  id: 'x-nnt',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  switchable: false,
  uses: ['maintenance'],

  contributes: {
    'maintenance.open-address': [
      { id: 'x-nnt.old-booking-code', prefix: '/qr/' },
      { id: 'x-nnt.old-pass-code', prefix: '/passes/' },
    ],
  },
})
