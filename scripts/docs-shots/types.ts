// One screenshot in the operator documentation (0076). The name is the path under
// public/images/docs, the persona is a seeded account's email, and each annotation is a numbered badge.
export interface Shot {
  name: string
  persona: string
  url: string
  // An element inside the page: the screen is captured once this one has hydrated.
  marker: string
  width?: number
  height?: number
  // Page-context JavaScript run before capture, for opening a modal or picking a filter.
  after?: string
  annotations: Annotation[]
}

export interface Annotation {
  selector: string
  label: string
}

export const CONSOLE_WIDTH = 1280
export const PHONE_WIDTH = 390
