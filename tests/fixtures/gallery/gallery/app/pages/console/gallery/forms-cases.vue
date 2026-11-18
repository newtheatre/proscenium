<script setup lang="ts">
// The forms engine runs in the browser while someone answers and on the server when they send.
// This page runs the engine's own case set in the browser, so a browser test can see that both
// places give the same answers (docs/specs/form-builder, test plan).
import { CASES, CASE_TODAY, differences, evaluate } from '../../../../../../../../layers/forms/shared/engine'

definePageMeta({ layout: 'console' })

const failures = ref<string[] | null>(null)
onMounted(() => {
  const out: string[] = []
  for (const c of CASES) {
    try {
      const differs = differences(c, evaluate(c.definition, c.answers, { today: CASE_TODAY, ...c.context }))
      if (differs.length) out.push(`${c.name}: ${differs.join('; ')}`)
    }
    catch (error) {
      out.push(`${c.name}: ${String(error)}`)
    }
  }
  failures.value = out
})
</script>

<template>
  <PageFrame title="Forms engine cases">
    <p
      v-if="failures"
      data-test="summary"
    >
      {{ CASES.length - failures.length }} of {{ CASES.length }} cases pass
    </p>
    <ul>
      <li
        v-for="failure in failures ?? []"
        :key="failure"
        data-test="failure"
      >
        {{ failure }}
      </li>
    </ul>
  </PageFrame>
</template>
