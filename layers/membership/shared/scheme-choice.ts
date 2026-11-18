/** A scheme as the add and import windows are offered it (GET /api/membership/members/schemes). */
export interface MembershipSchemeChoice {
  id: string
  name: string
  lengthRule: 'fixed' | 'rolling' | 'indefinite'
  options: { id: string, name: string }[]
  feesOn: boolean
  reference: { listName: string, label: string | null } | null
  canAdd: boolean
  canImport: boolean
}
