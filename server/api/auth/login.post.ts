import { z } from 'zod'
import type { RoleType } from '@prisma/client'
import prisma from '~~/lib/prisma'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)

    // Validate input
    const result = loginSchema.safeParse(body)
    if (!result.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid input data',
        data: result.error.issues,
      })
    }

    const { email, password } = result.data

    // Find user with roles
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        roles: {
          select: {
            role: true,
          },
        },
        profile: {
          select: {
            name: true,
            avatar: true,
          },
        },
        membership: {
          select: {
            type: true,
            expiry: true,
          },
        },
      },
    })

    if (!user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid credentials',
      })
    }

    // Verify password
    const isPasswordValid = await verifyPassword(user.password, password)
    if (!isPasswordValid) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid credentials',
      })
    }

    // TODO: Have missing fields (e.g. profile, membership) be created on login if they don't exist

    // Set user session
    await setUserSession(event, {
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles.map((r: { role: RoleType }) => r.role),
        profile: user.profile
          ? {
              name: user.profile.name,
              avatar: user.profile.avatar,
            }
          : null,
        membership: user.membership
          ? {
              type: user.membership.type,
              expiry: user.membership.expiry,
            }
          : null,
      },
    })

    return {
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles.map((r: { role: RoleType }) => r.role),
        profile: user.profile
          ? {
              name: user.profile.name,
              avatar: user.profile.avatar,
            }
          : null,
        membership: user.membership
          ? {
              type: user.membership.type,
              expiry: user.membership.expiry,
            }
          : null,
      },
    }
  }
  catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    console.error('Login error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error',
    })
  }
})
