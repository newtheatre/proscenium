// Nitro replaces the literal `import.meta.dev` at build and declares this property itself. It is
// redeclared here for `tests/`, which typechecks server code under Bun without Nitro's types.
interface ImportMeta {
  dev?: boolean
}
