<!-- The public shell, plain until the interface workstream's design lands: a skip link, a header
     with the colour-mode switch, the page and a footer. -->
<template>
  <div>
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-default focus:px-3 focus:py-2"
    >Skip to content</a>
    <UHeader
      title="Home"
      :toggle="false"
    >
      <template #right>
        <UColorModeButton />
      </template>
    </UHeader>
    <UMain id="main">
      <slot />
    </UMain>
    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          Runs on Proscenium
        </p>
      </template>
    </UFooter>
  </div>
</template>
