import { RoleType } from '~~/prisma/generated/client'
import z from 'zod'
import prisma from '~~/server/database'

const bodySchema = z.object({
  email: z.email(),
  roles: z.array(z.enum(RoleType)).optional(),
  profile: z.object({
    name: z.string(),
    avatar: z.url().nullable().optional(),
  }),
})

// POST /api/v2/users
//
// Create a new user. (admin only)
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const { email, roles, profile } = await readValidatedBody(event, bodySchema.parse)

  const existingUser = await prisma.user.findUnique({
    where: { email: email },
  })

  if (existingUser) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: 'A user with that email already exists',
    })
  }

  // Generate password reset token to let user set their own password
  const resetToken = generateVerificationToken()
  const resetExpires = new Date(Date.now() + 1 * 60 * 60 * 1000) // 1 hour

  const user = await prisma.user.create({
    data: {
      email,
      password: generatePassword(), // Temporary password; user must reset
      passwordResetToken: resetToken,
      passwordResetExpires: resetExpires,
      emailVerified: true, // Admin-created users are considered verified
      roles: roles ? { create: roles.map(role => ({ role })) } : undefined,
      profile: {
        create: {
          name: profile.name,
          avatar: profile?.avatar,
        },
      },
    },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      roles: {
        select: {
          role: true,
        },
      },
      createdAt: true,
      profile: {
        select: {
          name: true,
          avatar: true,
        },
      },
    },
  })

  await sendPasswordResetEmail(user.email, resetToken)

  return {
    ...user,
    roles: user.roles.map(r => r.role),
  }
})

function generatePassword() {
  // Generate a random password with uppercase, lowercase, numbers, and symbols
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
