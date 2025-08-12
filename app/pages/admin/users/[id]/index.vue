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
              <span :class="['status-badge', user.isActive ? 'status-badge--success' : 'status-badge--error']">
                {{ user.isActive ? 'Yes' : 'No' }}
              </span>
            </div>
            <div class="status-item">
              <span class="status-item__label">Email Verified:</span>
              <span :class="['status-badge', user.emailVerified ? 'status-badge--success' : 'status-badge--warning']">
                {{ user.emailVerified ? 'Yes' : 'No' }}
              </span>
            </div>
            <div class="status-item">
              <span class="status-item__label">Setup Complete:</span>
              <span :class="['status-badge', user.setupCompleted ? 'status-badge--success' : 'status-badge--warning']">
                {{ user.setupCompleted ? 'Yes' : 'No' }}
              </span>
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
              <span class="status-badge status-badge--info">
                {{ formatMembershipType(user.membership?.type) }}
              </span>
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
        <section class="detail-section">
          <h2 class="detail-section__title">
            Basic Information
          </h2>
          <div class="detail-section__content">
            <div class="detail-grid">
              <div class="detail-item">
                <label class="detail-label">Email</label>
                <div class="detail-value">
                  {{ user.email }}
                </div>
              </div>
              <div class="detail-item">
                <label class="detail-label">Student ID</label>
                <div class="detail-value">
                  {{ user.studentId || 'Not set' }}
                </div>
              </div>
              <div class="detail-item">
                <label class="detail-label">Roles</label>
                <div class="detail-value">
                  <span
                    v-if="user.roles.length === 0"
                    class="text-muted"
                  >User</span>
                  <div
                    v-else
                    class="role-badges"
                  >
                    <span
                      v-for="role in user.roles"
                      :key="role"
                      class="role-badge"
                    >
                      {{ role }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Profile Information -->
        <section
          v-if="user.profile"
          class="detail-section"
        >
          <h2 class="detail-section__title">
            Profile Information
          </h2>
          <div class="detail-section__content">
            <div class="detail-grid">
              <div class="detail-item">
                <label class="detail-label">Name</label>
                <div class="detail-value">
                  {{ user.profile.name }}
                </div>
              </div>
              <div
                v-if="user.profile.bio"
                class="detail-item detail-item--full"
              >
                <label class="detail-label">Bio</label>
                <div class="detail-value">
                  {{ user.profile.bio }}
                </div>
              </div>
              <div
                v-if="user.profile.gradYear"
                class="detail-item"
              >
                <label class="detail-label">Graduation Year</label>
                <div class="detail-value">
                  {{ user.profile.gradYear }}
                </div>
              </div>
              <div
                v-if="user.profile.course"
                class="detail-item"
              >
                <label class="detail-label">Course</label>
                <div class="detail-value">
                  {{ user.profile.course }}
                </div>
              </div>
            </div>

            <!-- Social Links -->
            <div
              v-if="user.profile.socialLinks && hasSocialLinks(user.profile.socialLinks)"
              class="social-links"
            >
              <h3 class="social-links__title">
                Social Links
              </h3>
              <div class="social-links__grid">
                <a
                  v-if="user.profile.socialLinks.github"
                  :href="user.profile.socialLinks.github"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="social-link"
                >
                  GitHub
                </a>
                <a
                  v-if="user.profile.socialLinks.linkedin"
                  :href="user.profile.socialLinks.linkedin"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="social-link"
                >
                  LinkedIn
                </a>
                <a
                  v-if="user.profile.socialLinks.facebook"
                  :href="user.profile.socialLinks.facebook"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="social-link"
                >
                  Facebook
                </a>
                <span
                  v-if="user.profile.socialLinks.discord"
                  class="social-link social-link--text"
                >
                  Discord: {{ user.profile.socialLinks.discord }}
                </span>
                <span
                  v-if="user.profile.socialLinks.instagram"
                  class="social-link social-link--text"
                >
                  Instagram: {{ user.profile.socialLinks.instagram }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- Account Actions -->
        <section class="detail-section">
          <h2 class="detail-section__title">
            Account Actions
          </h2>
          <div class="detail-section__content">
            <div class="action-buttons">
              <UIButton
                variant="outlined"
                :loading="sendingPasswordReset"
                @click="sendPasswordReset"
              >
                Send Password Reset Email
              </UIButton>
            </div>
          </div>
        </section>

        <!-- Metadata -->
        <section class="detail-section">
          <h2 class="detail-section__title">
            Metadata
          </h2>
          <div class="detail-section__content">
            <div class="detail-grid">
              <div class="detail-item">
                <label class="detail-label">Created</label>
                <div class="detail-value">
                  {{ formatDateTime(user.createdAt) }}
                </div>
              </div>
              <div class="detail-item">
                <label class="detail-label">Last Updated</label>
                <div class="detail-value">
                  {{ formatDateTime(user.updatedAt) }}
                </div>
              </div>
              <div
                v-if="user.lastLogin"
                class="detail-item"
              >
                <label class="detail-label">Last Login</label>
                <div class="detail-value">
                  {{ formatDateTime(user.lastLogin) }}
                </div>
              </div>
              <div
                v-if="user.setupCompletedAt"
                class="detail-item"
              >
                <label class="detail-label">Setup Completed</label>
                <div class="detail-value">
                  {{ formatDateTime(user.setupCompletedAt) }}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { MembershipType } from '@prisma/client'

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

// Fetch user data
const { data: user, pending, error } = await useFetch(`/api/users/${userId}`, {
  transform: (data: UserResponse) => data.user,
})

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

// Utility functions
const formatMembershipType = (type?: MembershipType) => {
  if (!type || type === 'UNKNOWN') return 'Not Set'
  return type.charAt(0) + type.slice(1).toLowerCase()
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString()
}

const formatDateTime = (dateString: string) => {
  return new Date(dateString).toLocaleString()
}

const hasSocialLinks = (socialLinks: Record<string, string | null>) => {
  return Object.values(socialLinks).some(link => link)
}
</script>

<style scoped>
.user-detail {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.user-detail__header {
  margin-bottom: 32px;
}

.user-detail__title-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.user-detail__title {
  font-size: 28px;
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0;
}

.user-detail__actions {
  display: flex;
  gap: 12px;
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
  gap: 24px;
  margin-bottom: 32px;
}

.status-card {
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 20px;
}

.status-card__title {
  font-size: 18px;
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0 0 16px 0;
}

.status-card__content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status-item__label {
  font-weight: 500;
  color: var(--secondary-text-color);
}

.status-item__value {
  color: var(--primary-text-color);
}

.status-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-badge--success {
  background: #d4edda;
  color: #155724;
}

.status-badge--warning {
  background: #fff3cd;
  color: #856404;
}

.status-badge--error {
  background: #f8d7da;
  color: #721c24;
}

.status-badge--info {
  background: #d1ecf1;
  color: #0c5460;
}

.user-detail__sections {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.detail-section {
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 24px;
}

.detail-section__title {
  font-size: 20px;
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0 0 20px 0;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.detail-section__content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}

.detail-item--full {
  grid-column: 1 / -1;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-weight: 600;
  color: var(--secondary-text-color);
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  color: var(--primary-text-color);
  font-size: 16px;
}

.text-muted {
  color: var(--muted-text-color);
  font-style: italic;
}

.role-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.role-badge {
  background: var(--primary-color);
  color: white;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.social-links {
  margin-top: 20px;
}

.social-links__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0 0 12px 0;
}

.social-links__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.social-link {
  color: var(--primary-color);
  text-decoration: none;
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.2s ease;
}

.social-link:hover {
  background: var(--primary-color);
  color: white;
  text-decoration: none;
}

.social-link--text {
  color: var(--primary-text-color);
  pointer-events: none;
}

.action-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .user-detail {
    padding: 16px;
  }

  .user-detail__title-section {
    flex-direction: column;
    align-items: flex-start;
  }

  .user-detail__status-cards {
    grid-template-columns: 1fr;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
