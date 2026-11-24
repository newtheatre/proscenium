// Whether the theatre charges VAT, so screens show a tax code only where it means something (FIN-07).
export function useTaxRegistered() {
  const { data } = useAPI<{ registered: boolean }>('/api/finance/tax-codes/choices', { key: 'finance:tax-code-choices' })
  return computed(() => data.value?.registered === true)
}
