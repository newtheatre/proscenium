<template>
  <div class="user-detail">
    <header class="user-detail__header">
      <div class="user-detail__title-section">
        <h1 class="user-detail__title">
          User Details
        </h1>
        <div class="user-detail__actions">
          <UIButton
            variant="secondary"
            @click="navigateTo('/admin/users')"
          >
            Back to Users
          </UIButton>
          <UIButton
            variant="primary"
            @click="navigateTo(`/admin/users/${userId}/edit`)"
          >
            Edit User
          </UIButton>
        </div>
      </div>
    </header>

    <div
      v-if="pending"
      class="user-detail__loading"
    >
      <LoadingSpinner />
    </div>

    <div
      v-else-if="error"
      class="user-detail__error"
    >
      <AppAlert type="error">
        {{ error.statusMessage || 'Failed to load user details' }}
      </AppAlert>
    </div>

    <div
      v-else-if="user"
      class="user-detail__content"
    >
      <!-- User Status Cards -->
      <div class="user-detail__status-cards">
        <div class="status-card">
          <h3 class="status-card__title">
            Account Status
          </h3>
          <div class="status-card__content">
            <div class="status-item">
              <span class="status-item__label">Active:</span>
              <UIStatusBadge
                :variant="userStatus?.active.variant"
                :label="userStatus?.active.label"
              />
            </div>
            <div class="status-item">
              <span class="status-item__label">Email Verified:</span>
              <UIStatusBadge
                :variant="userStatus?.emailVerified.variant"
                :label="userStatus?.emailVerified.label"
              />
            </div>
            <div class="status-item">
              <span class="status-item__label">Setup Complete:</span>
              <UIStatusBadge
                :variant="userStatus?.setupCompleted.variant"
                :label="userStatus?.setupCompleted.label"
              />
            </div>
          </div>
        </div>

        <div class="status-card">
          <h3 class="status-card__title">
            Membership
          </h3>
          <div class="status-card__content">
            <div class="status-item">
              <span class="status-item__label">Type:</span>
              <UIStatusBadge
                variant="info"
                :label="formatMembershipType(user.membership?.type)"
              />
            </div>
            <div
              v-if="user.membership?.expiry"
              class="status-item"
            >
              <span class="status-item__label">Expires:</span>
              <span class="status-item__value">
                {{ formatDate(user.membership.expiry) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- User Information -->
      <div class="user-detail__sections">
        <!-- Basic Information -->
        <UIDetailSection title="Basic Information">
          <UIDetailGrid>
            <UIDetailItem
              label="Email"
              :value="user.email"
            />
            <UIDetailItem
              label="Student ID"
              :value="user.studentId"
            />
            <UIDetailItem label="Roles">
              <ProfileRoleBadges :roles="user.roles" />
            </UIDetailItem>
          </UIDetailGrid>
        </UIDetailSection>

        <!-- Profile Information -->
        <UIDetailSection
          v-if="user.profile"
          title="Profile Information"
        >
          <UIDetailGrid>
            <UIDetailItem
              label="Name"
              :value="user.profile.name"
            />
            <UIDetailItem
              v-if="user.profile.bio"
              label="Bio"
              :value="user.profile.bio"
              full-width
            />
            <UIDetailItem
              v-if="user.profile.gradYear"
              label="Graduation Year"
              :value="user.profile.gradYear"
            />
            <UIDetailItem
              v-if="user.profile.course"
              label="Course"
              :value="user.profile.course"
            />
          </UIDetailGrid>

          <ProfileSocialLinks :social-links="user.profile.socialLinks" />
        </UIDetailSection>

        <!-- Account Actions -->
        <UIDetailSection title="Account Actions">
          <div class="action-buttons">
            <UIButton
              variant="outlined"
              :loading="sendingPasswordReset"
              @click="sendPasswordReset"
            >
              Send Password Reset Email
            </UIButton>
          </div>
        </UIDetailSection>

        <!-- Metadata -->
        <UIDetailSection title="Metadata">
          <UIDetailGrid>
            <UIDetailItem
              label="Created"
              :value="formatDateTime(user.createdAt)"
            />
            <UIDetailItem
              label="Last Updated"
              :value="formatDateTime(user.updatedAt)"
            />
            <UIDetailItem
              v-if="user.lastLogin"
              label="Last Login"
              :value="formatDateTime(user.lastLogin)"
            />
            <UIDetailItem
              v-if="user.setupCompletedAt"
              label="Setup Completed"
              :value="formatDateTime(user.setupCompletedAt)"
            />
          </UIDetailGrid>
        </UIDetailSection>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { UserResponse } from '../../../../../shared/types/api'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const route = useRoute()
const userId = route.params.id as string

// Fetch user data
const { data: response, pending, error } = await useFetch<UserResponse>(`/api/users/${userId}`)

// Extract user from response
const user = computed(() => response.value?.data?.user)

// Password reset functionality
const sendingPasswordReset = ref(false)
const sendPasswordReset = async () => {
  if (!user.value) return

  sendingPasswordReset.value = true
  try {
    await $fetch('/api/auth/password/reset', {
      method: 'POST',
      body: {
        email: user.value.email,
      },
    })

    // Show success message (you might want to use a toast notification)
    alert('Password reset email sent successfully!')
  }
  catch (error) {
    console.error('Failed to send password reset email:', error)
    alert('Failed to send password reset email. Please try again.')
  }
  finally {
    sendingPasswordReset.value = false
  }
}

// Use shared formatters
const { formatMembershipType, formatDate, formatDateTime, formatUserStatus } = useFormatters()

// Computed status for badges
const userStatus = computed(() => {
  if (!user.value) return null
  return formatUserStatus(user.value)
})
</script>

<style scoped>
.user-detail {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--spacing-lg);
}

.user-detail__header {
  margin-bottom: var(--spacing-xl);
}

.user-detail__title-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacing-md);
}

.user-detail__title {
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0;
}

.user-detail__actions {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.user-detail__loading,
.user-detail__error {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}

.user-detail__status-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-xl);
}

.status-card {
  background: var(--secondary-bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: var(--spacing-md);
}

.status-card__title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0 0 var(--spacing-md) 0;
}

.status-card__content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status-item__label {
  font-weight: 500;
  color: var(--text-muted);
}

.status-item__value {
  color: var(--primary-text-color);
}

.user-detail__sections {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xl);
}

.text-muted {
  color: var(--text-muted);
  font-style: italic;
}

.action-buttons {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .user-detail {
    padding: var(--spacing-md);
  }

  .user-detail__title-section {
    flex-direction: column;
    align-items: flex-start;
  }

  .user-detail__status-cards {
    grid-template-columns: 1fr;
  }
}
</style>
