import AppConfirmModal from '~/components/AppConfirmModal.vue'

interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  confirmColor?: 'error' | 'warning' | 'primary' | 'neutral'
  cancelLabel?: string
  icon?: string
}

/**
 * Programmatically show a confirmation modal for destructive actions.
 *
 * @example
 * const confirm = useConfirm()
 * if (await confirm({ title: 'Delete item?', description: 'This cannot be undone.' })) {
 *   // proceed
 * }
 */
export function useConfirm() {
  const overlay = useOverlay()

  return async (options: ConfirmOptions): Promise<boolean> => {
    const modal = overlay.create(AppConfirmModal, { props: options })
    const { result } = modal.open()
    return (await result) ?? false
  }
}
