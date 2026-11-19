// NNT ONLY. Old-site links that fall under this site's own pages, so redirects.yml cannot hold
// them: the booking terms (/policies/booking) and the booking links for performances of the term the
// site moved in (/book/<old performance id>). Each goes on, for good, to its new page. The booking
// links can go once the last of those performances (8 December 2026) has passed.
import { defineEventHandler, getRequestURL, sendRedirect } from 'h3'

const SHOW_OF_OLD_PERFORMANCE: Record<string, string> = {
  '72e9e57fff5d46009aa8198c51e1311d': 'punk-rock-2026',
  '235ea47b490249129db6c60b2fd98776': 'punk-rock-2026',
  '9c6e8d8ad53744a28b07c076497a545e': 'punk-rock-2026',
  '2ae4e2c1103b41a0ae5672d9eb8bc82b': 'punk-rock-2026',
  'd06ffbd1a32d4e049ce8cfa30c074630': 'talk-dirty-to-me',
  'ad107afa7c554d1f8dbd56a17293498f': 'talk-dirty-to-me',
  '3e71dc267ae54d5aa54f35a800abfb15': 'talk-dirty-to-me',
  '60b0959e1c4a43318cd2ee5a8c246efe': 'talk-dirty-to-me',
  '5d84800a41904dfaa860f81efc1782c3': 'o-children',
  'd5116317512f486384ab580fdfcaf6d0': 'o-children',
  '5b142543e5634e0db30c4bca1194c1dc': 'o-children',
  '981e89d69c5d4242a069d50f29384123': 'o-children',
  '69357fd18bd04af0a0d64c8b0cda8d59': 'the-woods-that-night',
  '0c886f9e991749e3be7a353b380b1e71': 'the-woods-that-night',
  '68c144a711b544c79c4a3eca6a2dcc10': 'the-woods-that-night',
  'b2b770ad03d8424385e73fa87b1af64b': 'the-woods-that-night',
  '864502cb68b740208b412d4a51b586d5': 'times-tavern',
  'b8ad372d73b6411a8afc5f6ea46c8501': 'times-tavern',
  '66f1e9555e6b48ccaa45a5ae8b207637': 'times-tavern',
  '039bdb5d2a0e444b991b57fe51ccb4c8': 'times-tavern',
}

export default defineEventHandler((event) => {
  if (event.method !== 'GET' && event.method !== 'HEAD') return
  const path = getRequestURL(event).pathname.replace(/\/+$/, '')
  if (path === '/policies/booking') return sendRedirect(event, '/policies/tickets', 301)
  const old = /^\/book\/([0-9a-f]{32})$/.exec(path)
  const slug = old && SHOW_OF_OLD_PERFORMANCE[old[1]!]
  if (slug) return sendRedirect(event, `/whats-on/${slug}`, 301)
})
