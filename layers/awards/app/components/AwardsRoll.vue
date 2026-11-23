<!-- The roll of honour, for the public page and a theatre's own pages: ::awards-roll in a content
     file. Everybody holding a listed award, by award type; `type` takes one type's web address and
     then shows that type alone, with no heading. The roll being off, or the module, shows nothing. -->
<script setup lang="ts">
interface Entry { id: string, name: string, awardedOn: string, awardedFor: string | null, citation: string | null, production: { title: string, slug: string, to: string | null } | null }
interface RollType { key: string, name: string, summary: string | null, awards: Entry[] }

const props = defineProps<{ type?: string }>()
const { t } = useT()
const query = computed(() => (props.type ? { type: props.type } : {}))
const { data } = await useAPI<{ types: RollType[] }>('/api/awards/roll', { key: `awards:roll:${props.type ?? 'all'}`, query })
const types = computed(() => data.value?.types ?? [])
const year = (date: string) => date.slice(0, 4) // not-policy: the year of a date
</script>

<template>
  <div
    v-if="data"
    class="not-prose space-y-10"
  >
    <section
      v-for="group in types"
      :key="group.key"
      :aria-labelledby="props.type ? undefined : `awards-roll-${group.key}`"
    >
      <template v-if="!props.type">
        <h2
          :id="`awards-roll-${group.key}`"
          class="text-xl font-semibold"
        >
          {{ group.name }}
        </h2>
        <p
          v-if="group.summary"
          class="mt-1 text-muted"
        >
          {{ group.summary }}
        </p>
      </template>
      <RecordList
        :label="group.name"
        class="mt-4"
      >
        <RecordListItem
          v-for="a in group.awards"
          :key="a.id"
        >
          <template #name>
            <span class="font-medium">{{ a.name }}</span>
            <span class="sr-only">, </span>
            <span class="ms-2 text-sm font-normal text-muted">{{ year(a.awardedOn) }}</span>
          </template>
          <template
            v-if="a.awardedFor || a.production"
            #description
          >
            <template v-if="a.awardedFor">
              {{ a.awardedFor }}
            </template>
            <template v-if="a.awardedFor && a.production">
              ·
            </template>
            <ULink
              v-if="a.production?.to"
              :to="a.production.to"
              class="underline"
            >
              {{ a.production.title }}
            </ULink>
            <template v-else-if="a.production">
              {{ a.production.title }}
            </template>
          </template>
          <template
            v-if="a.citation"
            #below
          >
            <p class="whitespace-pre-line text-sm">
              {{ a.citation }}
            </p>
          </template>
        </RecordListItem>
      </RecordList>
    </section>
    <p
      v-if="!types.length"
      class="text-muted"
    >
      {{ t('awards.roll.empty') }}
    </p>
  </div>
</template>
