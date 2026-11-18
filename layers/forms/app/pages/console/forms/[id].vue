<!-- The builder (FB-201 to FB-207), on one page: the outline of pages, the canvas, and the details
     of whatever is selected beside it. Every change saves itself. Problems are listed as the author
     works, Preview fills the draft in without keeping anything, and Publish states its impact. -->
<script setup lang="ts">
import type { BuilderData } from '../../../composables/useFormBuilder'

const route = useRoute()
const id = String(route.params.id)
const { data, status, error, refresh } = await useAPI<BuilderData>(`/api/forms/forms/${id}`, { key: `forms:form:${id}` })
</script>

<template>
  <DataBoundary
    v-if="!data"
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <span />
  </DataBoundary>
  <FormsBuilder
    v-else
    :data="data"
    @changed="refresh()"
  />
</template>
