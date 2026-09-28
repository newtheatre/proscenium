<script setup lang="ts">
// The house logo, in one place because the header, the footer and the way in all draw it. Plain
// image rather than a link: `UHeader` and `UFooter` wrap it in their own anchor already (0021).
</script>

<template>
  <!-- White on stage black: every caller sits inside a `dark` subtree. The alt text is the name the
       wrapping anchor is read by. -->
  <img
    src="/images/logos/anniversary-white-trimmed.webp"
    alt="The Nottingham New Theatre"
    width="650"
    height="128"
    class="block h-7 w-auto sm:h-9"
    data-test="site-wordmark"
  >
</template>
