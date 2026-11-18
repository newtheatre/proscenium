<!-- One policy: the sections that apply today, in order, each under its heading. The server decides
     which sections apply (what is switched on, what each setting holds, the theatre's country and
     the theatre's own replacements); the text is the `policies` content collection's, so it is drawn
     like any other page and its tokens show live values. -->
<script setup lang="ts">
interface PolicyPage {
  policy: { id: string, title: string, summary: string | null, kind: string }
  sections: { id: string, title: string, path: string }[]
  revised: string | null
}

const { t } = useT()
const { day } = useDates()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data } = await useAPI<PolicyPage>(() => `/api/core/policies/${encodeURIComponent(id.value)}`, { key: `core:policy:${id.value}` })
if (!data.value) throw createError({ statusCode: 404, statusMessage: t('core.policies.not-found'), fatal: true })
const policy = computed(() => data.value!.policy)

const paths = computed(() => data.value!.sections.map(s => s.path))
const { data: bodies } = await useAsyncData(`core:policy-sections:${id.value}`, () => paths.value.length ? queryCollection('policies').where('path', 'IN', paths.value).all() : Promise.resolve([]), { watch: [paths] })
const sections = computed(() => data.value!.sections.flatMap((s) => {
  const body = (bodies.value ?? []).find(b => b.path === s.path)
  return body ? [{ ...s, body }] : []
}))
const links = computed(() => sections.value.map(s => ({ id: `section-${s.id}`, depth: 2, text: s.title })))

useSeoMeta({ title: () => policy.value.title, description: () => policy.value.summary ?? undefined })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        :title="policy.title"
        :description="policy.summary ?? undefined"
      />
      <UPageBody>
        <section
          v-for="section in sections"
          :key="section.id"
          :aria-labelledby="`section-${section.id}`"
          :data-policy-section="section.id"
        >
          <ProseH2 :id="`section-${section.id}`">
            {{ section.title }}
          </ProseH2>
          <ContentRenderer :value="section.body" />
        </section>
        <USeparator />
        <p class="text-sm text-muted">
          <span
            v-if="data?.revised"
            class="me-2"
          >{{ t('core.policies.revised', { date: day(data.revised) }) }}</span>
          <ULink
            :to="`/policies/${policy.id}/versions`"
            class="me-2 underline underline-offset-2"
          >{{ t('core.policies.versions.link') }}</ULink>
          <ULink
            to="/policies"
            class="underline underline-offset-2"
          >{{ t('core.policies.all') }}</ULink>
        </p>
      </UPageBody>
      <template
        v-if="links.length > 3"
        #right
      >
        <UContentToc
          :links="links"
          :title="t('core.policies.contents')"
        />
      </template>
    </UPage>
  </UContainer>
</template>
