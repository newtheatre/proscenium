// Contract for core.health-check: a named check shown on the health screen.
export interface HealthCheck {
  check: () => Promise<{ state: 'ok' | 'warning' | 'failing', sentence: string, remedy?: string }>
}
