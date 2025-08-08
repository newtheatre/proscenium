<template>
  <div class="user-management">
    <h1>User Management</h1>

    <!-- Filtering Controls -->
    <div class="user-filters">
      <h2 class="user-filters__title">
        Filter Users
      </h2>
      <div class="user-filters__grid">
        <FormGroup class="user-filters__group">
          <FormLabel for="filterName">
            Name
          </FormLabel>
          <FormInput
            id="filterName"
            v-model="filterName"
            placeholder="Filter by name"
            @input="applyFilters"
          />
        </FormGroup>
        <FormGroup class="user-filters__group">
          <FormLabel for="filterEmail">
            Email
          </FormLabel>
          <FormInput
            id="filterEmail"
            v-model="filterEmail"
            placeholder="Filter by email"
            @input="applyFilters"
          />
        </FormGroup>
        <FormGroup class="user-filters__group">
          <FormLabel for="filterMembershipType">
            Membership Type
          </FormLabel>
          <FormSelect
            id="filterMembershipType"
            v-model="filterMembershipType"
            @change="applyFilters"
          >
            <option value="">
              All
            </option>
            <option value="FULL">
              Full
            </option>
            <option value="ASSOCIATE">
              Associate
            </option>
            <option value="FELLOW">
              Fellow
            </option>
            <option value="ALUMNI">
              Alumni
            </option>
            <option value="GUEST">
              Guest
            </option>
            <option value="UNKNOWN">
              Unknown
            </option>
          </FormSelect>
        </FormGroup>
      </div>
    </div>

    <TableRoot
      v-if="users && users.length > 0"
      class="user-management__table"
    >
      <TableHeader>
        <TableRow>
          <TableHeaderCell
            class="user-management__sortable-header"
            @click="() => sortUsers('profile.name')"
          >
            Name <span
              v-if="sortBy === 'profile.name'"
              class="user-management__sort-indicator"
            >{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
          </TableHeaderCell>
          <TableHeaderCell
            class="user-management__sortable-header"
            @click="() => sortUsers('email')"
          >
            Email <span
              v-if="sortBy === 'email'"
              class="user-management__sort-indicator"
            >{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
          </TableHeaderCell>
          <TableHeaderCell
            class="user-management__sortable-header"
            @click="() => sortUsers('membership.type')"
          >
            Membership Type <span
              v-if="sortBy === 'membership.type'"
              class="user-management__sort-indicator"
            >{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
          </TableHeaderCell>
          <TableHeaderCell>Admin</TableHeaderCell>
          <TableHeaderCell>Actions</TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow
          v-for="user in users"
          :key="user.uid"
        >
          <TableCell>{{ user.profile?.name || 'N/A' }}</TableCell>
          <TableCell>{{ user.email }}</TableCell>
          <TableCell>{{ user.membership?.type || 'Unknown' }}</TableCell>
          <TableCell>{{ user.roles?.includes('ADMIN') ? 'Yes' : 'No' }}</TableCell>
          <TableCell>
            <NuxtLink
              :to="`/admin/users/${user.uid}`"
              class="user-management__action-link"
            >
              View
            </NuxtLink>
          </TableCell>
        </TableRow>
      </TableBody>
    </TableRoot>

    <!-- Pagination Controls -->
    <div
      v-if="totalPages > 1"
      class="user-pagination"
    >
      <UIBaseButton
        :disabled="currentPage === 1"
        @click="prevPage"
      >
        Previous
      </UIBaseButton>
      <span class="user-pagination__info">Page {{ currentPage }} of {{ totalPages }} ({{ totalUsers }} users)</span>
      <UIBaseButton
        :disabled="currentPage === totalPages"
        @click="nextPage"
      >
        Next
      </UIBaseButton>
    </div>

    <div
      v-else-if="pending"
      class="user-management__status user-management__status--pending"
    >
      <UILoadingSpinner />
      <p>Loading users...</p>
    </div>
    <div
      v-else-if="error"
      class="user-management__status user-management__status--error"
    >
      <UIAlert type="error">
        <p>Error loading users: {{ error.message }}</p>
      </UIAlert>
    </div>
    <div
      v-if="!pending && !error && (!users || users.length === 0)"
      class="user-management__status user-management__status--empty"
    >
      <p>No users found.</p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useProfile } from '~/composables/useProfile'
import type { PaginatedUsersResponse } from '~/types'

definePageMeta({
  middleware: ['admin'],
})

const { getAllUserProfiles } = useProfile()

// Filters
const filterName = useState<string>('adminUserFilterName', () => '')
const filterEmail = useState<string>('adminUserFilterEmail', () => '')
const filterMembershipType = useState<string>('adminUserFilterMembershipType', () => '')

// Sorting
const sortBy = useState<string>('adminUsersSortBy', () => 'profile.name')
const sortOrder = useState<'asc' | 'desc'>('adminUsersSortOrder', () => 'asc')

// Pagination
const currentPage = useState<number>('adminUsersCurrentPage', () => 1)
const limit = useState<number>('adminUsersLimit', () => 10) // Default limit

const { data: usersData, pending, error, refresh: _refresh } = await useAsyncData<PaginatedUsersResponse>(
  'adminUsers',
  async () => {
    const params = {
      page: currentPage.value,
      limit: limit.value,
      name: filterName.value || undefined,
      email: filterEmail.value || undefined,
      membershipType: filterMembershipType.value || undefined,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
    }
    // Directly return the data or throw an error
    return getAllUserProfiles(params)
  },
  {
    watch: [currentPage, limit, filterName, filterEmail, filterMembershipType, sortBy, sortOrder],
    // initialCache: false, // TODO: Consider disabling initial cache if data must always be fresh
  },
)

// Computed properties from useAsyncData's result
const users = computed(() => usersData.value?.users || [])
const totalUsers = computed(() => usersData.value?.totalUsers || 0)
const totalPages = computed(() => usersData.value?.totalPages || 0)

let filterTimeout: NodeJS.Timeout | null = null
const applyFilters = () => {
  if (filterTimeout) clearTimeout(filterTimeout)
  filterTimeout = setTimeout(() => {
    currentPage.value = 1
  }, 500)
}

const sortUsers = (newSortBy: string) => {
  if (sortBy.value === newSortBy) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  }
  else {
    sortBy.value = newSortBy
    sortOrder.value = 'asc'
  }
  currentPage.value = 1 // Reset to first page on sort change
}

const nextPage = () => {
  if (currentPage.value < (totalPages.value || 0)) {
    currentPage.value++
  }
}

const prevPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--
  }
}
</script>

