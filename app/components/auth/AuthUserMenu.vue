<template>
  <div class="user-menu">
    <!-- Avatar/Profile Picture -->
    <div
      ref="avatarRef"
      class="user-menu__avatar"
      @click="toggleMenu"
    >
      <NuxtImg
        :src="userPhotoURL"
        :alt="user?.email || 'User avatar'"
        class="user-menu__avatar-img"
      />
    </div>

    <!-- Dropdown Menu -->
    <div
      v-if="isMenuOpen"
      ref="menuRef"
      class="user-menu__dropdown"
    >
      <div class="user-menu__dropdown-header">
        <span class="user-menu__email">{{ user?.email }}</span>
      </div>
      <div class="user-menu__dropdown-items">
        <button
          class="user-menu__dropdown-item"
          @click="selectOption(1)"
        >
          Admin Dashboard
        </button>
        <button
          class="user-menu__dropdown-item"
          @click="selectOption(2)"
        >
          Option 2
        </button>
        <button
          class="user-menu__dropdown-item"
          @click="selectOption(3)"
        >
          Option 3
        </button>
        <button
          class="user-menu__dropdown-item user-menu__dropdown-item--signout"
          @click="handleLogout"
        >
          Sign Out
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { user, logout } = useAuth()
const isMenuOpen = ref(false)
const avatarRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)

// Computed property to get user photo URL or null
const userPhotoURL = computed(() => {
  return 'https://placehold.co/20' // TODO: get from user.value?.photoURL once implemented
})

// Toggle dropdown menu
const toggleMenu = () => {
  isMenuOpen.value = !isMenuOpen.value
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
    isMenuOpen.value = false
  }
}

// Handle menu option selection
const selectOption = (optionNumber: number) => {
  console.log(`Option ${optionNumber} selected`)
  isMenuOpen.value = false
  // Implement option actions later

  switch (optionNumber) {
    case 1:
      // Handle option 1
      navigateTo('/admin')
      break
    case 2:
      // Handle option 2
      break
    case 3:
      // Handle option 3
      break
    default:
      console.error('Invalid option selected')
  }
}

// Handle sign out
const handleLogout = async () => {
  try {
    await logout()
    isMenuOpen.value = false
  }
  catch (error) {
    console.error('Error logging out:', error)
  }
}

// Add and remove event listeners
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
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
  background-color: #e0e0e0;
  display: flex;
  justify-content: center;
  align-items: center;
  border: 2px solid var(--nnt-purple, #8b2c8b);
  transition: box-shadow 0.2s ease;
}

.user-menu__avatar:hover {
  box-shadow: 0 0 0 2px rgba(139, 44, 139, 0.3);
}

.user-menu__avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-menu__dropdown {
  position: absolute;
  top: calc(100% + 5px);
  right: 0;
  width: 200px;
  background-color: #e0e0e0;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  z-index: 100;
  overflow: hidden;
}

.user-menu__dropdown-header {
  padding: 12px 16px;
  border-bottom: 1px solid #eee;
  background-color: #f9f9f9;
}

.user-menu__email {
  font-size: 0.875rem;
  color: #444;
  word-break: break-word;
}

.user-menu__dropdown-items {
  display: flex;
  flex-direction: column;
}

.user-menu__dropdown-item {
  padding: 12px 16px;
  text-align: left;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.2s;
  color: #333;
}

.user-menu__dropdown-item:hover {
  background-color: #f0f0f0;
}

.user-menu__dropdown-item--signout {
  border-top: 1px solid #eee;
  margin-top: 4px;
  color: #d32f2f;
}
</style>
