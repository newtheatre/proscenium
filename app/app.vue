<template>
  <UApp>
    <NuxtRouteAnnouncer />

    <!--
    Admin pages fetch on the server (ADR-0013), so a client-side navigation
    waits for the query before the new page paints. Without a progress bar that
    reads as a dead click.
    -->
    <NuxtLoadingIndicator />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
