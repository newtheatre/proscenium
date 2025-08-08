import { PrismaClient } from '@prisma/client'
import { PrismaD1 } from '@prisma/adapter-d1'

const prismaClientSingleton = () => {
  // In development, use SQLite directly without adapter
  if (process.env.NODE_ENV !== 'production') {
    return new PrismaClient()
  }

  // In production, use Cloudflare D1 with adapter
  console.log('Using PrismaD1 adapter for Cloudflare D1 database')
  // @ts-expect-error - env is available in Cloudflare Workers runtime and adapter is supported
  const adapter = new PrismaD1(env.DB)

  // @ts-expect-error - env is available in Cloudflare Workers runtime
  console.log('PrismaD1 adapter initialized with binding:', env.DB)

  return new PrismaClient({ adapter })
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>
} & typeof global

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
