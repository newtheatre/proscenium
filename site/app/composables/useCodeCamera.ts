// NNT ONLY, TEMPORARY: remove this file after 8 December 2026 (see site/app/utils/old-codes.ts).
// Same as upstream's useCodeCamera, except that a scanned old-system QR code is turned into the id
// it was imported under before the screen sees it, so the door, the till, the holder picker and the
// offline door all find it. Typed codes are not changed.
import type { Ref } from 'vue'
import { useCodeCamera as upstream } from '../../../layers/core/app/composables/useCodeCamera'
import { fromOldCode } from '../utils/old-codes'

export type { CameraProblem } from '../../../layers/core/app/composables/useCodeCamera'

export function useCodeCamera(video: Ref<HTMLVideoElement | null>, running: Ref<boolean>, onCode: (code: string) => 'stop' | undefined) {
  return upstream(video, running, code => onCode(fromOldCode(code)))
}
