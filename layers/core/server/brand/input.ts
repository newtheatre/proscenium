// What a brand save or preview may send. Each field is optional: only what is given changes.
import { z } from 'zod'
import { idSchema } from '#kit'
import { BRAND_FONT_IDS } from '../../shared/brand-fonts'

export const brandInput = z.object({
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).transform(v => v.toLowerCase()).optional(), // not-policy: a hex colour's shape
  neutral: z.enum(['slate', 'stone', 'zinc', 'neutral']).optional(),
  displayFont: z.enum(BRAND_FONT_IDS).optional(),
  bodyFont: z.enum(BRAND_FONT_IDS).optional(),
  radius: z.enum(['none', 'small', 'medium', 'large']).optional(),
  creditLine: z.boolean().optional(),
  logo: idSchema('fil').nullable().optional(),
  logoDark: idSchema('fil').nullable().optional(),
})
