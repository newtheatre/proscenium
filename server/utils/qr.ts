import { renderSVG } from 'uqr'

// The same renderer the MFA enrolment screen uses client-side (app/pages/account/security.vue),
// here server-side for the confirmation email (D-108 criterion 1).
export function qrSvgBase64(data: string): string {
  return btoa(renderSVG(data))
}
