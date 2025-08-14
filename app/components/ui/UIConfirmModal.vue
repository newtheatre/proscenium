<template>
  <div
    v-if="show"
    class="modal-overlay"
    @click="handleOverlayClick"
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      @click.stop
    >
      <div class="modal__header">
        <div class="modal__title-container">
          <div
            v-if="isDanger"
            class="modal__icon"
          >
            ⚠️
          </div>
          <h3
            :id="titleId"
            class="modal__title"
          >
            {{ title }}
          </h3>
        </div>
      </div>

      <div class="modal__body">
        <p class="modal__message">
          {{ message }}
        </p>
        <div
          v-if="details"
          class="modal__details"
        >
          <p>{{ details }}</p>
        </div>
      </div>

      <div class="modal__footer">
        <UIButton
          variant="secondary"
          @click="handleCancel"
        >
          {{ cancelText }}
        </UIButton>
        <UIButton
          variant="primary"
          :loading="loading"
          :class="{ 'button--danger': isDanger }"
          @click="handleConfirm"
        >
          {{ loading ? loadingText : confirmText }}
        </UIButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  show: boolean
  title: string
  message: string
  details?: string
  confirmText?: string
  cancelText?: string
  loadingText?: string
  loading?: boolean
  isDanger?: boolean
}

interface Emits {
  confirm: []
  cancel: []
}

const props = withDefaults(defineProps<Props>(), {
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  loadingText: 'Processing...',
  loading: false,
  isDanger: false,
})

const emit = defineEmits<Emits>()

// Generate unique ID for accessibility
const titleId = `modal-title-${Math.random().toString(36).substr(2, 9)}`

const handleConfirm = () => {
  if (!props.loading) {
    emit('confirm')
  }
}

const handleCancel = () => {
  if (!props.loading) {
    emit('cancel')
  }
}

const handleOverlayClick = () => {
  handleCancel()
}

// Handle escape key
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && props.show && !props.loading) {
    handleCancel()
  }
}

// Add/remove event listeners
watch(() => props.show, (show) => {
  if (show) {
    document.addEventListener('keydown', handleKeydown)
    // Prevent body scroll
    document.body.style.overflow = 'hidden'
  }
  else {
    document.removeEventListener('keydown', handleKeydown)
    // Restore body scroll
    document.body.style.overflow = ''
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--spacing-md);
}

.modal {
  background-color: var(--secondary-bg-color);
  border-radius: var(--border-radius);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2);
  max-width: 500px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  border: 1px solid var(--border-color);
}

.modal__header {
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
}

.modal__title-container {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.modal__icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.modal__title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0;
}

.modal__body {
  padding: var(--spacing-lg);
}

.modal__message {
  color: var(--primary-text-color);
  margin: 0 0 var(--spacing-md) 0;
  line-height: 1.5;
}

.modal__details {
  background-color: var(--primary-bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: var(--spacing-md);
  margin-top: var(--spacing-md);
}

.modal__details p {
  color: var(--secondary-text-color);
  font-size: 0.875rem;
  margin: 0;
  line-height: 1.4;
}

.modal__footer {
  padding: var(--spacing-lg);
  border-top: 1px solid var(--border-color);
  display: flex;
  gap: var(--spacing-sm);
  justify-content: flex-end;
}

/* Danger button variant */
:deep(.button--danger) {
  background-color: var(--error);
  border-color: var(--error);
  color: white;
}

:deep(.button--danger:hover),
:deep(.button--danger:focus) {
  background-color: #dc2626;
  border-color: #dc2626;
  filter: brightness(1.1);
}

:deep(.button--danger:disabled) {
  background-color: #fca5a5;
  border-color: #fca5a5;
  cursor: not-allowed;
  filter: none;
}

/* Mobile responsiveness */
@media (max-width: 480px) {
  .modal {
    margin: var(--spacing-sm);
    max-width: calc(100vw - var(--spacing-lg));
  }

  .modal__header,
  .modal__body,
  .modal__footer {
    padding: var(--spacing-md);
  }

  .modal__footer {
    flex-direction: column-reverse;
    gap: var(--spacing-sm);
  }

  .modal__footer :deep(.button) {
    width: 100%;
  }
}
</style>
