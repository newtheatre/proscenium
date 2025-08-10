import { z } from 'zod'
import type { RoleType } from '@prisma/client'
import prisma from '~~/lib/prisma'

const verifyEmailSchema = z.object({
  token: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)

    // Validate input
    const result = verifyEmailSchema.safeParse(body)
    if (!result.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid token',
      })
    }

    const { token } = result.data

    // Find user with this verification token
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpires: {
          gt: new Date(), // Token not expired
        },
        emailVerified: false, // Not already verified
      },
    })

    if (!user) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid or expired verification token',
      })
    }

    // Update user as verified and clear verification token
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        setupCompleted: true,
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

    // Automatically log the user in
    await setUserSession(event, {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        emailVerified: updatedUser.emailVerified,
        setupCompleted: updatedUser.setupCompleted,
        roles: updatedUser.roles.map((r: { role: RoleType }) => r.role),
        profile: updatedUser.profile
          ? {
              name: updatedUser.profile.name,
              avatar: updatedUser.profile.avatar,
            }
          : null,
        membership: updatedUser.membership
          ? {
              type: updatedUser.membership.type,
              expiry: updatedUser.membership.expiry,
            }
          : null,
      },
    })

    return {
      message: 'Email verified successfully! You are now logged in.',
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        emailVerified: updatedUser.emailVerified,
        setupCompleted: updatedUser.setupCompleted,
        roles: updatedUser.roles.map((r: { role: RoleType }) => r.role),
        profile: updatedUser.profile
          ? {
              name: updatedUser.profile.name,
              avatar: updatedUser.profile.avatar,
            }
          : null,
        membership: updatedUser.membership
          ? {
              type: updatedUser.membership.type,
              expiry: updatedUser.membership.expiry,
            }
          : null,
      },
    }
  }
  catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    console.error('Email verification error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error',
    })
  }
})
