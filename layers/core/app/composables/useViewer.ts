// Who is looking, from the one description the shells draw from (see server/interface/viewer.ts).
// No component tests a role or an ability: it reads the sides and the entries it was given.
import type { NavItem, ShellName } from '../../shared/navigation'

export interface Viewer {
  signedIn: boolean
  name?: string
  membersName?: string
  sides: ('audience' | 'members' | 'console' | 'admin' | 'live')[]
  navigation: (NavItem & { shell: ShellName })[]
}

const ANONYMOUS: Viewer = { signedIn: false, sides: ['audience'], navigation: [] }

export function useViewer() {
  const fetched = useAPI<Viewer>('/api/core/viewer', { key: 'core:viewer', default: () => ANONYMOUS })
  const viewer = computed(() => fetched.data.value ?? ANONYMOUS)
  return {
    viewer,
    status: fetched.status,
    refresh: fetched.refresh,
    has: (side: Viewer['sides'][number]) => viewer.value.sides.includes(side),
    entries: (shell: ShellName) => viewer.value.navigation.filter(e => e.shell === shell),
  }
}
