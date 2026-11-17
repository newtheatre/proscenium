<!-- A sample live screen, so the live layout and PageLive can be checked in a browser. -->
<template>
  <PageLive
    title="Sample door"
    context="Sample show, 7.30pm"
  >
    <div class="grid gap-4 sm:grid-cols-2">
      <UButton
        label="Admit"
        icon="i-lucide-check"
        size="xl"
        block
      />
      <UButton
        label="Problem"
        icon="i-lucide-triangle-alert"
        color="warning"
        variant="outline"
        size="xl"
        block
      />
    </div>
  </PageLive>
</template>
