import { z } from 'zod'
import prisma from '~~/lib/prisma'
import { generateVerificationToken, sendVerificationEmail } from '~~/server/utils/auth'

const resendSchema = z.object({
  email: z.string().email(),
})

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)

    // Validate input
    const result = resendSchema.safeParse(body)
    if (!result.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid email',
      })
    }

    const { email } = result.data

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      // Don't reveal if user exists or not for security
      return {
        message: 'If an account with this email exists, a verification email will be sent.',
      }
    }

    if (user.emailVerified) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Email is already verified',
      })
    }

    // Generate new token
    const verificationToken = generateVerificationToken()
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // Update user with new token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: verificationToken,
        emailVerificationExpires: verificationExpires,
      },
    })

    // Send verification email
    try {
      await sendVerificationEmail(email, verificationToken)
    }
    catch (error) {
      console.error('Failed to send verification email:', error)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to send verification email',
      })
    }

    return {
      message: 'Verification email sent successfully.',
    }
  }
  catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    console.error('Resend verification error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error',
    })
  }
})
