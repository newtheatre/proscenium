// Piped-and-read does not survive `nuxt dev`'s own lifecycle: once Nitro finishes booting,
// further output stops arriving on the stream this file used to read, silently and without
// error. Direct file redirection does not depend on anything reading it, and does survive.

function logPaths(hubDir: string): { stdout: string, stderr: string } {
  return { stdout: `${hubDir}/server.out.log`, stderr: `${hubDir}/server.err.log` }
}

const MAX_TAIL_CHARS = 4000

async function section(label: string, path: string): Promise<string> {
  try {
    const text = await Bun.file(path).text()
    if (!text) return ''
    return `--- ${label} (${path}) ---\n${text.length > MAX_TAIL_CHARS ? `...(truncated)...\n${text.slice(-MAX_TAIL_CHARS)}` : text}`
  }
  catch {
    return `--- ${label} (${path}) ---\n(not captured)`
  }
}

async function tail(paths: { stdout: string, stderr: string }): Promise<string> {
  return (await Promise.all([section('stdout', paths.stdout), section('stderr', paths.stderr)]))
    .filter(Boolean)
    .join('\n')
}

export interface ServerLog {
  // Passed straight to `Bun.spawn`'s `stdout`/`stderr`: two files, never one, because two
  // independent fds opened on the same path each start at offset 0 and clobber each other.
  stdout: ReturnType<typeof Bun.file>
  stderr: ReturnType<typeof Bun.file>
  tail: () => Promise<string>
}

// Called once, by whoever spawns the server: docs/known-issues.md records an afternoon lost
// to a server that explained its own 500 into a discarded pipe. This is fresh for this run.
export async function createServerLog(hubDir: string): Promise<ServerLog> {
  const paths = logPaths(hubDir)
  // Bun.write creates a file's parents, so the hub dir need not exist yet (CONTRIBUTING.md).
  await Promise.all([Bun.write(paths.stdout, ''), Bun.write(paths.stderr, '')])
  return { stdout: Bun.file(paths.stdout), stderr: Bun.file(paths.stderr), tail: () => tail(paths) }
}

// Called by whoever adopts a server someone else already spawned: read-only, so a shared
// suite reading this never truncates the log the server it adopted is still writing to.
export function readServerLog(hubDir: string): { tail: () => Promise<string> } {
  const paths = logPaths(hubDir)
  return { tail: () => tail(paths) }
}
