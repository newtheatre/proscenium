<!--
The fields, shared by the create and edit modals: the rules about which
apply are easy to get subtly different.
-->
<script setup lang="ts">
const model = defineModel<{
  title: string
  slug: string
  kind: ContentWarningKind
  category: string | null
  description: string | null
  icon: string | null
  sort: number
}>({ required: true })

const props = defineProps<{
  /** True when editing: the slug already exists and other data may reference it. */
  isExisting?: boolean
}>()

/**
 * Derive the slug from the title while creating, and stop as soon as either the
 * entry exists or someone has typed a slug of their own.
 */
const slugTouched = ref(false)

watch(() => model.value.title, (title) => {
  if (props.isExisting || slugTouched.value) return
  model.value.slug = contentWarningSlug(title)
})

// A technical warning is its own group on the show page, so a category on it
// would never be rendered. Clear it rather than storing something misleading.
watch(() => model.value.kind, (kind) => {
  if (kind === 'TECHNICAL') model.value.category = null
})

const categoryItems = computed(() => [...CONTENT_WARNING_CATEGORIES])
const iconItems = computed(() => [...CONTENT_WARNING_ICONS])

/**
 * The model stores `null` for "not set", which is what the column holds and the
 * API expects; Nuxt UI's inputs work in `undefined`.
 */
const category = computed({
  get: () => model.value.category ?? undefined,
  set: (value: string | undefined) => { model.value.category = value ?? null },
})

const icon = computed({
  get: () => model.value.icon ?? undefined,
  set: (value: string | undefined) => { model.value.icon = value ?? null },
})

const description = computed({
  get: () => model.value.description ?? undefined,
  set: (value: string | undefined) => { model.value.description = value || null },
})
</script>

<template>
  <div class="space-y-4">
    <UFormField
      label="Title"
      name="title"
      required
      help="What a customer will read on the show page."
    >
      <UInput
        v-model="model.title"
        placeholder="e.g. Strobe and flashing lights"
        class="w-full"
      />
    </UFormField>

    <UFormField
      label="Type"
      name="kind"
      required
    >
      <URadioGroup
        v-model="model.kind"
        :items="CONTENT_WARNING_KINDS"
        value-key="value"
        label-key="label"
        description-key="hint"
        variant="card"
        size="sm"
      />
    </UFormField>

    <UFormField
      v-if="model.kind === 'GENERAL'"
      label="Category"
      name="category"
      help="Groups this warning in the editor and on the show page. Pick one of the usual groups, or type a new one."
    >
      <UInputMenu
        v-model="category"
        :items="categoryItems"
        create-item
        placeholder="Uncategorised"
        class="w-full"
        @create="(value: string) => category = value"
      />
    </UFormField>

    <UFormField
      label="Description"
      name="description"
      help="One line of clarification. Shown as help in the show editor and on hover publicly."
    >
      <UInput
        v-model="description"
        placeholder="e.g. Rapid flashing or strobe effects."
        class="w-full"
      />
    </UFormField>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <UFormField
        label="Icon"
        name="icon"
        help="Optional. Shown on the badge."
      >
        <USelectMenu
          v-model="icon"
          :items="iconItems"
          placeholder="None"
          class="w-full"
        >
          <template #leading>
            <UIcon
              v-if="icon"
              :name="icon"
              class="size-5"
            />
          </template>
          <template #item-leading="{ item }">
            <UIcon
              :name="item"
              class="size-5"
            />
          </template>
        </USelectMenu>
      </UFormField>

      <UFormField
        label="Sort"
        name="sort"
        help="Lower sorts first within its group. Leave at 0 for alphabetical."
      >
        <UInputNumber
          v-model="model.sort"
          :min="0"
          :max="9999"
          class="w-full"
        />
      </UFormField>
    </div>

    <UFormField
      label="Slug"
      name="slug"
      :help="isExisting
        ? 'The stable key for this warning. Changing it is safe but breaks any external reference to the old value.'
        : 'The stable key for this warning. Derived from the title; edit it if you need something different.'"
    >
      <UInput
        v-model="model.slug"
        placeholder="strobe-and-flashing-lights"
        class="w-full font-mono text-sm"
        @update:model-value="slugTouched = true"
      />
    </UFormField>
  </div>
</template>
