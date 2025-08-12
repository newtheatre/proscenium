<template>
  <div class="user-edit">
    <header class="user-edit__header">
      <div class="user-edit__title-section">
        <h1 class="user-edit__title">
          Edit User
        </h1>
        <div class="user-edit__actions">
          <UIButton
            variant="secondary"
            @click="navigateTo(`/admin/users/${userId}`)"
          >
            Cancel
          </UIButton>
        </div>
      </div>
    </header>

    <div
      v-if="pending"
      class="user-edit__loading"
    >
      <LoadingSpinner />
    </div>

    <div
      v-else-if="fetchError"
      class="user-edit__error"
    >
      <AppAlert type="error">
        {{ fetchError.statusMessage || 'Failed to load user details' }}
      </AppAlert>
    </div>

    <div
      v-else-if="user"
      class="user-edit__content"
    >
      <Form
        :error="submitError"
        @submit="handleSubmit"
      >
        <div class="form-sections">
          <!-- Basic Information -->
          <section class="form-section">
            <h2 class="form-section__title">
              Basic Information
            </h2>
            <div class="form-grid">
              <FormInput
                id="email"
                v-model="formData.email"
                label="Email"
                type="email"
                :error="validationErrors.email"
                :touched="touchedFields.email"
                required
              />

              <FormInput
                id="studentId"
                v-model="formData.studentId"
                label="Student ID"
                :error="validationErrors.studentId"
                :touched="touchedFields.studentId"
              />

              <FormInput
                id="password"
                v-model="formData.password"
                label="New Password"
                type="password"
                placeholder="Leave empty to keep current password"
                :error="validationErrors.password"
                :touched="touchedFields.password"
              />
            </div>
          </section>

          <!-- Account Status -->
          <section class="form-section">
            <h2 class="form-section__title">
              Account Status
            </h2>
            <div class="form-grid">
              <FormCheckbox
                id="emailVerified"
                v-model="formData.emailVerified"
                label="Email Verified"
                :touched="touchedFields.emailVerified"
              />

              <FormCheckbox
                id="setupCompleted"
                v-model="formData.setupCompleted"
                label="Setup Completed"
                :touched="touchedFields.setupCompleted"
              />

              <FormCheckbox
                id="isActive"
                v-model="formData.isActive"
                label="Account Active"
                :touched="touchedFields.isActive"
              />
            </div>
          </section>

          <!-- Roles -->
          <section class="form-section">
            <h2 class="form-section__title">
              Roles
            </h2>
            <div class="role-checkboxes">
              <FormCheckbox
                v-for="role in availableRoles"
                :id="`role-${role}`"
                :key="role"
                :model-value="formData.roles.includes(role)"
                :label="role"
                @update:model-value="toggleRole(role, $event)"
              />
            </div>
          </section>

          <!-- Membership -->
          <section class="form-section">
            <h2 class="form-section__title">
              Membership
            </h2>
            <div class="form-grid">
              <FormSelect
                id="membershipType"
                v-model="formData.membership.type"
                label="Membership Type"
                :options="membershipOptions"
                :error="validationErrors['membership.type']"
                :touched="touchedFields['membership.type']"
              />

              <FormDate
                id="membershipExpiry"
                v-model="formData.membership.expiry"
                label="Membership Expiry"
                :error="validationErrors['membership.expiry']"
                :touched="touchedFields['membership.expiry']"
              />
            </div>
          </section>

          <!-- Profile Information -->
          <section class="form-section">
            <h2 class="form-section__title">
              Profile Information
            </h2>
            <div class="form-grid">
              <FormInput
                id="profileName"
                v-model="formData.profile.name"
                label="Full Name"
                :error="validationErrors['profile.name']"
                :touched="touchedFields['profile.name']"
              />

              <FormInput
                id="profileCourse"
                v-model="formData.profile.course"
                label="Course"
                :error="validationErrors['profile.course']"
                :touched="touchedFields['profile.course']"
              />

              <FormInput
                id="profileGradYear"
                v-model="formData.profile.gradYear"
                label="Graduation Year"
                type="number"
                :error="validationErrors['profile.gradYear']"
                :touched="touchedFields['profile.gradYear']"
              />

              <FormInput
                id="profileAvatar"
                v-model="formData.profile.avatar"
                label="Avatar URL"
                type="url"
                :error="validationErrors['profile.avatar']"
                :touched="touchedFields['profile.avatar']"
              />
            </div>

            <FormTextarea
              id="profileBio"
              v-model="formData.profile.bio"
              label="Bio"
              :error="validationErrors['profile.bio']"
              :touched="touchedFields['profile.bio']"
              :rows="4"
            />
          </section>

          <!-- Social Links -->
          <section class="form-section">
            <h2 class="form-section__title">
              Social Links
            </h2>
            <div class="form-grid">
              <FormInput
                id="socialGithub"
                v-model="formData.profile.socialLinks.github"
                label="GitHub URL"
                type="url"
                :error="validationErrors['profile.socialLinks.github']"
                :touched="touchedFields['profile.socialLinks.github']"
              />

              <FormInput
                id="socialLinkedin"
                v-model="formData.profile.socialLinks.linkedin"
                label="LinkedIn URL"
                type="url"
                :error="validationErrors['profile.socialLinks.linkedin']"
                :touched="touchedFields['profile.socialLinks.linkedin']"
              />

              <FormInput
                id="socialFacebook"
                v-model="formData.profile.socialLinks.facebook"
                label="Facebook URL"
                type="url"
                :error="validationErrors['profile.socialLinks.facebook']"
                :touched="touchedFields['profile.socialLinks.facebook']"
              />

              <FormInput
                id="socialDiscord"
                v-model="formData.profile.socialLinks.discord"
                label="Discord Handle"
                :error="validationErrors['profile.socialLinks.discord']"
                :touched="touchedFields['profile.socialLinks.discord']"
              />

              <FormInput
                id="socialInstagram"
                v-model="formData.profile.socialLinks.instagram"
                label="Instagram Handle"
                :error="validationErrors['profile.socialLinks.instagram']"
                :touched="touchedFields['profile.socialLinks.instagram']"
              />
            </div>
          </section>
        </div>

        <div class="form-actions">
          <UIButton
            type="submit"
            variant="primary"
            :loading="submitting"
          >
            Save Changes
          </UIButton>
          <UIButton
            type="button"
            variant="secondary"
            @click="navigateTo(`/admin/users/${userId}`)"
          >
            Cancel
          </UIButton>
        </div>
      </Form>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { MembershipType, RoleType } from '@prisma/client'

