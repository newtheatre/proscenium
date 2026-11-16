<template>
  <UApp>
    <NuxtLoadingIndicator />
    <!-- Reads each new page title to screen readers after a client-side navigation. -->
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
