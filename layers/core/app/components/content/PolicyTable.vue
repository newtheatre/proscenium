<!-- A table a policy shows that the system builds from what modules declare, so it cannot fall
     behind them: ::policy-table{kind="cookies"}. Kinds: cookies, browser-storage, suppliers,
     supplier-cookies, privacy-records. Nothing is drawn while a table has no rows. -->
<script setup lang="ts">
const props = defineProps<{ kind: string }>()
const { data } = await usePolicyContext()
const table = computed(() => data.value?.tables?.[props.kind])
// A name written between backticks is a cookie's own name: drawn as code, never as markup.
const parts = (text: string) => text.split(/(`[^`]+`)/).filter(Boolean).map(part => part.startsWith('`') ? { code: part.slice(1, -1) } : { text: part })
</script>

<template>
  <ProseTable v-if="table?.rows.length">
    <ProseThead>
      <ProseTr>
        <ProseTh
          v-for="header in table.headers"
          :key="header"
        >
          {{ header }}
        </ProseTh>
      </ProseTr>
    </ProseThead>
    <ProseTbody>
      <ProseTr
        v-for="(row, r) in table.rows"
        :key="r"
      >
        <ProseTd
          v-for="(cell, c) in row"
          :key="c"
        >
          <template
            v-for="(part, p) in parts(cell)"
            :key="p"
          >
            <ProseCode v-if="part.code">
              {{ part.code }}
            </ProseCode>
            <template v-else>
              {{ part.text }}
            </template>
          </template>
        </ProseTd>
      </ProseTr>
    </ProseTbody>
  </ProseTable>
</template>
