/** Pence as a readable figure, for messages a human reads mid-transaction. */
export function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}
