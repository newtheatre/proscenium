import { useOverlay } from '#imports'
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
 * Programmatically show a confirmation modal for a destructive action.
 */
export function useConfirm() {
  const overlay = useOverlay()

  return async (options: ConfirmOptions): Promise<boolean> => {
    const modal = overlay.create(AppConfirmModal, { props: options })
    const { result } = modal.open()
    return (await result) ?? false
  }
}
