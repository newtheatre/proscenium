// The theatre's brand (C-35), fetched once per page load and shared: name, logos and revision.
export interface BrandLogo { url: string, width: number | null, height: number | null, alt: string }
export interface Brand { revision: number, name: string | null, logo: BrandLogo | null, logoDark: BrandLogo | null, creditLine: boolean }

export function useBrand() {
  return useFetch<Brand>('/api/core/branding', {
    key: 'core:brand',
    default: () => ({ revision: 0, name: null, logo: null, logoDark: null, creditLine: true }),
    pick: ['revision', 'name', 'logo', 'logoDark', 'creditLine'],
  })
}
