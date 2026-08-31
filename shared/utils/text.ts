// UI copy that has to agree with a number. "1 account(s)" is what a screen says when nobody
// bothered, so this is the one place that bothers.

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
