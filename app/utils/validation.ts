import { z } from 'zod'

// Common validation schemas
export const commonSchemas = {
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: (_passwordField = 'password') =>
    z.string().min(1, 'Please confirm your password'),
  phone: z.string().regex(/^\+?[\d\s\-()]+$/, 'Please enter a valid phone number'),
  url: z.string().url('Please enter a valid URL'),
  required: z.string().min(1, 'This field is required'),
  optionalString: z.string().optional(),
  number: z.number({ invalid_type_error: 'Must be a number' }),
  positiveNumber: z.number().positive('Must be a positive number'),
  date: z.date({ invalid_type_error: 'Must be a valid date' }),
  boolean: z.boolean(),
}

// Helper function to create password confirmation validation
export const createPasswordConfirmation = (data: { password: string, confirmPassword: string }) => {
  if (data.password !== data.confirmPassword) {
    throw new z.ZodError([{
      code: 'custom',
      path: ['confirmPassword'],
      message: 'Passwords do not match',
    }])
  }
  return data
}

// Helper function for reset password confirmation validation
export const updatePasswordConfirmation = (data: { newPassword: string, confirmPassword: string }) => {
  if (data.newPassword !== data.confirmPassword) {
    throw new z.ZodError([{
      code: 'custom',
      path: ['confirmPassword'],
      message: 'Passwords do not match',
    }])
  }
  return data
}

// Example schemas
export const loginSchema = z.object({
  email: commonSchemas.email,
  password: commonSchemas.required,
})

export const registerSchema = z.object({
  name: commonSchemas.required,
  email: commonSchemas.email,
  password: commonSchemas.password,
  confirmPassword: commonSchemas.required,
}).refine(createPasswordConfirmation, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

export const contactSchema = z.object({
  name: commonSchemas.required,
  email: commonSchemas.email,
  subject: commonSchemas.required,
  message: z.string().min(10, 'Message must be at least 10 characters'),
})

export const profileSchema = z.object({
  firstName: commonSchemas.required,
  lastName: commonSchemas.required,
  email: commonSchemas.email,
  phone: commonSchemas.phone.optional(),
  website: commonSchemas.url.optional(),
  bio: commonSchemas.optionalString,
})

export const forgotPasswordEmailSchema = z.object({
  email: commonSchemas.email,
})

export const resetPasswordSchema = z.object({
  newPassword: commonSchemas.password,
  confirmPassword: commonSchemas.required,
}).refine(updatePasswordConfirmation, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

// Admin user edit form validation schema
// This validates the complete form structure but allows for partial updates
export const adminUserEditFormSchema = z.object({
  email: commonSchemas.email,
  studentId: z.string().refine(val => val === '' || /^\d+$/.test(val), {
    message: 'Student ID must contain only numbers',
  }),
  password: z.string().refine(val => val === '' || val.length >= 8, {
    message: 'Password must be at least 8 characters when provided',
  }),
  emailVerified: commonSchemas.boolean,
  setupCompleted: commonSchemas.boolean,
  isActive: commonSchemas.boolean,
  roles: z.array(z.enum(['ADMIN', 'MANAGER', 'TRAINER'])),
  membership: z.object({
    type: z.enum(['FULL', 'ASSOCIATE', 'FELLOW', 'ALUMNI', 'GUEST', 'UNKNOWN']),
    expiry: z.date().nullable(),
  }),
  profile: z.object({
    name: z.string(),
    bio: z.string(),
    avatar: z.string().refine(val => val === '' || z.string().url().safeParse(val).success, {
      message: 'Must be a valid URL when provided',
    }),
    gradYear: z.string().refine((val) => {
      if (val === '') return true
      const num = parseInt(val)
      return !isNaN(num) && num >= 1900 && num <= 2100
    }, {
      message: 'Must be a valid year between 1900 and 2100',
    }),
    course: z.string(),
    socialLinks: z.object({
      github: z.string().refine(val => val === '' || z.string().url().safeParse(val).success, {
        message: 'Must be a valid URL when provided',
      }),
      linkedin: z.string().refine(val => val === '' || z.string().url().safeParse(val).success, {
        message: 'Must be a valid URL when provided',
      }),
      facebook: z.string().refine(val => val === '' || z.string().url().safeParse(val).success, {
        message: 'Must be a valid URL when provided',
      }),
      discord: z.string(),
      instagram: z.string(),
    }),
  }),
})
