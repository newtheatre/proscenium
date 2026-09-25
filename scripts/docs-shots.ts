#!/usr/bin/env bun
// The pictures in the operator documentation, captured from a seeded dev server with numbered
// badges drawn over the elements each page talks about (0076). CI never runs this; the PNGs are committed.

import { openView, visit } from '../tests/helpers/webview'
import { PERSONAS } from '../shared/utils/personas'
import { codeForStep, stepFor } from '../shared/utils/totp'
import { SHOTS } from './docs-shots/index'
import type { Shot } from './docs-shots/types'

const OUT = 'public/images/docs'
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3101'
const HUB_DIR = process.env.DOCS_SHOTS_HUB_DIR ?? '.data'
// Taller than a screen, so a page's controls are in view without scrolling; past about two
// thousand pixels the capture blanks below the fold.
const HEIGHT = 1300
const PHONE_HEIGHT = 1100

// The dev server's own persona map: ids are random per database, so the email is the handle.
async function personaIds(): Promise<Record<string, string>> {
  const file = Bun.file(`${HUB_DIR}/personas.json`)
  if (!await file.exists()) {
    console.error(`docs-shots: no ${HUB_DIR}/personas.json. Run \`bun run seed\` against the dev server's database first.`)
    process.exit(1)
  }
  return JSON.parse(await file.text()) as Record<string, string>
}

// Badges are drawn in the page's own tokens over each element's box, numbered as the legend lists
// them. Everything is scrolled into view first; a selector nothing matches, or one off screen, fails the shot.
function overlay(shot: Shot): string {
  return `(() => {
    document.getElementById('docs-annotations')?.remove()
    const notes = ${JSON.stringify(shot.annotations)};
    const found = notes.map(note => [note, document.querySelector(note.selector)]);
    const missing = found.filter(([, element]) => !element).map(([note]) => note.selector);
    const visible = box => box.width > 0 && box.top >= 0 && box.top < window.innerHeight - Math.min(40, box.height);
    for (const [, element] of found) {
      if (element && !visible(element.getBoundingClientRect())) element.scrollIntoView({ block: 'nearest' });
    }
    const layer = document.createElement('div');
    layer.id = 'docs-annotations';
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    const offScreen = [];
    found.forEach(([note, element], index) => {
      if (!element) return;
      const box = element.getBoundingClientRect();
      if (!visible(box)) { offScreen.push(note.selector); return }
      const ring = document.createElement('div');
      ring.style.cssText = 'position:fixed;border:3px solid var(--ui-primary);border-radius:8px;box-shadow:0 0 0 2px var(--ui-bg)';
      ring.style.left = (box.left - 4) + 'px';
      ring.style.top = (box.top - 4) + 'px';
      ring.style.width = (box.width + 8) + 'px';
      ring.style.height = Math.min(box.height + 8, window.innerHeight - box.top) + 'px';
      const badge = document.createElement('div');
      badge.textContent = String(index + 1);
      badge.style.cssText = 'position:fixed;width:28px;height:28px;border-radius:14px;background:var(--ui-primary);color:var(--ui-bg);font:700 15px/28px system-ui,sans-serif;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.4)';
      badge.style.left = Math.max(2, box.left - 18) + 'px';
      badge.style.top = Math.max(2, box.top - 18) + 'px';
      layer.append(ring, badge);
    });
    document.body.append(layer);
    return { missing, offScreen };
  })()`
}

const wanted = process.argv.slice(2)
const selected = SHOTS.filter(shot => !wanted.length || wanted.some(term => shot.name.includes(term)))
if (!selected.length) {
  console.error('docs-shots: nothing matched.')
  process.exit(1)
}

// A running dev server, seeded, rather than the harness's own: the harness empties the database
// it adopts, and these pictures want the seed's data in them.
try {
  const health = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(5000) })
  if (!('sessionKey' in (await health.json() as Record<string, unknown>))) throw new Error('not this app')
}
catch {
  console.error(`docs-shots: nothing serving at ${BASE_URL}. Start the dev server on that port and seed it first.`)
  process.exit(1)
}
const ids = await personaIds()
const view = await openView({ width: 1280, height: HEIGHT })
let signedInAs: string | null = null

// Page-context fetch, so the call rides the browser's own cookie jar.
async function post(path: string, body: unknown): Promise<{ status: number, json: Record<string, unknown> }> {
  return await view.evaluate(
    `fetch(${JSON.stringify(path)}, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(body))} })
      .then(async response => ({ status: response.status, json: await response.json().catch(() => ({})) }))`,
  ) as { status: number, json: Record<string, unknown> }
}

async function signInAs(email: string, id: string): Promise<void> {
  const { status } = await post('/api/dev/sign-in-as', { userId: id })
  if (status !== 200) throw new Error(`docs-shots: signing in as ${email} answered ${status}`)
}

// A privileged role refuses until an authenticator is confirmed, and the seed enrols none
// (issue 927), so each persona is enrolled through the real routes the first time it is used.
async function become(email: string): Promise<void> {
  if (signedInAs === email) return
  const id = ids[email]
  if (!PERSONAS.some(candidate => candidate.email === email) || !id) throw new Error(`docs-shots: no seeded persona ${email}`)
  await view.navigate(`${BASE_URL}/`)
  await signInAs(email, id)
  const enrolment = await post('/api/account/mfa/enrol', {})
  if (enrolment.status === 200) {
    const secret = enrolment.json.secret as string
    const confirmed = await post('/api/account/mfa/confirm', { code: await codeForStep(secret, stepFor(new Date())) })
    if (confirmed.status !== 200) throw new Error(`docs-shots: confirming ${email}'s authenticator answered ${confirmed.status}`)
    // Confirming ends every session, this one included.
    await signInAs(email, id)
  }
  signedInAs = email
}

const failures: string[] = []

// The dev server answers 503 for a moment after a rebuild, so a screen that never hydrates is
// asked for once more before the shot counts as failed.
async function open(shot: Shot): Promise<void> {
  try {
    await visit(view, `${BASE_URL}${shot.url}`, shot.marker)
  }
  catch {
    await Bun.sleep(3000)
    await visit(view, `${BASE_URL}${shot.url}`, shot.marker)
  }
}

for (const shot of selected) {
  try {
    await become(shot.persona)
    view.resize(shot.width ?? 1280, shot.height ?? ((shot.width ?? 1280) < 600 ? PHONE_HEIGHT : HEIGHT))
    await open(shot)
    await Bun.sleep(1200)
    if (shot.after) {
      // Wrapped, so a manifest may write statements; the harness evaluates one expression.
      await view.evaluate(`(() => { ${shot.after} })()`)
      await Bun.sleep(1200)
    }
    const { missing, offScreen } = await view.evaluate(overlay(shot)) as { missing: string[], offScreen: string[] }
    if (missing.length) throw new Error(`no element matches ${missing.join(', ')}`)
    if (offScreen.length) throw new Error(`off screen at this height: ${offScreen.join(', ')}`)
    await Bun.sleep(300)
    await Bun.write(`${OUT}/${shot.name}.png`, await view.screenshot())
    console.info(`wrote ${OUT}/${shot.name}.png`)
  }
  catch (error) {
    failures.push(`${shot.name}: ${(error as Error).message}`)
    console.error(`FAIL ${shot.name}: ${(error as Error).message}`)
  }
}

view.close()

if (failures.length) {
  console.error(`\ndocs-shots: ${failures.length} of ${selected.length} failed.`)
  process.exit(1)
}

console.info(`\ndocs-shots: ${selected.length} picture(s) written.`)
process.exit(0)
