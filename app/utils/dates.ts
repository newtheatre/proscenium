/**
 * Date utilities for form handling and API interactions
 */

/**
 * Convert a Date object to YYYY-MM-DD string for HTML date inputs
 */
export function formatDateForInput(date: Date | string | null | undefined): string {
  if (!date) return ''

  if (typeof date === 'string') {
    // Handle ISO strings or other date formats
    const parsedDate = new Date(date)
    if (isNaN(parsedDate.getTime())) return ''
    const formatted = parsedDate.toISOString().split('T')[0]
    return formatted || ''
  }

  if (date instanceof Date) {
    const formatted = date.toISOString().split('T')[0]
    return formatted || ''
  }

  return ''
}

/**
 * Parse YYYY-MM-DD string from HTML date input to Date object
 * Returns null for empty/invalid strings
 */
export function parseDateFromInput(dateString: string): Date | null {
  if (!dateString || typeof dateString !== 'string') return null

  // Create date at midnight UTC to avoid timezone issues
  const date = new Date(dateString + 'T00:00:00.000Z')
  return isNaN(date.getTime()) ? null : date
}

/**
 * Convert a date (Date object or string) to ISO string for API submission
 */
export function formatDateForApi(date: Date | string | null | undefined): string | null {
  if (!date) return null

  if (typeof date === 'string') {
    const parsed = new Date(date)
    return isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  if (date instanceof Date) {
    return date.toISOString()
  }

  return null
}

/**
 * Parse date from API response (ISO string) to Date object
 */
export function parseDateFromApi(dateString: string | null | undefined): Date | null {
  if (!dateString) return null

  const date = new Date(dateString)
  return isNaN(date.getTime()) ? null : date
}

/**
 * Compare two dates for equality, handling null values
 */
export function datesEqual(date1: Date | null | undefined, date2: Date | null | undefined): boolean {
  if (date1 === date2) return true
  if (!date1 || !date2) return false
  return date1.getTime() === date2.getTime()
}