interface UserResponse {
  user: {
    id: string
    email: string
    studentId?: string
    emailVerified: boolean
    setupCompleted: boolean
    isActive: boolean
    roles: string[]
    membership?: {
      type: MembershipType
      expiry?: string
    }
    profile?: {
      name: string
      bio?: string
      avatar?: string
      gradYear?: number
      course?: string
      socialLinks?: {
        github?: string
        linkedin?: string
        facebook?: string
        discord?: string
        instagram?: string
      }
    }
    createdAt: string
    updatedAt: string
    lastLogin?: string
    setupCompletedAt?: string
  }
}

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const route = useRoute()
const userId = route.params.id as string

// Available options
const availableRoles: RoleType[] = ['ADMIN', 'MANAGER', 'TRAINER']
const membershipOptions = [
  { label: 'Full', value: 'FULL' },
  { label: 'Associate', value: 'ASSOCIATE' },
  { label: 'Fellow', value: 'FELLOW' },
  { label: 'Alumni', value: 'ALUMNI' },
  { label: 'Guest', value: 'GUEST' },
  { label: 'Unknown', value: 'UNKNOWN' },
]

// Fetch user data
const { data: user, pending, error: fetchError } = await useFetch(`/api/users/${userId}`, {
  transform: (data: UserResponse) => data.user,
})

// Form state
const formData = ref({
  email: '',
  studentId: '',
  password: '',
  emailVerified: false,
  setupCompleted: false,
  isActive: true,
  roles: [] as RoleType[],
  membership: {
    type: 'UNKNOWN' as MembershipType,
    expiry: '',
  },
  profile: {
    name: '',
    bio: '',
    avatar: '',
    gradYear: '',
    course: '',
    socialLinks: {
      github: '',
      linkedin: '',
      facebook: '',
      discord: '',
      instagram: '',
    },
  },
})

const touchedFields = ref<Record<string, boolean>>({})
const validationErrors = ref<Record<string, string>>({})
const submitError = ref('')
const submitting = ref(false)

