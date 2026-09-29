#!/usr/bin/env bun
// What a pull request can reach (0110), for the workflows' later steps. Runs before the install,
// so it imports nothing from node_modules. Paths given as arguments are classified instead.

import { appendFileSync } from 'node:fs'
import { scopeOf } from './lib/ci-scope'
import type { Scope } from './lib/ci-scope'

const EVERYTHING: Scope = { app: true, e2e: 'all', suites: [] }

// A pull request's checkout is the merge commit, so its first parent is the base it merges into.
async function changedFiles(): Promise<string[] | string> {
  if (process.env.GITHUB_EVENT_NAME !== 'pull_request') return `this is a ${process.env.GITHUB_EVENT_NAME ?? 'local'} run`
  if ((await Bun.$`git rev-parse --verify -q HEAD^2`.quiet().nothrow()).exitCode !== 0) return 'the checkout is not a merge commit'
  const diff = await Bun.$`git diff --name-only HEAD^1 HEAD`.quiet().nothrow()
  if (diff.exitCode !== 0) return `git diff failed: ${diff.stderr.toString().trim()}`
  return diff.stdout.toString().split('\n').filter(Boolean)
}

async function decide(): Promise<Scope> {
  const given = process.argv.slice(2)
  const changed = given.length ? given : await changedFiles()
  if (typeof changed === 'string') {
    console.log(`scope: everything, because ${changed}`)
    return EVERYTHING
  }
  console.log(`scope: ${changed.length} changed file(s)\n${changed.map(path => `  ${path}`).join('\n')}`)

  const scope = scopeOf(changed)
  // A deleted suite is in the diff and has nothing left to run.
  const suites = (await Promise.all(scope.suites.map(async path => await Bun.file(path).exists() ? path : undefined)))
    .filter((path): path is string => path !== undefined)
  return scope.e2e === 'some' ? { ...scope, e2e: suites.length ? 'some' : 'none', suites } : scope
}

const scope = await decide()
console.log(`scope: build, typecheck and lint ${scope.app ? 'run' : 'skip'}; end-to-end ${scope.e2e === 'some' ? scope.suites.join(' ') : scope.e2e}`)

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `app=${scope.app}\ne2e=${scope.e2e}\nsuites=${scope.suites.join(' ')}\n`)
}
