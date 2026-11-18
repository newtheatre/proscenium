// The QR poster for a scheme's join page: an A4 page with the theatre's name, the scheme, a QR code
// of the join link and the link written out, for a stall or a noticeboard. Drawn as an SVG, then
// turned into a PNG at print resolution, so it prints the same from any computer.
import { encode } from 'uqr'

const WIDTH = 2480 // not-policy: A4 at 300 dots an inch
const HEIGHT = 3508 // not-policy: A4 at 300 dots an inch
const MARGIN = 200 // not-policy: the poster's margin
const LINE = 46 // not-policy: characters on a line of the summary at its size

export interface PosterText { theatre: string, title: string, summary: string | null, url: string, scan: string }

const escape = (s: string) => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', '\'': '&apos;' })[c]!)

/** Breaks text into lines of about `width` characters at spaces, keeping at most `max` lines. */
function wrap(text: string, width: number, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line.length + 1 + word.length) > width) {
      lines.push(line)
      line = word
    }
    else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  if (lines.length <= max) return lines
  return [...lines.slice(0, max - 1), `${lines[max - 1]!.replace(/\s*\S*$/, '')}…`]
}

/** The poster as an SVG document. */
export function membershipPosterSvg(text: PosterText): string {
  const { size, data } = encode(text.url, { border: 0, ecc: 'M' })
  const qrSide = WIDTH - MARGIN * 4
  const cell = qrSide / size
  const qrTop = 1250 // not-policy: where the code starts down the page
  const path = data.flatMap((row, y) => row.map((dark, x) => dark ? `M${x} ${y}h1v1h-1z` : '')).join('')
  const titleLines = wrap(text.title, 22, 2) // not-policy: characters on a line of the title
  const summaryLines = text.summary ? wrap(text.summary, LINE, 3) : []
  const font = 'font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"'
  const centred = (y: number, size: number, weight: number, value: string, fill = '#111') => `<text x="${WIDTH / 2}" y="${y}" text-anchor="middle" font-size="${size}" font-weight="${weight}" fill="${fill}" ${font}>${escape(value)}</text>`
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="#fff"/>`,
    centred(MARGIN + 80, 90, 500, text.theatre, '#444'),
    ...titleLines.map((l, i) => centred(MARGIN + 300 + i * 190, 170, 700, l)),
    ...summaryLines.map((l, i) => centred(MARGIN + 340 + titleLines.length * 190 + i * 100, 72, 400, l, '#333')),
    `<g transform="translate(${MARGIN * 2} ${qrTop}) scale(${cell})" shape-rendering="crispEdges"><path d="${path}" fill="#000"/></g>`,
    centred(qrTop + qrSide + 180, 110, 700, text.scan),
    centred(qrTop + qrSide + 310, 70, 400, text.url, '#333'),
    '</svg>',
  ].join('')
}

/** Draws the SVG onto a canvas and saves it as a PNG with this file name. */
export async function downloadMembershipPoster(svg: string, fileName: string): Promise<void> {
  const image = new Image()
  const source = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('The poster could not be drawn.'))
      image.src = source
    })
    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    canvas.getContext('2d')!.drawImage(image, 0, 0)
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('The poster could not be drawn.')), 'image/png'))
    const link = document.createElement('a')
    link.href = URL.createObjectURL(png)
    link.download = fileName
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000) // not-policy: long enough for the download to start
  }
  finally {
    URL.revokeObjectURL(source)
  }
}
