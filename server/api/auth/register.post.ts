import { z } from 'zod'
import type { RoleType } from '@prisma/client'
import prisma from '~~/lib/prisma'
import { isValidEmail, isValidPassword } from '~~/server/utils/auth'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)

    // Validate input
    const result = registerSchema.safeParse(body)
    if (!result.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid input data',
        data: result.error.issues,
      })
    }

    const { email, password, name } = result.data

    // Additional email validation
    if (!isValidEmail(email)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid email format',
      })
    }

    // Password strength validation
    const passwordValidation = isValidPassword(password)
    if (!passwordValidation.valid) {
      throw createError({
        statusCode: 400,
        statusMessage: passwordValidation.message,
      })
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      throw createError({
        statusCode: 409,
        statusMessage: 'User with this email already exists',
      })
    }

    // Hash password
    const hashedPassword = await hashPassword(password)

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        profile: {
          create: {
            name: name || '',
            avatar: '',
          },
        },
        membership: {
          create: {
            type: 'UNKNOWN',
            expiry: null,
          },
        },
      },
      select: {
        id: true,
        email: true,
        profile: {
          select: {
            name: true,
            avatar: true,
          },
        },
        roles: {
          select: {
            role: true,
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

    // Set user session
    await setUserSession(event, {
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles.map((r: { role: RoleType }) => r.role),
        profile: {
          name: user.profile!.name,
          avatar: user.profile!.avatar,
        },
        membership: {
          type: user.membership!.type,
          expiry: user.membership!.expiry,
        },
      },
    })

    return {
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles.map((r: { role: RoleType }) => r.role),
        profile: {
          name: user.profile!.name,
          avatar: user.profile!.avatar,
        },
        membership: {
          type: user.membership!.type,
          expiry: user.membership!.expiry,
        },
      },
    }
  }
  catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    console.error('Registration error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error',
    })
  }
})
