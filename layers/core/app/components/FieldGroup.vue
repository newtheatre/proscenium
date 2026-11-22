<!-- A titled group of fields inside one form: a rule, a heading and an optional line of explanation,
     then the fields. For a long form in one card that reads better in parts, where a separator's
     label would not be a heading. -->
<script setup lang="ts">
withDefaults(defineProps<{ title: string, description?: string, /** Leave the rule out for the first group of a form. */ first?: boolean }>(), { description: undefined, first: false })
const id = useId()
</script>

<template>
  <section
    :aria-labelledby="id"
    class="space-y-4"
  >
    <USeparator v-if="!first" />
    <div>
      <h3
        :id="id"
        class="text-sm font-semibold text-highlighted"
      >
        {{ title }}
      </h3>
      <p
        v-if="description"
        class="text-sm text-muted"
      >
        {{ description }}
      </p>
    </div>
    <slot />
  </section>
</template>