// Store original user data for change detection
const originalData = ref<typeof formData.value | null>(null)

// Initialize form data when user is loaded
watch(user, (newUser) => {
  if (newUser) {
    const userData = {
      email: newUser.email || '',
      studentId: newUser.studentId || '',
      password: '',
      emailVerified: newUser.emailVerified || false,
      setupCompleted: newUser.setupCompleted || false,
      isActive: newUser.isActive ?? true,
      roles: (newUser.roles || []) as RoleType[],
      membership: {
        type: newUser.membership?.type || 'UNKNOWN',
        expiry: newUser.membership?.expiry || '',
      },
      profile: {
        name: newUser.profile?.name || '',
        bio: newUser.profile?.bio || '',
        avatar: newUser.profile?.avatar || '',
        gradYear: newUser.profile?.gradYear?.toString() || '',
        course: newUser.profile?.course || '',
        socialLinks: {
          github: newUser.profile?.socialLinks?.github || '',
          linkedin: newUser.profile?.socialLinks?.linkedin || '',
          facebook: newUser.profile?.socialLinks?.facebook || '',
          discord: newUser.profile?.socialLinks?.discord || '',
          instagram: newUser.profile?.socialLinks?.instagram || '',
        },
      },
    }

    formData.value = { ...userData }
    // Store original data for change detection with deep copy and null/empty string normalization
    const normalizedUserData = JSON.parse(JSON.stringify({ ...userData, password: '' }))
    // Convert null values to empty strings for form display consistency
    if (normalizedUserData.profile) {
      normalizedUserData.profile.bio = normalizedUserData.profile.bio ?? ''
      normalizedUserData.profile.avatar = normalizedUserData.profile.avatar ?? ''
      normalizedUserData.profile.course = normalizedUserData.profile.course ?? ''
    }
    if (normalizedUserData.socialLinks) {
      Object.keys(normalizedUserData.socialLinks).forEach((key) => {
        if (normalizedUserData.socialLinks[key] === null) {
          normalizedUserData.socialLinks[key] = ''
        }
      })
    }
    originalData.value = normalizedUserData
  }
}, { immediate: true })

// Role management
const toggleRole = (role: RoleType, checked: boolean) => {
  if (checked) {
    if (!formData.value.roles.includes(role)) {
      formData.value.roles.push(role)
    }
  }
  else {
    const index = formData.value.roles.indexOf(role)
    if (index > -1) {
      formData.value.roles.splice(index, 1)
    }
  }
}

