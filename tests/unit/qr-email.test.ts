import { describe, expect, test } from 'bun:test'
import { render } from '#server/utils/templates'

// D-108 criterion 2 and D-124 criterion 5: the QR in an email is a hosted PNG the client fetches
// over https, never an inline data: URI, which Gmail strips.

const RESERVATION = {
  name: 'Ada',
  reference: 'K7M4PQ',
  show: 'The Tempest',
  when: 'Friday 2 October 2026 at 19:30',
  totalDue: '£9.00',
  url: 'https://newtheatre.org.uk/qr/r-1.sig',
  imageUrl: 'https://newtheatre.org.uk/qr/r-1.sig/image.png',
  qrWidth: 165,
  guidance: ['Age guidance: Recommended 14 and over', 'Content warnings: Strobe lighting'],
  showUrl: 'https://newtheatre.org.uk/shows/the-tempest',
}

const PASS = {
  name: 'Ada',
  reference: 'P-ABC123',
  passType: 'Season pass',
  priceLabel: '£45.00',
  url: 'https://newtheatre.org.uk/passes/p-1.sig',
  imageUrl: 'https://newtheatre.org.uk/passes/p-1.sig/image.png',
  qrWidth: 165,
}

describe('the reservation confirmation carries a hosted QR image', () => {
  const { html, text } = render('reservation-confirmed', RESERVATION)

  test('the image is the hosted PNG, sized to its own bitmap, wrapped in the booking link', () => {
    expect(html).toContain('<a href="https://newtheatre.org.uk/qr/r-1.sig"><img src="https://newtheatre.org.uk/qr/r-1.sig/image.png"')
    expect(html).toContain('width="165" height="165"')
    expect(html).not.toContain('data:')
  })

  test('the link under the image still names the booking URL as text', () => {
    expect(html).toContain('<a href="https://newtheatre.org.uk/qr/r-1.sig">https://newtheatre.org.uk/qr/r-1.sig</a>')
    expect(text).toContain('https://newtheatre.org.uk/qr/r-1.sig')
    expect(text).not.toContain('image.png')
  })

  test('a context without the image fields is refused rather than sent blank', () => {
    const { imageUrl: _dropped, ...without } = RESERVATION
    expect(() => render('reservation-confirmed', without)).toThrow(/missing field/)
  })
})

describe('the pass-issued email carries a hosted QR image', () => {
  const { html } = render('pass-issued', PASS)

  test('the image is the hosted PNG, sized to its own bitmap, wrapped in the pass link', () => {
    expect(html).toContain('<a href="https://newtheatre.org.uk/passes/p-1.sig"><img src="https://newtheatre.org.uk/passes/p-1.sig/image.png"')
    expect(html).toContain('width="165" height="165"')
    expect(html).not.toContain('data:')
  })
})
