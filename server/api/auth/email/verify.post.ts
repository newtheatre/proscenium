import { z } from 'zod'
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
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    })

    return {
      message: 'Email verified successfully! You can now complete your account setup.',
      success: true,
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
