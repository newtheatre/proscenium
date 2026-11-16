// Every string a person reads goes through t(). The catalogues and the lookup are in utils/translate.ts.
export function useT() {
  return { t: translate, te: hasMessage }
}
