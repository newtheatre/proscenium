<template>
  <div class="layout-divider">
    <span
      v-if="text"
      class="layout-divider--text"
    >{{ text }}</span>
  </div>
</template>

<script lang="ts" setup>
defineProps({
  text: {
    type: String,
    default: '',
  },
})
</script>

<style scoped>
.layout-divider {
  text-align: center;
  margin: 0.75rem 0;
  position: relative;
}

.layout-divider::before,
.layout-divider::after {
  content: '';
  position: absolute;
  top: 60%;
  width: 45%;
  height: 1px;
  background-color: var(--border-color);
}

.layout-divider::before {
  left: 0;
}

.layout-divider::after {
  right: 0;
}

.layout-divider--text {
  padding: 0 var(--spacing-sm);
  color: var(--primary-text-color);
  background-color: var(--primary-bg-color);
  position: relative;
  z-index: 1;
}
</style>
