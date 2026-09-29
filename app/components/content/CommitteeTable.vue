<script setup lang="ts">
import { saysHolders } from '#shared/utils/committee'
import { saysDayLong } from '#shared/utils/when'

// The about page's `::committee-table`, drawn from content/committee.yml so the handover edits
// one file (0107, D-103 criterion 10).
const { data: committee } = await useAsyncData('committee-table', () => queryCollection('committee').first())
</script>

<template>
  <div
    v-if="committee"
    data-test="committee-table"
  >
    <ProseTable>
      <ProseThead>
        <ProseTr>
          <ProseTh>Role</ProseTh>
          <ProseTh>Name</ProseTh>
          <ProseTh>Contact</ProseTh>
        </ProseTr>
      </ProseThead>
      <ProseTbody>
        <ProseTr
          v-for="role in committee.roles"
          :key="role.key"
        >
          <ProseTd>{{ role.title }}</ProseTd>
          <ProseTd>{{ saysHolders(role.holders) }}</ProseTd>
          <ProseTd>
            <ProseA
              v-if="role.email"
              :href="`mailto:${role.email}`"
            >
              {{ role.email }}
            </ProseA>
          </ProseTd>
        </ProseTr>
      </ProseTbody>
    </ProseTable>
    <p
      class="text-sm text-muted"
      data-test="committee-updated"
    >
      Last updated {{ saysDayLong(committee.updatedOn, { year: true }) }}.
    </p>
  </div>
</template>
