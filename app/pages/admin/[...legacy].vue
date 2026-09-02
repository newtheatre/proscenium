<script setup lang="ts">
// The console screens moved out of /admin and under the domain they belong to (0040). Static
// routes win over this catch-all, so /admin/settings and /admin/audit are unaffected.
const MOVED: Record<string, string> = {
  'people': '/people/accounts',
  'members': '/people/members',
  'fellows': '/people/fellows',
  'rooms': '/rooms/manage',
  'requests': '/rooms/manage/requests',
  'blackouts': '/rooms/manage/closures',
  'other-rooms': '/rooms/manage/other',
  'utilisation': '/rooms/manage/utilisation',
  'config': '/admin/settings',
  'su-requests': '/rooms/manage/requests?kind=unlisted',
  'training': '/training/manage',
  'departments': '/training/manage/departments',
  'training-records': '/training/manage/records',
  'training-sessions': '/training/manage/sessions',
  'training-recalculation': '/training/manage/recalculation',
}

definePageMeta({
  layout: 'console',
  redirect: (route) => {
    const segments = String(route.params.legacy).split(',').filter(Boolean)
    const moved = MOVED[segments[0] ?? '']
    // A path nobody moved goes to the console home rather than nowhere.
    if (!moved) return '/admin'
    // An account detail link carried the id in the next segment, so it is kept.
    return segments.length > 1 ? `${moved}/${segments.slice(1).join('/')}` : moved
  },
})
</script>

<template>
  <div />
</template>
