// Routes: every server route is written with defineRoute and names its ability or says
// public: true; its ability is declared; it lies under its module's prefix; a changing route
// validates its input (F-04, Test plan "Routes").
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { ROOT } from '../lib/paths.ts'
import type { Loaded } from '../lib/load.ts'

export interface RouteInfo {
  file: string
  module: string | undefined
  method: string | undefined
  path: string
  usesDefineRoute: boolean
  ability?: string
  abilityIsLiteral: boolean
  public: boolean
  rateLimit?: string
  input: boolean
  idempotent: boolean
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : name.endsWith('.ts') && !name.endsWith('.d.ts') ? [full] : []
  })
}

export function routeFiles(modules: Loaded[]): { file: string, module?: string, apiRoot: string }[] {
  const out: { file: string, module?: string, apiRoot: string }[] = []
  for (const m of modules) {
    const apiRoot = join(ROOT, m.found.root, 'server/api')
    for (const file of walk(apiRoot)) out.push({ file, module: m.manifest.id, apiRoot })
  }
  const siteApi = join(ROOT, 'site/server/api')
  for (const file of walk(siteApi)) out.push({ file, apiRoot: siteApi })
  return out
}

export function parseRoute(file: string, apiRoot: string): RouteInfo {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const relative = file.slice(apiRoot.length + 1).replace(/\\/g, '/')
  const method = /\.(get|post|put|patch|delete|head)\.ts$/.exec(relative)?.[1]
  const info: RouteInfo = {
    file: file.slice(ROOT.length + 1), module: relative.split('/')[0], method, path: `/api/${relative.replace(/(\.(get|post|put|patch|delete|head))?\.ts$/, '').replace(/\/index$/, '')}`,
    usesDefineRoute: false, abilityIsLiteral: true, public: false, input: false, idempotent: false,
  }
  for (const statement of source.statements) {
    if (!ts.isExportAssignment(statement) || statement.isExportEquals) continue
    const call = statement.expression
    if (!ts.isCallExpression(call) || call.expression.getText(source) !== 'defineRoute') continue
    info.usesDefineRoute = true
    const decl = call.arguments[0]
    if (!decl || !ts.isObjectLiteralExpression(decl)) continue
    for (const prop of decl.properties) {
      if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) continue
      const name = prop.name.getText(source)
      const value = ts.isPropertyAssignment(prop) ? prop.initializer : undefined
      if (name === 'ability') {
        if (value && ts.isStringLiteralLike(value)) info.ability = value.text
        else info.abilityIsLiteral = false
      }
      if (name === 'public') info.public = !!value && value.kind === ts.SyntaxKind.TrueKeyword
      if (name === 'rateLimit' && value && ts.isStringLiteralLike(value)) info.rateLimit = value.text
      if (name === 'input') info.input = true
      if (name === 'idempotent') info.idempotent = !!value && value.kind === ts.SyntaxKind.TrueKeyword
    }
  }
  return info
}

export function allRoutes(modules: Loaded[]): RouteInfo[] {
  return routeFiles(modules).map(r => ({ ...parseRoute(r.file, r.apiRoot), owner: r.module } as RouteInfo & { owner?: string }))
}

export function checkRoutes(registry: any, modules: Loaded[], options: { fatalOnly?: boolean } = {}): string[] {
  const problems: string[] = []
  for (const route of allRoutes(modules) as (RouteInfo & { owner?: string })[]) {
    const at = route.file
    if (!route.usesDefineRoute) {
      problems.push(`${at}: a route is written as export default defineRoute({ ability or public: true, rateLimit }, handler)`)
      continue
    }
    if (!route.ability && route.abilityIsLiteral && !route.public) problems.push(`${at}: ability: the route names the ability it requires, or says public: true in so many words`)
    if (!route.abilityIsLiteral) problems.push(`${at}: ability: write the ability as a string, so the check can read it`)
    if (!route.rateLimit) problems.push(`${at}: rateLimit: every route declares its rate-limit class (default, write, sign-in, public-form or export)`)
    if (options.fatalOnly) continue
    if (route.ability && route.ability !== 'signed-in' && !registry.abilities.has(route.ability)) problems.push(`${at}: ability: "${route.ability}" is not declared by any module`)
    if (route.owner && route.module !== route.owner) problems.push(`${at}: lies outside its module's prefix: put it under server/api/${route.owner}/`)
    if (!route.owner && !(route.module && registry.modules.has(route.module) && registry.modules.get(route.module).owner === 'site')) problems.push(`${at}: a theatre's route lives under /api/<one of your x- modules>/`)
    const changes = route.method !== 'get' && route.method !== 'head'
    if (changes && !route.input) problems.push(`${at}: input: a route that changes something validates its input with a Zod schema`)
  }
  return problems
}
