// "Find a warning" on a production's guidance (C-53). A person types the word they have in mind,
// which is often not the list's own: "gun" for Weapons, "rape" for Sexual violence. So the search
// reads a warning's label, its description and its heading, tries the everyday words below, and
// needs every word typed to be found somewhere. The words are for the warnings core ships; a
// theatre's own warnings are still found by their label and description.
const SYNONYMS: Record<string, string[]> = {
  gun: ['weapon'], guns: ['weapon'], knife: ['weapon'], knives: ['weapon'], shooting: ['weapon', 'violence'], gunshot: ['weapon'],
  fight: ['violence'], fighting: ['violence'], assault: ['violence'], abuse: ['violence'], blood: ['gore'],
  kill: ['murder', 'death'], killing: ['murder', 'death'], dies: ['death'], dying: ['death', 'terminal'], funeral: ['grief'], bereavement: ['grief'],
  miscarriage: ['pregnancy'], stillbirth: ['pregnancy'], cancer: ['terminal', 'illness'],
  rape: ['sexual violence'], sex: ['sexual'], naked: ['nudity'], nude: ['nudity'],
  swearing: ['strong language'], swear: ['strong language'], profanity: ['strong language'], language: ['strong language'],
  drugs: ['drug'], drink: ['alcohol'], drinking: ['alcohol'], drunk: ['alcohol'], cigarettes: ['smoking'], vaping: ['smoking'], betting: ['gambling'],
  suicidal: ['suicide'], cutting: ['self-harm'], panic: ['anxiety'], trauma: ['ptsd'], flashbacks: ['ptsd'],
  racist: ['racism'], homophobic: ['homophobia'], transphobia: ['homophobia'], transphobic: ['homophobia'], misogyny: ['sexism'], sexist: ['sexism'],
  terror: ['terrorism'], bomb: ['terrorism', 'war'], hostage: ['kidnap'], prison: ['imprisonment'],
}

export interface SearchableWarning { label: string, description: string | null }

/** True when every word of `query` is in the warning's label, description or heading, directly or through an everyday word. */
export function warningMatches(warning: SearchableWarning, heading: string, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const text = [warning.label, warning.description ?? '', heading].join(' ').toLowerCase()
  return words.every((word) => {
    const tries = [word, ...(SYNONYMS[word] ?? [])]
    // A plural typed for a singular in the list: "weapons" finds "weapon", "drugs" finds "drug".
    if (word.length > 3 && word.endsWith('s')) tries.push(word.slice(0, -1))
    return tries.some(t => text.includes(t))
  })
}