<style scoped>
.user-management h1 {
  font-size: 1.875rem; /* text-2xl */
  font-weight: 600;
  margin-bottom: 1rem;
}

.user-filters {
  margin-bottom: 1rem;
  padding: 1rem;
}

.user-filters__title {
  font-size: 1.25rem; /* text-xl */
  line-height: 1.75rem; /* 28px */
  margin-bottom: 0.5rem;
}

.user-filters__grid {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 1rem;
}

@media (min-width: 768px) { /* md breakpoint */
  .user-filters__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

/* .user-filters__group can be used if specific styling for FormGroup wrapper is needed beyond grid layout */

.user-management__table {
  width: 100%;
  max-width: 80vw;
  margin: 0 auto;
}

.user-management__sortable-header {
  cursor: pointer;
}

.user-management__sortable-header:hover {
  background-color: #f0f0f0; /* Example hover style */
}

.user-management__sort-indicator {
  margin-left: 0.25rem;
}

.user-management__action-link {
  color: #2563eb; /* Tailwind blue-600 */
  text-decoration: none;
}

.user-management__action-link:hover {
  text-decoration: underline;
}

.user-pagination {
  margin-top: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.user-pagination__info {
  font-size: 0.875rem;
  color: #6b7280;
}

.user-management__status {
  padding-top: 1rem;
  padding-bottom: 1rem;
  text-align: center;
}

/* Specific status modifiers can be added if needed beyond text-align and padding */
/* e.g., .user-management__status--error { color: red; } */
</style>