// Form submission
const handleSubmit = async () => {
  submitting.value = true
  submitError.value = ''
  validationErrors.value = {}

  try {
    // Only proceed if we have original data to compare against
    if (!originalData.value) {
      throw new Error('Original user data not available')
    }

    const updateData: Record<string, unknown> = {}
    const current = formData.value
    const original = originalData.value

    // Check for changes in basic fields
    if (current.email !== original.email) {
      updateData.email = current.email
    }
    if (current.studentId !== original.studentId) {
      updateData.studentId = current.studentId || null
    }
    if (current.emailVerified !== original.emailVerified) {
      updateData.emailVerified = current.emailVerified
    }
    if (current.setupCompleted !== original.setupCompleted) {
      updateData.setupCompleted = current.setupCompleted
    }
    if (current.isActive !== original.isActive) {
      updateData.isActive = current.isActive
    }

    // Check for changes in roles (compare arrays)
    if (JSON.stringify(current.roles.sort()) !== JSON.stringify(original.roles.sort())) {
      updateData.roles = current.roles
    }

    // Always include password if provided (it's not in original data)
    if (current.password) {
      updateData.password = current.password
    }

    // Check for changes in membership
    if (current.membership.type !== original.membership.type
      || current.membership.expiry !== original.membership.expiry) {
      const membershipUpdate: Record<string, unknown> = {
        type: current.membership.type,
      }

      if (current.membership.expiry) {
        // Convert YYYY-MM-DD to ISO datetime string
        const expiryDate = new Date(current.membership.expiry + 'T23:59:59.999Z')
        membershipUpdate.expiry = expiryDate.toISOString()
      }
      else {
        membershipUpdate.expiry = null
      }

      updateData.membership = membershipUpdate
    }

    // Check for changes in profile
    const profileChanges: Record<string, unknown> = {}

    if (current.profile.name !== original.profile.name) {
      profileChanges.name = current.profile.name
    }
    if (current.profile.bio !== original.profile.bio) {
      profileChanges.bio = current.profile.bio
    }
    if (current.profile.avatar !== original.profile.avatar) {
      profileChanges.avatar = current.profile.avatar
    }
    if (current.profile.gradYear !== original.profile.gradYear) {
      profileChanges.gradYear = current.profile.gradYear ? parseInt(current.profile.gradYear) : null
    }
    if (current.profile.course !== original.profile.course) {
      profileChanges.course = current.profile.course
    }

    // Check for changes in social links
    const socialLinksChanges: Record<string, string | null> = {}
    const currentSocial = current.profile.socialLinks
    const originalSocial = original.profile.socialLinks

    if (currentSocial.github !== originalSocial.github) {
      socialLinksChanges.github = currentSocial.github
    }
    if (currentSocial.linkedin !== originalSocial.linkedin) {
      socialLinksChanges.linkedin = currentSocial.linkedin
    }
    if (currentSocial.facebook !== originalSocial.facebook) {
      socialLinksChanges.facebook = currentSocial.facebook
    }
    if (currentSocial.discord !== originalSocial.discord) {
      socialLinksChanges.discord = currentSocial.discord
    }
    if (currentSocial.instagram !== originalSocial.instagram) {
      socialLinksChanges.instagram = currentSocial.instagram
    }

    if (Object.keys(socialLinksChanges).length > 0) {
      profileChanges.socialLinks = socialLinksChanges
    }

    if (Object.keys(profileChanges).length > 0) {
      updateData.profile = profileChanges
    }

    console.log('Submitting user update (only changed fields):', updateData)
    console.log('Changes detected:', Object.keys(updateData).length, 'fields changed')

    // Only make API call if there are actual changes
    if (Object.keys(updateData).length === 0) {
      await navigateTo(`/admin/users/${userId}`)
      return
    }

    await $fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      body: updateData,
    })

    // Navigate back to user detail page on success
    await navigateTo(`/admin/users/${userId}`)
  }
  catch (error: unknown) {
    console.error('Failed to update user:', error)

    if (error && typeof error === 'object' && 'data' in error) {
      console.error('Error data:', error.data)
      console.error('Full error object:', JSON.stringify(error, null, 2))

      const errorWithData = error as {
        data?: {
          data?: Array<{ path: string[], message: string }>
          statusMessage?: string
        }
      }
      if (errorWithData.data?.data) {
        // Handle Zod validation errors
        const issues = errorWithData.data.data
        const errors: Record<string, string> = {}
        const touched: Record<string, boolean> = {}

        console.log('Validation errors from API:', issues)

        for (const issue of issues) {
          const path = issue.path.join('.')
          errors[path] = issue.message
          touched[path] = true
          console.log(`Validation error for ${path}: ${issue.message}`)
        }

        validationErrors.value = errors
        // Mark fields with errors as touched so they display
        touchedFields.value = { ...touchedFields.value, ...touched }

        console.log('Updated validationErrors:', validationErrors.value)
        console.log('Updated touchedFields:', touchedFields.value)

        // Scroll to first error field
        setTimeout(() => {
          const firstErrorField = document.querySelector('.form-input--error, .form-select--error, .form-date--error')
          if (firstErrorField) {
            firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }, 100)
      }
      else {
        submitError.value = errorWithData.data?.statusMessage || 'Failed to update user. Please try again.'
        console.log('Setting submit error:', submitError.value)
      }
    }
    else {
      submitError.value = 'Failed to update user. Please try again.'
      console.log('Setting generic submit error:', submitError.value)
    }
  }
  finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.user-edit {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.user-edit__header {
  margin-bottom: 32px;
}

.user-edit__title-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.user-edit__title {
  font-size: 28px;
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0;
}

.user-edit__actions {
  display: flex;
  gap: 12px;
}

.user-edit__loading,
.user-edit__error {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}

.form-sections {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.form-section {
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 24px;
}

.form-section__title {
  font-size: 20px;
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0 0 20px 0;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.role-checkboxes {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
  margin-top: 32px;
}

@media (max-width: 768px) {
  .user-edit {
    padding: 16px;
  }

  .user-edit__title-section {
    flex-direction: column;
    align-items: flex-start;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-actions {
    flex-direction: column-reverse;
  }
}
</style>
