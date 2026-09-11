<script setup lang="ts">
import { LATECOMER_POLICIES, saysLatecomerPolicy, showForm } from '#shared/utils/programme'
import type { AdminShow, LatecomerPolicy, ShowReference } from '#shared/utils/programme'

// The show's own copy: what the public page says and the rules every performance inherits (D-121).

const props = defineProps<{
  show: AdminShow
  categories: ShowReference[]
  seasons: ShowReference[]
}>()

const emit = defineEmits<{ saved: [] }>()

const toast = useToast()
const saving = ref(false)
const failure = ref<string | null>(null)

const copy = reactive({
  title: '',
  slug: '',
  subtitle: '',
  description: '',
  longDescription: '',
  ageGuidance: '',
  latecomerPolicy: null as LatecomerPolicy | null,
  bookingClosesHoursBefore: null as number | null,
  categoryId: null as string | null,
  seasonId: null as string | null,
})

watchEffect(() => {
  const one = props.show
  Object.assign(copy, {
    title: one.title,
    slug: one.slug,
    subtitle: one.subtitle ?? '',
    description: one.description ?? '',
    longDescription: one.longDescription ?? '',
    ageGuidance: one.ageGuidance ?? '',
    latecomerPolicy: one.latecomerPolicy,
    bookingClosesHoursBefore: one.bookingClosesHoursBefore,
    categoryId: one.categoryId,
    seasonId: one.seasonId,
  })
})

const blank = (value: string): string | null => (value.trim() ? value.trim() : null)

async function saveCopy(): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/shows/${props.show.id}`, {
      method: 'PUT',
      body: {
        title: copy.title.trim(),
        slug: copy.slug.trim(),
        subtitle: blank(copy.subtitle),
        description: blank(copy.description),
        longDescription: blank(copy.longDescription),
        ageGuidance: blank(copy.ageGuidance),
        latecomerPolicy: copy.latecomerPolicy,
        bookingClosesHoursBefore: copy.bookingClosesHoursBefore,
        categoryId: copy.categoryId,
        seasonId: copy.seasonId,
      },
    })
    toast.add({ title: 'Show changed', icon: 'i-lucide-check', color: 'success' })
    emit('saved')
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

const policyOptions = [
  { label: saysLatecomerPolicy(null), value: null },
  ...LATECOMER_POLICIES.map(one => ({ label: saysLatecomerPolicy(one), value: one })),
]

// A retired category or season cannot be chosen for new work; one already carried by this show
// stays offered so the picker never blanks out from under it (D-131 criterion 5).
function pickerOptions(all: ShowReference[], current: string | null): { label: string, value: string | null }[] {
  return [
    { label: 'None', value: null },
    ...all
      .filter(one => !one.archived || one.id === current)
      .map(one => ({ label: saysReferenceName(one), value: one.id })),
  ]
}

const categoryOptions = computed(() => pickerOptions(props.categories, copy.categoryId))
const seasonOptions = computed(() => pickerOptions(props.seasons, copy.seasonId))
</script>

<template>
  <UCard>
    <UForm
      :schema="showForm"
      :state="copy"
      class="space-y-4"
      data-test="show-copy"
      @submit="saveCopy"
    >
      <UAlert
        v-if="failure"
        data-test="failure"
        color="error"
        variant="subtle"
        :description="failure"
      />

      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField
          label="Title"
          name="title"
          required
        >
          <UInput
            v-model="copy.title"
            class="w-full"
            data-test="copy-title"
          />
        </UFormField>

        <UFormField
          label="Address"
          name="slug"
          required
          description="The public page is /shows/ and this."
        >
          <UInput
            v-model="copy.slug"
            class="w-full"
            data-test="copy-slug"
          />
        </UFormField>
      </div>

      <UFormField
        label="Subtitle"
        name="subtitle"
        hint="Optional"
      >
        <UInput
          v-model="copy.subtitle"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="Short description"
        name="description"
        hint="Optional"
        description="What the listing shows beside the poster."
      >
        <UTextarea
          v-model="copy.description"
          :rows="2"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="Full description"
        name="longDescription"
        hint="Optional"
      >
        <UTextarea
          v-model="copy.longDescription"
          :rows="5"
          class="w-full"
        />
      </UFormField>

      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <UFormField
          label="Age guidance"
          name="ageGuidance"
          hint="Optional"
        >
          <UInput
            v-model="copy.ageGuidance"
            class="w-full"
            data-test="copy-age"
          />
        </UFormField>

        <UFormField
          label="Latecomers"
          name="latecomerPolicy"
        >
          <USelect
            v-model="copy.latecomerPolicy"
            :items="policyOptions"
            class="w-full"
            data-test="copy-latecomers"
          />
        </UFormField>

        <UFormField
          label="Online booking closes"
          name="bookingClosesHoursBefore"
          description="Hours before curtain. Every performance inherits this unless it states its own. Leave it empty for curtain-up."
        >
          <UInputNumber
            v-model="copy.bookingClosesHoursBefore"
            :min="0"
            :max="720"
            class="w-full"
            data-test="copy-window"
          />
        </UFormField>

        <UFormField
          label="Category"
          name="categoryId"
        >
          <USelect
            v-model="copy.categoryId"
            :items="categoryOptions"
            class="w-full"
            data-test="copy-category"
          />
        </UFormField>

        <UFormField
          label="Season"
          name="seasonId"
        >
          <USelect
            v-model="copy.seasonId"
            :items="seasonOptions"
            class="w-full"
            data-test="copy-season"
          />
        </UFormField>
      </div>

      <UButton
        type="submit"
        :loading="saving"
        data-test="copy-submit"
      >
        Save the show
      </UButton>
    </UForm>
  </UCard>
</template>
