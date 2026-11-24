// Contracts for the points that change the public site's shape while a condition holds (C-71 to
// C-73): the front page, menu and footer entries, and the address production pages live at.
// Each `appliesWhen` is one cheap read, asked once a request.

export interface FrontPage {
  /** A component in a layer's app/public-sections folder, drawn at / in place of the theatre's own page. */
  component: string
  appliesWhen: () => Promise<boolean>
}

export interface MenuEntry {
  /** A translation key in the contributing module's catalogue. */
  labelKey: string
  to: string
  order?: number
}

export interface SiteMenu {
  order?: number
  /** Put before the theatre's own menu items. */
  entries: () => Promise<MenuEntry[]>
  /** Put beside the theatre's own footer links. */
  footer: () => Promise<MenuEntry[]>
  appliesWhen: () => Promise<boolean>
}

export interface ProductionAddress {
  /** A reserved prefix the contributor owns and has a page under, such as `events`. */
  base: string
  appliesWhen: () => Promise<boolean>
}
