import { z } from 'zod'
import prisma from '~~/lib/prisma'
import { isValidEmail, isValidPassword, generateVerificationToken, sendVerificationEmail } from '~~/server/utils/auth'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
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

    const { email, password } = result.data

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
      // throw createError({
      //   statusCode: 409,
      //   statusMessage: 'User with this email already exists',
      // })

      // Don't reveal if user exists or not for security
      return {
        message: 'If no account with this email exists, a verification email will be sent.',
      }
    }

    // Hash password
    const hashedPassword = await hashPassword(password)

    // Generate email verification token
    const verificationToken = generateVerificationToken()
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // Create user (not verified yet, setup not completed)
    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        emailVerificationToken: verificationToken,
        emailVerificationExpires: verificationExpires,
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
        emailVerified: true,
        setupCompleted: true,
      },
    })

    // Send verification email
    try {
      await sendVerificationEmail(email, verificationToken)
    }
    catch (error) {
      console.error('Failed to send verification email:', error)
      // Don't fail registration if email sending fails
    }

    return {
      message: 'If no account with this email exists, a verification email will be sent.',
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
