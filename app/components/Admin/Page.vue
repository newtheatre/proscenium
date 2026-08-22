<!--
The root element of an admin page, and almost nothing else: the panel body
already provides padding, scrolling and rhythm (ADR-0012).
-->
<template>
  <!--
  `min-w-0` lets children be narrower than their content; `shrink-0` stops them
  being shorter. Both are needed (ADR-0012).
  -->
  <div class="flex flex-1 flex-col gap-4 sm:gap-6 min-h-0 min-w-0 [&>*]:min-w-0 [&>*]:shrink-0">
    <slot />
  </div>
</template>
