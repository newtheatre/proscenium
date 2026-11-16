<!-- A plain shell until workstream 6's interface lands: a skip link, a header and the page. -->
<template>
  <div>
    <a
      href="#main"
      class="skip"
    >Skip to content</a>
    <header>
      <NuxtLink to="/">
        Home
      </NuxtLink>
    </header>
    <main id="main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.skip { position: absolute; left: -999px; }
.skip:focus { left: 1rem; top: 1rem; }
</style>
