<template>
  <div class="setup-account-container">
    <div class="setup-account">
      <h2 class="setup-account__title">
        Complete Your Account Setup
      </h2>
      <p class="setup-account__description">
        Please provide some information to complete your profile setup.
      </p>

      <div class="setup-account__content">
        <Form
          :error="form.formError.value"
          @submit="form.handleSubmit"
        >
          <!-- Basic Information -->
          <div class="form-section">
            <h3 class="form-section__title">
              Basic Information
            </h3>

            <FormInput
              id="name"
              :model-value="name.value.value"
              label="Full Name"
              type="text"
              autocomplete="name"
              placeholder="Enter your full name"
              :error="name.error.value"
              :touched="name.touched.value"
              @update:model-value="name.setValue"
              @blur="name.setTouched()"
            />

            <FormTextarea
              id="bio"
              :model-value="bio.value.value"
              label="Bio (Optional)"
              placeholder="Tell us about yourself..."
              :error="bio.error.value"
              :touched="bio.touched.value"
              :rows="3"
              @update:model-value="bio.setValue"
              @blur="bio.setTouched()"
            />
          </div>

          <!-- Membership Information -->
          <div class="form-section">
            <h3 class="form-section__title">
              Membership Information
            </h3>

            <FormSelect
              id="membershipType"
              :model-value="membershipType.value.value"
              label="Membership Type"
              placeholder="Select your membership type"
              placeholder-value="UNKNOWN"
              :options="membershipOptions"
              :error="membershipType.error.value"
              :touched="membershipType.touched.value"
              @update:model-value="membershipType.setValue"
              @blur="membershipType.setTouched()"
            />

            <!-- Student ID - only for non-guest members -->
            <FormInput
              v-if="showStudentId"
              id="studentId"
              :model-value="studentId.value.value"
              label="Student ID"
              type="text"
              placeholder="Enter your student ID"
              :error="studentId.error.value"
              :touched="studentId.touched.value"
              @update:model-value="studentId.setValue"
              @blur="studentId.setTouched()"
            />

            <!-- Course and Graduation Year - not required for guests -->
            <FormInput
              v-if="showCourseAndGradYear"
              id="course"
              :model-value="course.value.value"
              label="Course/Degree (Optional)"
              type="text"
              placeholder="e.g. Computer Science"
              :error="course.error.value"
              :touched="course.touched.value"
              @update:model-value="course.setValue"
              @blur="course.setTouched()"
            />

            <FormInput
              v-if="showCourseAndGradYear"
              id="gradYear"
              :model-value="gradYear.value.value"
              :label="gradYearLabel"
              type="number"
              :placeholder="gradYearPlaceholder"
              :min="gradYearMin"
              :max="gradYearMax"
              :error="gradYear.error.value"
              :touched="gradYear.touched.value"
              @update:model-value="gradYear.setValue"
              @blur="gradYear.setTouched()"
            />
          </div>

          <!-- Social Links -->
          <UIExpandableSection
            title="Social Links (Optional)"
            description="Add your social media profiles to connect with other members."
          >
            <FormInput
              id="facebook"
              :model-value="facebook.value.value"
              label="Facebook"
              type="url"
              placeholder="https://facebook.com/username"
              :error="facebook.error.value"
              :touched="facebook.touched.value"
              @update:model-value="facebook.setValue"
              @blur="facebook.setTouched()"
            />

            <FormInput
              id="instagram"
              :model-value="instagram.value.value"
              label="Instagram Handle"
              type="text"
              placeholder="@username"
              :error="instagram.error.value"
              :touched="instagram.touched.value"
              @update:model-value="instagram.setValue"
              @blur="instagram.setTouched()"
            />

            <FormInput
              id="linkedin"
              :model-value="linkedin.value.value"
              label="LinkedIn"
              type="url"
              placeholder="https://linkedin.com/in/username"
              :error="linkedin.error.value"
              :touched="linkedin.touched.value"
              @update:model-value="linkedin.setValue"
              @blur="linkedin.setTouched()"
            />

            <FormInput
              id="github"
              :model-value="github.value.value"
              label="GitHub"
              type="url"
              placeholder="https://github.com/username"
              :error="github.error.value"
              :touched="github.touched.value"
              @update:model-value="github.setValue"
              @blur="github.setTouched()"
            />

            <FormInput
              id="discord"
              :model-value="discord.value.value"
              label="Discord Username"
              type="text"
              placeholder="@username"
              :error="discord.error.value"
              :touched="discord.touched.value"
              @update:model-value="discord.setValue"
              @blur="discord.setTouched()"
            />
          </UIExpandableSection>

          <FormButton
            type="submit"
            :disabled="form.isSubmitting.value || !form.isValid.value"
          >
            {{ form.isSubmitting.value ? 'Completing Setup...' : 'Complete Setup' }}
          </FormButton>
        </Form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { z } from 'zod'
