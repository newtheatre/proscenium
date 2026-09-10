// A flagged save is confirmed by typing back what the preview showed, the count or the setting's
// own name, never a checkbox (J-105 criterion 2).

export interface BlastRadiusPreview {
  count: number
  category: string
}

// What a typed confirmation may say, in the order the prompt offers them.
export function confirmationOptions(key: string, preview: BlastRadiusPreview | null): string[] {
  return preview ? [key, String(preview.count)] : [key]
}

export function confirmationMatches(key: string, preview: BlastRadiusPreview | null, typed: string): boolean {
  return confirmationOptions(key, preview).includes(typed.trim())
}
