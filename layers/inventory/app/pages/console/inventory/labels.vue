<!-- Labels (S11): a sheet to print, one label per item with its QR code, tag, name and department,
     at the size the theatre sets (inventory.labels.size). The code holds the item's address, which
     opens only for someone signed in who may see it. Black on white whatever the screen's mode. -->
<script setup lang="ts">
definePageMeta({ layout: 'live' })

interface Sheet { size: 'small' | 'large', labels: { id: string, tag: string, name: string, department: string }[] }

const { t } = useT()
const route = useRoute()
const origin = useRequestURL().origin
const items = computed(() => String(route.query.items ?? ''))
const { data, status, error, refresh } = await useAPI<Sheet>('/api/inventory/labels', { key: `inventory:labels:${items.value}`, query: { items } })
const print = () => window.print()
useHead({ title: () => t('inventory.labels.title') })
</script>

<template>
  <div class="flex-1 p-4 sm:p-6 print:bg-white print:p-0 print:text-black">
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div class="mb-4 flex flex-wrap items-start justify-between gap-3 print:hidden">
          <div>
            <h1 class="text-2xl font-semibold">
              {{ t('inventory.labels.title') }}
            </h1>
            <p class="text-sm text-muted">
              {{ t('inventory.labels.help', { count: d.labels.length }) }}
            </p>
          </div>
          <div class="flex gap-2">
            <UButton
              to="/console/inventory"
              icon="i-lucide-package"
              color="neutral"
              variant="outline"
              size="xl"
              :label="t('inventory.navigation.items.label')"
            />
            <UButton
              icon="i-lucide-printer"
              size="xl"
              :disabled="!d.labels.length"
              :label="t('inventory.labels.print')"
              @click="print"
            />
          </div>
        </div>
        <EmptyState
          v-if="!d.labels.length"
          icon="i-lucide-qr-code"
          :title="t('inventory.labels.none')"
        />
        <ul
          v-else
          class="grid gap-3 print:gap-2"
          :class="d.size === 'large' ? 'grid-cols-1 sm:grid-cols-2 print:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 print:grid-cols-4'"
          :aria-label="t('inventory.labels.title')"
        >
          <li
            v-for="label in d.labels"
            :key="label.id"
            class="flex break-inside-avoid items-center gap-3 rounded-md border border-default bg-white p-2 text-black print:rounded-none print:border-black"
          >
            <QrCode
              :value="itemAddress(origin, label.id)"
              :label="t('inventory.labels.code', { tag: label.tag })"
              :class="d.size === 'large' ? 'w-32 shrink-0' : 'w-20 shrink-0'"
            />
            <div class="min-w-0 space-y-0.5">
              <p
                class="font-mono font-semibold tracking-wide"
                :class="d.size === 'large' ? 'text-xl' : 'text-base'"
              >
                {{ label.tag }}
              </p>
              <p class="truncate text-sm">
                {{ label.name }}
              </p>
              <p class="truncate text-xs">
                {{ label.department }}
              </p>
            </div>
          </li>
        </ul>
      </template>
    </DataBoundary>
  </div>
</template>
