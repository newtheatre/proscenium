<!-- What may be seen of a round of review (FB-405): how many reviews are in and, once the round is
     released, a vote's tally or the summary of the marks, with each review where the reader may
     see who said what. The server sends only what this reader may see. -->
<script setup lang="ts">
import type { ScoreSummary, Tally, Vote } from '../../shared/engine'

export interface ReviewResult {
  assigned: number
  submitted: number
  tally: Tally | null
  summary: ScoreSummary | null
  reviews: { reviewer: string, vote: Vote | null, scores: Record<string, number>, comment: string }[] | null
}
const props = defineProps<{ result: ReviewResult, mode: 'scores' | 'vote', released: boolean }>()
const { t } = useT()
const mark = (value: number | null) => value === null ? t('forms.screens.review.no-marks') : String(Math.round(value * 10) / 10) // not-policy: one decimal place
const shown = computed(() => !!props.result.tally || !!props.result.summary)
</script>

<template>
  <div class="space-y-3">
    <p class="text-sm">
      {{ t(mode === 'vote' ? 'forms.screens.review.progress-vote' : 'forms.screens.review.progress-scores', { done: result.submitted, of: result.assigned }) }}
      <span
        v-if="!shown"
        class="text-muted"
      >{{ t(released ? 'forms.screens.review.hidden' : 'forms.screens.review.private') }}</span>
    </p>
    <div
      v-if="result.tally"
      class="space-y-2"
    >
      <dl class="grid grid-cols-3 gap-2 text-center">
        <div
          v-for="side in (['for', 'against', 'abstain'] as const)"
          :key="side"
          class="rounded-md border border-default p-2"
        >
          <dt class="text-sm text-muted">
            {{ t(`forms.screens.review.vote.${side}`) }}
          </dt>
          <dd class="text-xl font-semibold">
            {{ result.tally[side] }}
          </dd>
        </div>
      </dl>
      <StatusBadge
        :tone="result.tally.passed ? 'success' : result.tally.quorate ? 'danger' : 'warning'"
        :label="result.tally.passed ? t('forms.screens.review.passed') : result.tally.quorate ? t('forms.screens.review.not-passed') : t('forms.screens.review.not-quorate', { n: result.tally.quorum })"
      />
    </div>
    <table
      v-if="result.summary"
      class="w-full text-sm"
    >
      <caption class="sr-only">
        {{ t('forms.screens.review.summary') }}
      </caption>
      <thead>
        <tr class="text-left text-muted">
          <th
            scope="col"
            class="py-1 font-normal"
          >
            {{ t('forms.screens.review.criterion') }}
          </th>
          <th
            scope="col"
            class="py-1 text-right font-normal"
          >
            {{ t('forms.screens.review.mean') }}
          </th>
          <th
            scope="col"
            class="py-1 text-right font-normal"
          >
            {{ t('forms.screens.review.spread') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="line in result.summary.criteria"
          :key="line.id"
          class="border-t border-default"
        >
          <th
            scope="row"
            class="py-1 text-left font-normal"
          >
            {{ line.label }}
          </th>
          <td class="py-1 text-right">
            {{ t('forms.screens.review.out-of', { mark: mark(line.mean), max: line.max }) }}
          </td>
          <td class="py-1 text-right">
            {{ line.low === null ? '' : t('forms.screens.review.range', { low: line.low, high: line.high ?? line.low }) }}
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr class="border-t border-default font-medium">
          <th
            scope="row"
            class="py-1 text-left"
          >
            {{ t('forms.screens.review.total') }}
          </th>
          <td class="py-1 text-right">
            {{ t('forms.screens.review.out-of', { mark: mark(result.summary.total), max: result.summary.outOf }) }}
          </td>
          <td />
        </tr>
      </tfoot>
    </table>
    <ul
      v-if="result.reviews?.length"
      class="space-y-2"
      :aria-label="t('forms.screens.review.each')"
    >
      <li
        v-for="(r, i) in result.reviews"
        :key="i"
        class="rounded-md border border-default p-2 text-sm"
      >
        <p class="font-medium">
          {{ r.reviewer || t('forms.screens.review.a-reviewer') }}
          <span
            v-if="r.vote"
            class="font-normal text-muted"
          >{{ t(`forms.screens.review.voted.${r.vote}`) }}</span>
          <span
            v-else-if="result.summary"
            class="font-normal text-muted"
          >{{ result.summary.criteria.map(c => `${c.label} ${r.scores[c.id] ?? ''}`).join(', ') }}</span>
        </p>
        <p
          v-if="r.comment"
          class="whitespace-pre-line"
        >
          {{ r.comment }}
        </p>
      </li>
    </ul>
  </div>
</template>