import type { MembershipType } from '@prisma/client'

definePageMeta({
  middleware: ['auth', () => {
    const { user } = useUserSession()

    if (!user.value) {
      return navigateTo('/login')
    }

    // Ensure email is verified
    if (!user.value.emailVerified) {
      return navigateTo('/verify-email')
    }

    // If user has already completed setup, redirect to profile
    if (user.value.setupCompleted) {
      return navigateTo('/profile/me')
    }
  }],
  layout: 'default',
})

// Current year for validation
const currentYear = new Date().getFullYear()

// Load existing user data
const { data: userData } = await useFetch('/api/users/me')

// Extract initial values from user data
const getInitialValues = () => {
  const defaultValues = {
    name: '',
    bio: '',
    membershipType: 'UNKNOWN',
    studentId: '',
    gradYear: '',
    course: '',
    github: '',
    linkedin: '',
    facebook: '',
    instagram: '',
    discord: '',
  }

  if (!userData.value?.data?.user) {
    return defaultValues
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = userData.value.data.user as any
  const profile = user.profile
  const socialLinks = profile?.socialLinks

  return {
    name: profile?.name || '',
    bio: profile?.bio || '',
    membershipType: user.membership?.type || 'UNKNOWN',
    studentId: user.studentId || '',
    gradYear: profile?.gradYear ? String(profile.gradYear) : '',
    course: profile?.course || '',
    github: socialLinks?.github || '',
    linkedin: socialLinks?.linkedin || '',
    facebook: socialLinks?.facebook || '',
    instagram: socialLinks?.instagram || '',
    discord: socialLinks?.discord || '',
  }
}

// Membership options
const membershipOptions = [
  { label: 'Full Member', value: 'FULL' },
  { label: 'Associate Member', value: 'ASSOCIATE' },
  { label: 'Fellow', value: 'FELLOW' },
  { label: 'Alumni', value: 'ALUMNI' },
  { label: 'Guest', value: 'GUEST' },
]

// Setup schema with conditional validation
const setupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  bio: z.string().max(500, 'Bio too long').optional(),
  membershipType: z.enum(['FULL', 'ASSOCIATE', 'FELLOW', 'ALUMNI', 'GUEST', 'UNKNOWN'], {
    required_error: 'Please select a membership type',
  }).refine(val => val !== 'UNKNOWN', {
    message: 'Please select a membership type',
  }),
  studentId: z.string().max(20, 'Student ID too long').optional(),
  gradYear: z.string().optional(),
  course: z.string().max(100, 'Course name too long').optional(),
  github: z.string().url('Invalid GitHub URL').or(z.literal('')).optional(),
  linkedin: z.string().url('Invalid LinkedIn URL').or(z.literal('')).optional(),
  facebook: z.string().url('Invalid Facebook URL').or(z.literal('')).optional(),
  instagram: z.string().max(50, 'Instagram handle too long').optional(),
  discord: z.string().max(50, 'Discord username too long').optional(),
}).superRefine((data, ctx) => {
  // Validate graduation year if provided
  if (data.gradYear && data.gradYear !== '') {
    const year = parseInt(data.gradYear, 10)
    if (isNaN(year) || year < 1900 || year > currentYear + 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid graduation year',
        path: ['gradYear'],
      })
    }

    // Alumni can only have graduation years in the past
    if (data.membershipType === 'ALUMNI' && year > currentYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Alumni must have a graduation year in the past',
        path: ['gradYear'],
      })
    }
  }
})

