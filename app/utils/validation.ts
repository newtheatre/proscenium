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
