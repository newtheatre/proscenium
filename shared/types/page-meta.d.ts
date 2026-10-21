// A screen names its operator documentation page and the shell renders the link, so every
// console, member and show-night screen is one tap from its page (J-109 criterion 1, 0076).
declare module '#app' {
  interface PageMeta {
    docs?: string
    // A show-night screen that asks for the wider column (0144); only the till does.
    nightWide?: boolean
  }
}

declare module 'vue-router' {
  interface RouteMeta {
    docs?: string
    nightWide?: boolean
  }
}

export {}
