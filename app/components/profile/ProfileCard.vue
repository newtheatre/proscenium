<template>
  <div class="profile-card">
    <UIDetailSection title="Profile">
      <UIDetailGrid>
        <UIDetailItem
          label="Name"
          :value="user.profile?.name"
        />
        <UIDetailItem
          label="Email"
          :value="user.email"
        />
        <UIDetailItem
          label="Student ID"
          :value="user.studentId"
        />
        <UIDetailItem label="Roles">
          <RoleBadges :roles="user.roles" />
        </UIDetailItem>
        <UIDetailItem
          v-if="user.profile?.bio"
          label="Bio"
          :value="user.profile.bio"
          full-width
        />
        <UIDetailItem
          v-if="user.profile?.gradYear"
          label="Graduation Year"
          :value="user.profile.gradYear"
        />
        <UIDetailItem
          v-if="user.profile?.course"
          label="Course"
          :value="user.profile.course"
        />
      </UIDetailGrid>

      <UISocialLinks
        v-if="user.profile?.socialLinks"
        :social-links="user.profile.socialLinks"
      />
    </UIDetailSection>

    <UIDetailSection title="Account Status">
      <UIDetailGrid>
        <UIDetailItem label="Email Verified">
          <UIStatusBadge
            :variant="user.emailVerified ? 'success' : 'warning'"
            :label="user.emailVerified ? 'Verified' : 'Not Verified'"
          />
        </UIDetailItem>
        <UIDetailItem label="Setup Complete">
          <UIStatusBadge
            :variant="user.setupCompleted ? 'success' : 'warning'"
            :label="user.setupCompleted ? 'Complete' : 'Incomplete'"
          />
        </UIDetailItem>
        <UIDetailItem
          v-if="user.membership"
          label="Membership"
        >
          <UIStatusBadge
            variant="info"
            :label="formatMembershipType(user.membership.type)"
          />
        </UIDetailItem>
      </UIDetailGrid>
    </UIDetailSection>
  </div>
</template>

<script lang="ts" setup>
interface Props {
  user: UserWithRelations
}

defineProps<Props>()

const { formatMembershipType } = useFormatters()
</script>

<style scoped>
.profile-card {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}
</style>
