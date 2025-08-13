import type { MembershipType } from '@prisma/client'
import type { SocialLinks } from '../../shared/types/api'

/**
 * Shared formatting utilities for user data
 */

export const useFormatters = () => {
  const formatMembershipType = (type?: MembershipType | null) => {
    if (!type || type === 'UNKNOWN') return 'Not Set'
    return type.charAt(0) + type.slice(1).toLowerCase()
  }

  const formatDate = (dateString: string | Date) => {
    return new Date(dateString).toLocaleDateString()
  }

  const formatDateTime = (dateString: string | Date) => {
    return new Date(dateString).toLocaleString()
  }

  const formatRole = (role: string) => {
    return role.charAt(0) + role.slice(1).toLowerCase()
  }

  const hasSocialLinks = (socialLinks?: SocialLinks | null): boolean => {
    if (!socialLinks) return false
    return Object.values(socialLinks).some(link => link && typeof link === 'string' && link.trim() !== '')
  }

  const formatUserStatus = (user: { isActive: boolean, emailVerified: boolean, setupCompleted: boolean }) => {
    return {
      active: {
        value: user.isActive,
        label: user.isActive ? 'Active' : 'Inactive',
        variant: user.isActive ? 'success' : 'error',
      },
      emailVerified: {
        value: user.emailVerified,
        label: user.emailVerified ? 'Verified' : 'Unverified',
        variant: user.emailVerified ? 'success' : 'warning',
      },
      setupCompleted: {
        value: user.setupCompleted,
        label: user.setupCompleted ? 'Complete' : 'Incomplete',
        variant: user.setupCompleted ? 'success' : 'warning',
      },
    }
  }

  return {
    formatMembershipType,
    formatDate,
    formatDateTime,
    formatRole,
    hasSocialLinks,
    formatUserStatus,
  }
}
