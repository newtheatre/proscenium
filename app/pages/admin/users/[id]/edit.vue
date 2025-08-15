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
        :error="form.formError.value"
        @submit="form.handleSubmit"
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
                v-model="emailField"
                label="Email"
                type="email"
                autocomplete="off"
                required
              />

              <FormInput
                id="studentId"
                v-model="studentIdField"
                label="Student ID"
              />

              <FormInput
                id="password"
                v-model="passwordField"
                label="New Password"
                type="password"
                autocomplete="new-password"
                placeholder="Leave empty to keep current password"
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
                v-model="emailVerifiedField"
                label="Email Verified"
              />

              <FormCheckbox
                id="setupCompleted"
                v-model="setupCompletedField"
                label="Setup Completed"
              />

              <FormCheckbox
                id="isActive"
                v-model="isActiveField"
                label="Account Active"
              />
            </div>
          </section>

          <!-- Roles -->
          <section class="form-section">
            <h2 class="form-section__title">
              Roles
            </h2>
            <div class="form-grid">
              <FormCheckbox
                v-for="role in availableRoles"
                :id="`role-${role}`"
                :key="role"
                :model-value="roleFields[role].value"
                :label="role"
                @update:model-value="(value: boolean) => roleFields[role].value = value"
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
                v-model="membershipTypeField"
                label="Membership Type"
                :options="membershipOptions"
              />

              <FormDate
                id="membershipExpiry"
                v-model="membershipExpiryField"
                label="Membership Expiry"
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
                v-model="profileNameField"
                label="Full Name"
              />

              <FormInput
                id="profileCourse"
                v-model="profileCourseField"
                label="Course"
              />

              <FormInput
                id="profileGradYear"
                v-model="profileGradYearField"
                label="Graduation Year"
                type="number"
              />

              <FormInput
                id="profileAvatar"
                v-model="profileAvatarField"
                label="Avatar URL"
                type="url"
              />
            </div>

            <FormTextarea
              id="profileBio"
              v-model="profileBioField"
              label="Bio"
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
                v-model="socialGithubField"
                label="GitHub URL"
                type="url"
              />

              <FormInput
                id="socialLinkedin"
                v-model="socialLinkedinField"
                label="LinkedIn URL"
                type="url"
              />

              <FormInput
                id="socialFacebook"
                v-model="socialFacebookField"
                label="Facebook URL"
                type="url"
              />

              <FormInput
                id="socialDiscord"
                v-model="socialDiscordField"
                label="Discord Username"
              />

              <FormInput
                id="socialInstagram"
                v-model="socialInstagramField"
                label="Instagram Handle"
              />
            </div>
          </section>
        </div>

        <div class="form-actions">
          <UIButton
            type="submit"
            variant="primary"
            :loading="form.isSubmitting.value"
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
import type { RoleType } from '@prisma/client'
import type { UserResponse } from '~~/shared/types/api'
import { parseDateFromApi, formatDateForApi } from '~/utils/dates'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const route = useRoute()
const userId = route.params.id as string

// Available options - dynamic roles from Prisma schema
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
const { data: response, pending, error: fetchError } = await useFetch<UserResponse>(`/api/users/${userId}`)

// Extract user from response
const user = computed(() => response.value?.data?.user)

// Initialize form with default values
const defaultFormData = {
  email: response.value?.data?.user?.email || '',
  studentId: response.value?.data?.user?.studentId || '',
  password: '',
  emailVerified: response.value?.data?.user?.emailVerified || false,
  setupCompleted: response.value?.data?.user?.setupCompleted || false,
  isActive: response.value?.data?.user?.isActive ?? true,
  roles: response.value?.data?.user?.roles || [],
  membership: {
    type: response.value?.data?.user?.membership?.type || 'UNKNOWN',
    expiry: parseDateFromApi(response.value?.data?.user?.membership?.expiry),
  },
  profile: {
    name: response.value?.data?.user?.profile?.name || '',
    bio: response.value?.data?.user?.profile?.bio || '',
    avatar: response.value?.data?.user?.profile?.avatar || '',
    gradYear: response.value?.data?.user?.profile?.gradYear?.toString() || '',
    course: response.value?.data?.user?.profile?.course || '',
    socialLinks: {
      github: response.value?.data?.user?.profile?.socialLinks?.github || '',
      linkedin: response.value?.data?.user?.profile?.socialLinks?.linkedin || '',
      facebook: response.value?.data?.user?.profile?.socialLinks?.facebook || '',
      discord: response.value?.data?.user?.profile?.socialLinks?.discord || '',
      instagram: response.value?.data?.user?.profile?.socialLinks?.instagram || '',
    },
  },
}

