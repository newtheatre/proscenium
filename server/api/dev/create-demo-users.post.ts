import prisma from '~~/lib/prisma'

export default defineEventHandler(async (_event) => {
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findFirst()
    if (existingUser) {
      return {
        message: 'Users already exist in the database',
        existingUsers: await prisma.user.count(),
      }
    }

    // Create admin user
    const adminPassword = await hashPassword('Admin123!')
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@example.com',
        name: 'System Administrator',
        password: adminPassword,
        roles: {
          create: [
            { role: 'ADMIN' },
          ],
        },
      },
      include: {
        roles: true,
      },
    })

    // Create manager user
    const managerPassword = await hashPassword('Manager123!')
    const managerUser = await prisma.user.create({
      data: {
        email: 'manager@example.com',
        name: 'Department Manager',
        password: managerPassword,
        roles: {
          create: [
            { role: 'MANAGER' },
          ],
        },
      },
      include: {
        roles: true,
      },
    })

    // Create trainer user
    const trainerPassword = await hashPassword('Trainer123!')
    const trainerUser = await prisma.user.create({
      data: {
        email: 'trainer@example.com',
        name: 'System Trainer',
        password: trainerPassword,
        roles: {
          create: [
            { role: 'TRAINER' },
          ],
        },
      },
      include: {
        roles: true,
      },
    })

    return {
      message: 'Demo users created successfully',
      users: [
        {
          email: adminUser.email,
          name: adminUser.name,
          roles: adminUser.roles.map((r: { role: string }) => r.role),
          password: 'Admin123!',
        },
        {
          email: managerUser.email,
          name: managerUser.name,
          roles: managerUser.roles.map((r: { role: string }) => r.role),
          password: 'Manager123!',
        },
        {
          email: trainerUser.email,
          name: trainerUser.name,
          roles: trainerUser.roles.map((r: { role: string }) => r.role),
          password: 'Trainer123!',
        },
      ],
    }
  }
  catch (error) {
    console.error('Error creating demo users:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create demo users',
    })
  }
})
