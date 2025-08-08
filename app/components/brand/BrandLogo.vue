<template>
  <div class="brand-logo">
    <NuxtImg
      class="brand-logo__full"
      src="/images/logos/nnt_logo-dark.png"
      alt="Logo"
    />
    <NuxtImg
      class="brand-logo__squares"
      src="/images/logos/nnt_squares.png"
      alt="Logo"
    />
  </div>
</template>

<style scoped>
.brand-logo {
  width: 100%;
  margin: 0 auto;
}

.brand-logo__full {
  width: auto;
  height: 2.6rem;
}

.brand-logo__squares {
  display: none;
}

@media (max-width: 768px) {
  .brand-logo__full {
    display: none;
  }

  .brand-logo__squares {
    display: block;
    width: auto;
    height: 2.6rem;
  }
}
</style>
