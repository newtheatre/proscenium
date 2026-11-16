// R2: one refusal body for every route and every service: { code, reason, remedy?, fields? }.
// `reason` and `remedy` are sentences a person can act on (translation keys once the interface
// layer exists). `code` is stable: `<module>.<what>`.

export interface RefusalBody {
  code: string
  reason: string
  remedy?: string
  fields?: Record<string, string>
}

export class Refusal extends Error {
  readonly code: string
  readonly reason: string
  readonly remedy?: string
  readonly fields?: Record<string, string>
  readonly status: number

  constructor(code: string, reason: string, options: { remedy?: string, fields?: Record<string, string>, status?: number } = {}) {
    super(`${code}: ${reason}`)
    this.name = 'Refusal'
    this.code = code
    this.reason = reason
    this.remedy = options.remedy
    this.fields = options.fields
    this.status = options.status ?? 409
  }

  toBody(): RefusalBody {
    const body: RefusalBody = { code: this.code, reason: this.reason }
    if (this.remedy) body.remedy = this.remedy
    if (this.fields) body.fields = this.fields
    return body
  }
}

/** The one way to say no. Throws, so a handler stops where it refuses. */
export function refuse(code: string, reason: string, options: { remedy?: string, fields?: Record<string, string>, status?: number } = {}): never {
  throw new Refusal(code, reason, options)
}

export function isRefusal(error: unknown): error is Refusal {
  return error instanceof Refusal || (typeof error === 'object' && error !== null && (error as { name?: string }).name === 'Refusal')
}

/** A mistake in a declaration: a manifest, a table, a setting or a route. Names the file and field. */
export class DeclarationError extends Error {
  constructor(public field: string, message: string, public file?: string) {
    super(file ? `${file}: ${field}: ${message}` : `${field}: ${message}`)
    this.name = 'DeclarationError'
  }

  inFile(file: string): DeclarationError {
    return new DeclarationError(this.field, this.message.replace(/^.*?: /, '').replace(`${this.field}: `, ''), file)
  }
}