// Form submission handler
const handleFormSubmit = async (_values: typeof defaultFormData, changedValues?: Partial<typeof defaultFormData>) => {
  const changes = changedValues || {}

  console.log('Submitting user update (only changed fields):', changes)
  console.log('Changes detected:', Object.keys(changes).length, 'fields changed')

  // Only make API call if there are actual changes
  if (Object.keys(changes).length === 0) {
    await navigateTo(`/admin/users/${userId}`)
    return
  }

  // Transform the data for API
  const updateData: Record<string, unknown> = {}

  Object.entries(changes).forEach(([key, value]) => {
    if (key === 'membership' && value) {
      const membership = value as typeof defaultFormData['membership']
      updateData.membership = {
        type: membership.type,
        expiry: formatDateForApi(membership.expiry),
      }
    }
    else if (key === 'profile' && value) {
      const profile = value as typeof defaultFormData['profile']
      const profileUpdate: Record<string, unknown> = { ...profile }
      if (profile.gradYear) {
        profileUpdate.gradYear = parseInt(profile.gradYear)
      }
      updateData.profile = profileUpdate
    }
    else {
      updateData[key] = value
    }
  })

  await $fetch(`/api/users/${userId}`, {
    method: 'PATCH',
    body: updateData,
  })

  // Navigate back to user detail page on success
  await navigateTo(`/admin/users/${userId}`)
}

// Initialize useForm
const form = useForm({
  schema: adminUserEditFormSchema,
  initialValues: defaultFormData,
  onSubmit: handleFormSubmit,
})

// Create reactive form fields (including nested paths)
const emailField = form.reactiveField('email')
const studentIdField = form.reactiveField('studentId')
const passwordField = form.reactiveField('password')
const emailVerifiedField = form.reactiveField<boolean>('emailVerified')
const setupCompletedField = form.reactiveField<boolean>('setupCompleted')
const isActiveField = form.reactiveField<boolean>('isActive')
const rolesField = form.reactiveField<RoleType[]>('roles', [])
const membershipTypeField = form.reactiveField('membership.type')
const membershipExpiryField = form.reactiveField<Date | null>('membership.expiry', null)
const profileNameField = form.reactiveField('profile.name')
const profileBioField = form.reactiveField('profile.bio')
const profileAvatarField = form.reactiveField('profile.avatar')
const profileGradYearField = form.reactiveField('profile.gradYear')
const profileCourseField = form.reactiveField('profile.course')
const socialGithubField = form.reactiveField('profile.socialLinks.github')
const socialLinkedinField = form.reactiveField('profile.socialLinks.linkedin')
const socialFacebookField = form.reactiveField('profile.socialLinks.facebook')
const socialDiscordField = form.reactiveField('profile.socialLinks.discord')
const socialInstagramField = form.reactiveField('profile.socialLinks.instagram')

// Dynamic role field creation - creates computed v-model compatible fields for each role
const roleFields = availableRoles.reduce((fields, role) => {
  fields[role] = computed({
    get: () => (rolesField.value.value || []).includes(role),
    set: (checked: boolean) => {
      const currentRoles = rolesField.value.value || []
      if (checked) {
        rolesField.value.value = currentRoles.includes(role) ? currentRoles : [...currentRoles, role]
      }
      else {
        rolesField.value.value = currentRoles.filter(r => r !== role)
      }
    },
  })
  return fields
}, {} as Record<RoleType, WritableComputedRef<boolean>>)
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
