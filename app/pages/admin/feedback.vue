<script setup lang="ts">
import { feedbackList, linkableIssue, linkablePage, saysFeedbackKind, saysFeedbackStatus } from '#shared/utils/feedback-list'
import { saysWhen } from '#shared/utils/when'
import type { FeedbackRow } from '#shared/utils/feedback-list'
import type { Page } from '#shared/utils/pagination'

definePageMeta({ layout: 'console', title: 'Problem reports', middleware: 'console', docs: '/docs/system/reporting-a-problem-or-an-idea' })

const request = useRequestFetch()

// Search, the filters, sort and page live in the URL (K-129).
const { search, conditions, sort, page, query, active, set, setSort, clear } = useListQuery(feedbackList)

const empty = (): Page<FeedbackRow> => ({ items: [], page: 1, pageSize: 25, total: 0, pages: 1 })

const { data, status: loading, error, refresh } = await useAsyncData(
  'feedback-reports',
  () => request<Page<FeedbackRow>>('/api/admin/feedback', { query: query.value }),
  { watch: [query], default: empty },
)

const failure = useListFailure(error, 'The reports could not be read.')
const reports = computed<FeedbackRow[]>(() => data.value.items)
</script>

<template>
  <ReadGate
    :failure="failure"
    class="space-y-6"
    @retry="refresh"
  >
    <p class="text-sm text-muted">
      Everything sent with the megaphone button, newest first, as the daily triage also reads it.
    </p>

    <AdminToolbar
      v-model:search="search"
      :placeholder="feedbackList.search.placeholder"
      :active="active"
      :loading="loading === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="feedbackList"
          :conditions="conditions"
          :sort="sort"
          @set="set"
          @sort="setSort"
        />
      </template>
    </AdminToolbar>

    <p
      v-if="reports.length === 0"
      class="py-6 text-center text-sm text-muted"
      data-test="feedback-empty"
    >
      {{ active.length ? 'No report matches that.' : 'Nobody has sent a report yet.' }}
    </p>
    <ul
      v-else
      class="space-y-3"
      data-test="feedback-list"
    >
      <li
        v-for="report in reports"
        :key="report.id"
        class="space-y-1 rounded-lg border border-default p-3 text-sm"
        :data-test="`feedback-${report.id}`"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">{{ saysFeedbackKind(report.kind) }}</span>
          <UBadge
            :color="report.status === 'NEW' ? 'primary' : 'neutral'"
            variant="subtle"
            size="sm"
          >
            {{ saysFeedbackStatus(report.status) }}
          </UBadge>
        </div>
        <p class="whitespace-pre-line">
          {{ report.body }}
        </p>
        <p class="text-xs text-muted">
          {{ report.reporterName ?? 'An account since removed' }}, {{ saysWhen(report.createdAt) }}, from
          <ULink
            v-if="linkablePage(report.pagePath)"
            :to="linkablePage(report.pagePath)!"
            class="underline"
          >{{ report.pagePath }}</ULink>
          <span v-else>{{ report.pagePath }}</span>
          <template v-if="linkableIssue(report.issueUrl)">
            ·
            <ULink
              :to="linkableIssue(report.issueUrl)!"
              target="_blank"
              class="underline"
            >Its issue</ULink>
          </template>
        </p>
      </li>
    </ul>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="feedback-total"
        class="text-sm text-muted"
      >
        {{ plural(data.total, 'report') }}
      </p>
      <UPagination
        v-if="data.pages > 1"
        v-model:page="page"
        :total="data.total"
        :items-per-page="data.pageSize"
      />
    </div>
  </ReadGate>
</template>
