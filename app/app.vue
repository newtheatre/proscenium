<template>
  <UApp>
    <NuxtRouteAnnouncer />

    <!--
      The admin pages fetch their data on the server rather than after
      hydration, so a client-side navigation waits for that data before the new
      page paints. Without a progress bar that reads as a dead click: you press
      "Ticket types" and nothing happens for as long as the query takes. This is
      the feedback that makes server-rendered navigation feel deliberate rather
      than broken.
    -->
    <NuxtLoadingIndicator />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
