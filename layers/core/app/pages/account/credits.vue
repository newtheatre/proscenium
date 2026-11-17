<!-- Your credits (C-09; part 5, "My credits"): each production you are credited on, with the printed
     name and role, and who sees the credit. Nothing else about a credit can be changed here. -->
<script setup lang="ts">
import type { RefusalView } from '../../utils/refusal'

type Visibility = 'public' | 'members' | 'hidden'
interface MyCredit { id: string, production: string, creditedName: string, role: string, section: string, visibility: Visibility }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ credits: MyCredit[] }>('/api/core/me/credits', { key: 'core:my-credits' })

const choices = computed(() => (['public', 'members', 'hidden'] as const).map(v => ({ value: v, label: t(`core.me.credits.visibility.${v}`) })))
const refusal = ref<RefusalView | null>(null)

async function choose(credit: MyCredit, visibility: Visibility) {
  if (visibility === credit.visibility) return
  refusal.value = null
  try {
    await $api<{ id: string }>(`/api/core/me/credits/${credit.id}` as string, { method: 'PATCH', body: { visibility } })
    toast.add({ title: t('core.me.credits.saved'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame
    :title="t('core.me.credits.title')"
    :description="t('core.me.credits.intro')"
    :trail="[{ label: t('core.account.title'), to: '/account' }]"
    width="reading"
  >
    <div class="space-y-6">
      <RefusalNotice :refusal="refusal" />
      <DataBoundary
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <EmptyState
          v-if="data && !data.credits.length"
          icon="i-lucide-scroll-text"
          :title="t('core.me.credits.none')"
        />
        <RecordList
          v-else-if="data"
          :label="t('core.me.credits.title')"
        >
          <RecordListItem
            v-for="c in data.credits"
            :key="c.id"
            icon="i-lucide-drama"
            :name="c.production"
            :description="t('core.me.credits.line', { name: c.creditedName, role: c.role, section: c.section })"
          >
            <USelect
              :model-value="c.visibility"
              :items="choices"
              :aria-label="t('core.me.credits.who-sees', { production: c.production })"
              size="sm"
              class="w-40"
              @update:model-value="(v: Visibility) => choose(c, v)"
            />
          </RecordListItem>
        </RecordList>
      </DataBoundary>
    </div>
  </PageFrame>
</template>
