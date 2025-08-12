<template>
  <div class="user-menu">
    <!-- Avatar/Profile Picture -->
    <button
      ref="avatarRef"
      class="user-menu__avatar"
      type="button"
      :aria-expanded="isMenuOpen"
      aria-haspopup="true"
      aria-label="User menu"
      @click="toggleMenu"
    >
      <NuxtImg
        :src="userPhotoURL"
        :alt="user?.email || 'User avatar'"
        class="user-menu__avatar-img"
      />
    </button>

    <!-- Dropdown Menu -->
    <Transition name="dropdown">
      <div
        v-if="isMenuOpen"
        ref="menuRef"
        class="user-menu__dropdown"
        role="menu"
      >
        <div class="user-menu__dropdown-header">
          <div class="user-menu__user-info">
            <span class="user-menu__email">{{ user?.email }}</span>
            <span
              v-if="user?.profile?.name"
              class="user-menu__name"
            >{{ user.profile.name }}</span>
          </div>
        </div>

        <div class="user-menu__dropdown-items">
          <NuxtLink
            to="/profile/me"
            class="user-menu__dropdown-item"
            role="menuitem"
            @click="closeMenu"
          >
            <Icon
              name="icon:account"
              class="user-menu__item-icon"
            />
            My Profile
          </NuxtLink>

          <NuxtLink
            v-if="hasAdminAccess"
            to="/admin"
            class="user-menu__dropdown-item"
            role="menuitem"
            @click="closeMenu"
          >
            <Icon
              name="icon:settings"
              class="user-menu__item-icon"
            />
            Admin Dashboard
          </NuxtLink>

          <hr class="user-menu__divider">

          <button
            class="user-menu__dropdown-item user-menu__dropdown-item--danger"
            type="button"
            role="menuitem"
            @click="handleLogout"
          >
            <Icon
              name="icon:logout"
              class="user-menu__item-icon"
            />
            Sign Out
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
const { user, logout } = useAuth()
const isMenuOpen = ref(false)
const avatarRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)

// Computed property to get user photo URL
const userPhotoURL = computed(() => {
  return user.value?.profile?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.value?.profile?.name || 'User')}&background=a54499&color=fff&size=40`
})

// Check if user has admin access
const hasAdminAccess = computed(() => {
  return user.value?.roles?.includes('ADMIN')
})

// Toggle dropdown menu
const toggleMenu = () => {
  isMenuOpen.value = !isMenuOpen.value
}

// Close menu
const closeMenu = () => {
  isMenuOpen.value = false
}

// Close menu when clicking outside
const handleClickOutside = (event: MouseEvent) => {
  if (
    isMenuOpen.value
    && avatarRef.value
    && menuRef.value
    && !avatarRef.value.contains(event.target as Node)
    && !menuRef.value.contains(event.target as Node)
  ) {
    closeMenu()
  }
}

// Handle sign out
const handleLogout = async () => {
  try {
    await logout()
    closeMenu()
    await navigateTo('/login')
  }
  catch (error) {
    console.error('Error logging out:', error)
  }
}

// Handle escape key
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && isMenuOpen.value) {
    closeMenu()
    avatarRef.value?.focus()
  }
}

// Add and remove event listeners
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.user-menu {
  width: 100%;
  height: 100%;
  position: relative;
}

.user-menu__avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  cursor: pointer;
  overflow: hidden;
  background-color: var(--secondary-bg-color);
  display: flex;
  justify-content: center;
  align-items: center;
  border: 2px solid var(--nnt-purple);
  transition: all var(--transition-fast);
  position: relative;
  padding: 0;
}

.user-menu__avatar:hover,
.user-menu__avatar:focus {
  box-shadow: 0 0 0 3px rgba(165, 68, 153, 0.3);
  outline: none;
  transform: scale(1.05);
}

.user-menu__avatar:active {
  transform: scale(0.95);
}

.user-menu__avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-menu__dropdown {
  position: absolute;
  top: calc(100% + var(--spacing-lg));
  right: 0;
  min-width: 220px;
  max-width: 280px;
  background-color: var(--secondary-bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  z-index: 1100;
  overflow: hidden;

  /* Prevent dropdown from going off-screen */
  max-height: calc(100vh - 100px);
  overflow-y: auto;
}

/* Adjust positioning on small screens */
@media (max-width: 480px) {
  .user-menu__dropdown {
    right: -var(--spacing-md);
    min-width: 200px;
    max-width: calc(100vw - var(--spacing-xl));
  }
}

.user-menu__dropdown-header {
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--border-color);
  background-color: var(--primary-bg-color);
}

.user-menu__user-info {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.user-menu__email {
  font-size: 0.875rem;
  color: var(--secondary-text-color);
  word-break: break-word;
}

.user-menu__name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--primary-text-color);
}

.user-menu__dropdown-items {
  display: flex;
  flex-direction: column;
  padding: var(--spacing-xs) 0;
}

.user-menu__dropdown-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  text-align: left;
  text-decoration: none;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color var(--transition-fast);
  color: var(--primary-text-color);
  width: 100%;
}

.user-menu__dropdown-item:hover,
.user-menu__dropdown-item:focus {
  background-color: var(--primary-bg-color);
  outline: none;
}

.user-menu__dropdown-item--danger {
  color: var(--error);
}

.user-menu__dropdown-item--danger:hover,
.user-menu__dropdown-item--danger:focus {
  background-color: rgba(255, 77, 77, 0.1);
}

.user-menu__item-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.user-menu__divider {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: var(--spacing-xs) 0;
}

/* Dropdown transition */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}

.dropdown-enter-to,
.dropdown-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}
</style>
