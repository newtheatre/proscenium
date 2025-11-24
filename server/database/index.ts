import { PrismaClient } from '~~/prisma/generated/client'
import { PrismaD1 } from '@prisma/adapter-d1'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const prismaClientSingleton = () => {
  // In development, use SQLite directly without adapter
  if (process.env.NODE_ENV !== 'production') {
    const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL ?? '' })

    return new PrismaClient({ adapter })
  }

  // In production, use Cloudflare D1 with adapter
  // @ts-expect-error - env is available in Cloudflare Workers runtime and adapter is supported
  const adapter = new PrismaD1(process.env.DB)

  return new PrismaClient({ adapter })
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>
} & typeof global

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