const form = useForm({
  schema: setupSchema,
  initialValues: getInitialValues(),
  onSubmit: async (values) => {
    try {
      // Clean up social links - remove empty values
      const socialLinks: Record<string, string> = {}
      if (values.github) socialLinks.github = values.github
      if (values.linkedin) socialLinks.linkedin = values.linkedin
      if (values.facebook) socialLinks.facebook = values.facebook
      if (values.instagram) socialLinks.instagram = values.instagram
      if (values.discord) socialLinks.discord = values.discord

      const payload = {
        name: values.name,
        bio: values.bio || undefined,
        membershipType: values.membershipType as MembershipType,
        studentId: values.studentId || undefined,
        gradYear: values.gradYear && values.gradYear !== '' ? parseInt(values.gradYear, 10) : undefined,
        course: values.course || undefined,
        socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
      }

      await $fetch('/api/users/me?setup=true', {
        method: 'PATCH',
        body: payload,
      })

      // Refresh auth state and redirect
      const { refresh } = useAuth()
      await refresh()

      await navigateTo('/')
    }
    catch (error: unknown) {
      console.error('Setup submission error:', error)
      const errorData = error as { data?: { message?: string } }
      form.setFormError(errorData?.data?.message || 'Setup failed. Please try again.')
    }
  },
})

// Register form fields
const name = form.register('name', '')
const bio = form.register('bio', '')
const membershipType = form.register('membershipType', '')
const studentId = form.register('studentId', '')
const gradYear = form.register('gradYear', '')
const course = form.register('course', '')
const github = form.register('github', '')
const linkedin = form.register('linkedin', '')
const facebook = form.register('facebook', '')
const instagram = form.register('instagram', '')
const discord = form.register('discord', '')

// Computed properties for conditional rendering and validation
const showStudentId = computed(() => {
  const membershipTypeValue = membershipType.value.value
  return membershipTypeValue && membershipTypeValue !== 'GUEST' && membershipTypeValue !== 'UNKNOWN'
})

const showCourseAndGradYear = computed(() => {
  const membershipTypeValue = membershipType.value.value
  return membershipTypeValue && membershipTypeValue !== 'GUEST' && membershipTypeValue !== 'UNKNOWN'
})

const gradYearLabel = computed(() => {
  const membershipTypeValue = membershipType.value.value
  switch (membershipTypeValue) {
    case 'ALUMNI':
      return 'Graduation Year'
    case 'FULL':
    case 'ASSOCIATE':
    case 'FELLOW':
      return 'Expected Graduation Year (Optional)'
    default:
      return 'Graduation Year (Optional)'
  }
})

const gradYearPlaceholder = computed(() => {
  const membershipTypeValue = membershipType.value.value
  switch (membershipTypeValue) {
    case 'ALUMNI':
    case 'FELLOW':
      return 'e.g. 2020'
    case 'FULL':
    case 'ASSOCIATE':
      return `e.g. ${currentYear + 2}`
    default:
      return `e.g. ${currentYear}`
  }
})

const gradYearMin = computed(() => {
  return 1900
})

const gradYearMax = computed(() => {
  const membershipTypeValue = membershipType.value.value
  if (membershipTypeValue === 'ALUMNI') {
    return currentYear
  }
  return currentYear + 5
})
</script>

<style scoped>
.setup-account-container {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: 100vh;
  padding: 2rem 1rem;
  background: var(--primary-bg-color);
}

.setup-account {
  max-width: 700px;
  width: 100%;
  background: var(--secondary-bg-color);
  border-radius: var(--border-radius);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border: 2px solid var(--nnt-orange);
  padding: 2.5rem;
  margin-top: 2rem;
}

.setup-account__title {
  text-align: center;
  margin-bottom: 0.5rem;
  color: var(--primary-text-color);
  font-size: 2rem;
  font-weight: 600;
}

.setup-account__description {
  text-align: center;
  margin-bottom: 2rem;
  color: var(--secondary-text-color);
  font-size: 1.1rem;
}

.setup-account__content {
  margin-top: 1.5rem;
}

.form-section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: var(--header-bg-color);
  border-radius: var(--border-radius);
  border: 1px solid var(--border-color);
}

.form-section__title {
  margin: 0 0 1rem 0;
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--primary-text-color);
}

.form-section__description {
  margin: 0 0 1.5rem 0;
  font-size: 0.9rem;
  color: var(--secondary-text-color);
}

/* Remove background from first section to match the design */
.form-section:first-child {
  background: transparent;
  border: none;
  padding: 0;
  margin-bottom: 1.5rem;
}

/* Responsive design */
@media (max-width: 768px) {
  .setup-account-container {
    padding: 1rem;
  }

  .setup-account {
    padding: 1.5rem;
    margin-top: 1rem;
  }

  .setup-account__title {
    font-size: 1.5rem;
  }

  .form-section {
    padding: 1rem;
  }
}
</style>
