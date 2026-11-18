// Contract for core.health-check: a named check shown on the health screen.
export interface HealthCheck {
  /** `to` is the screen where it is put right, for the Admin overview's link. */
  check: () => Promise<{ state: 'ok' | 'warning' | 'failing', sentence: string, remedy?: string, to?: string }>
}
