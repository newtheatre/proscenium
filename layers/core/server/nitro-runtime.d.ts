// Nitro's Cloudflare module runtime ships without type declarations; the entry only spreads it.
declare module 'nitropack/presets/cloudflare/runtime/cloudflare-module' {
  const handler: ExportedHandler
  export default handler
}
