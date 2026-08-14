/**
 * Create a show, optionally with its first performances.
 *
 * The show is created first, then each pending performance in sequence — so a
 * failure part-way leaves a real show with fewer performances than asked for,
 * not a half-written one.
 */
<script setup lang="ts">
import * as z from 'zod'
import type { StepperItem } from '@nuxt/ui'

const emit = defineEmits<{
  refresh: []
}>()

const { data: venues } = useVenues()
const toast = useToast()
const open = ref(false)
const currentStep = ref(0)
const isSubmitting = ref(false)

// ─── Step 1: Show details ────────────────────────────────────────────────────

const step1Schema = z.object({
  title: z.string().min(1, 'Title is required'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Only lowercase letters, numbers, and hyphens'),
  subtitle: z.string().optional(),
  description: z.string().optional(),
})
type Step1Schema = z.output<typeof step1Schema>

const step1 = reactive<Partial<Step1Schema>>({
  title: '',
  slug: '',
  subtitle: '',
  description: '',
})
let slugManuallyEdited: boolean = false
function markSlugEdited() {
  slugManuallyEdited = true
}
const step1Error = ref('')

watch(
  () => step1.title,
  (title) => {
    if (!slugManuallyEdited && title) {
      step1.slug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
    }
  },
)

function tryGoToStep2() {
  const result = step1Schema.safeParse(step1)
  if (!result.success) {
    step1Error.value = result.error.issues[0]?.message ?? 'Please fix the errors above'
    return
  }
  step1Error.value = ''
  currentStep.value = 1
}

// ─── Step 2: Performances ────────────────────────────────────────────────────

interface PendingPerformance {
  _id: string
  venueId: string
  date: string // YYYY-MM-DD
  time: string // HH:MM
  doorsTime: string // HH:MM, relative to same date
  doorsManuallyEdited: boolean
  durationMinutes: number | null
  intervalCount: number
  intervalMinutes: number | null
  capacityOverride: number | null
  notes: string
}

const pendingPerformances = ref<PendingPerformance[]>([])

// ─── Show-level scheduling defaults ─────────────────────────────────────────
// Set here in step 1; performances inherit these and can individually override.

const defaultVenueId = computed(() => venues.value?.[0]?.id ?? '')

// These are reactive refs — populated in step 1 and inherited by each performance
const showDefaults = reactive({
  venueId: '', // populated when venues load
  durationMinutes: null as number | null,
  intervalCount: 0,
  intervalMinutes: null as number | null,
  capacityOverride: null as number | null,
})

watch(defaultVenueId, (id) => {
  if (id && !showDefaults.venueId) showDefaults.venueId = id
}, { immediate: true })

// Auto-derive doors 30 min before a start time string (HH:MM → HH:MM)
function autoDoorsTime(time: string): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return ''
  const totalMin = h * 60 + m - 30
  const dh = Math.floor(((totalMin % 1440) + 1440) % 1440 / 60)
  const dm = ((totalMin % 1440) + 1440) % 1440 % 60
  return `${String(dh).padStart(2, '0')}:${String(dm).padStart(2, '0')}`
}

function onPerformanceTimeChange(perf: PendingPerformance) {
  if (!perf.doorsManuallyEdited) {
    perf.doorsTime = autoDoorsTime(perf.time)
  }
}

function addPerformance() {
  const time = '19:30'
  pendingPerformances.value.push({
    _id: Math.random().toString(36).slice(2),
    venueId: showDefaults.venueId || defaultVenueId.value,
    date: '',
    time,
    doorsTime: autoDoorsTime(time),
    doorsManuallyEdited: false,
    durationMinutes: showDefaults.durationMinutes,
    intervalCount: showDefaults.intervalCount,
    intervalMinutes: showDefaults.intervalMinutes,
    capacityOverride: showDefaults.capacityOverride,
    notes: '',
  })
}

function removePerformance(id: string) {
  pendingPerformances.value = pendingPerformances.value.filter(p => p._id !== id)
}

function toUnix(date: string, time: string): number | null {
  if (!date || !time) return null
  const d = new Date(`${date}T${time}:00`)
  return Number.isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000)
}

// ─── Poster ──────────────────────────────────────────────────────────────────

const imageFile = ref<File | null>(null)
const imagePreview = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

function handlePosterSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    toast.add({ title: 'File too large', description: 'Poster must be under 5 MB', icon: 'i-lucide-x-circle', color: 'error' })
    input.value = ''
    return
  }
  imageFile.value = file
  const reader = new FileReader()
  reader.onload = (e) => {
    imagePreview.value = e.target?.result as string
  }
  reader.readAsDataURL(file)
}

// ─── Step 3: Review & create ─────────────────────────────────────────────────

const initialStatus = ref<'DRAFT' | 'PUBLISHED'>('DRAFT')

const statusItems = [
  { label: 'Draft — not visible to the public', value: 'DRAFT' },
  { label: 'Published — visible to the public', value: 'PUBLISHED' },
]

async function onSubmit() {
  const result = step1Schema.safeParse(step1)
  if (!result.success) {
    currentStep.value = 0
    step1Error.value = result.error.issues[0]?.message ?? 'Please fix errors in the Show Details step'
    return
  }

  isSubmitting.value = true
  try {
    const show = await $fetch<{ id: string, title: string }>('/api/shows', {
      method: 'POST',
      body: {
        title: step1.title,
        slug: step1.slug,
        subtitle: step1.subtitle || undefined,
        description: step1.description || undefined,
        status: initialStatus.value,
      },
    })

    if (imageFile.value) {
      const fd = new FormData()
      fd.append('poster', imageFile.value)
      await $fetch(`/api/shows/${show.id}/poster`, { method: 'POST', body: fd })
    }

    for (const p of pendingPerformances.value) {
      const startsAt = toUnix(p.date, p.time)
      if (!startsAt || !p.venueId) continue

      const doorsAt = p.doorsTime ? toUnix(p.date, p.doorsTime) : null
      // Performance status follows show's initial publish status
      const perfStatus = initialStatus.value === 'PUBLISHED' ? 'ON_SALE' : 'DRAFT'

      await $fetch(`/api/shows/${show.id}/performances`, {
        method: 'POST',
        body: {
          venueId: p.venueId,
          startsAt,
          doorsAt,
          durationMinutes: p.durationMinutes,
          intervalCount: p.intervalCount,
          intervalMinutes: p.intervalMinutes,
          capacityOverride: p.capacityOverride,
          status: perfStatus,
          notes: p.notes || null,
        },
      })
    }

    toast.add({
      title: 'Show created',
      description: `"${step1.title}" created with ${pendingPerformances.value.length} performance(s)`,
      icon: 'i-lucide-check',
      color: 'success',
    })

    open.value = false
    resetAll()
    emit('refresh')
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to create show'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    isSubmitting.value = false
  }
}

// ─── Shared ──────────────────────────────────────────────────────────────────

const stepperItems: StepperItem[] = [
  { title: 'Details', description: 'Title and description', icon: 'i-lucide-clapperboard-list' },
  { title: 'Performances', description: 'Schedule performances', icon: 'i-lucide-calendar-clock' },
  { title: 'Review', description: 'Confirm and create', icon: 'i-lucide-circle-check' },
]

const venueItems = computed(
  () => venues.value?.map(v => ({ label: v.name, value: v.id })) ?? [],
)

function resetAll() {
  step1.title = ''
  step1.slug = ''
  step1.subtitle = ''
  step1.description = ''
  slugManuallyEdited = false
  step1Error.value = ''
  pendingPerformances.value = []
  initialStatus.value = 'DRAFT'
  currentStep.value = 0
  showDefaults.venueId = defaultVenueId.value
  showDefaults.durationMinutes = null
  showDefaults.intervalCount = 0
  showDefaults.intervalMinutes = null
  showDefaults.capacityOverride = null
  imageFile.value = null
  imagePreview.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
}
</script>

<template>
  <UButton
    label="New Show"
    icon="i-lucide-plus"
    @click="() => { open = true }"
  />

  <UModal
    v-model:open="open"
    :ui="{ content: 'sm:max-w-2xl' }"
    title="Create show"
    description="Set up a new production and schedule performances."
    @close="resetAll"
  >
    <template #body>
      <div class="space-y-6">
        <UStepper
          v-model="currentStep"
          disabled
          :items="stepperItems"
          class="w-full"
        />

        <!-- ── Step 0: Show details ──────────────────────────────── -->
        <template v-if="currentStep === 0">
          <UForm
            :schema="step1Schema"
            :state="step1"
            class="space-y-4"
          >
            <UFormField
              name="title"
              label="Title"
              required
            >
              <UInput
                v-model="step1.title"
                placeholder="e.g. The Importance of Being Earnest"
                class="w-full"
              />
            </UFormField>

            <UFormField
              name="slug"
              label="URL slug"
              hint="Used to identify the show in URLs"
              required
            >
              <UInput
                v-model="step1.slug"
                placeholder="importance-of-being-earnest"
                class="w-full"
                @input="markSlugEdited"
              />
            </UFormField>

            <UFormField
              name="subtitle"
              label="Subtitle"
            >
              <UInput
                v-model="step1.subtitle"
                placeholder="A trivial comedy for serious people"
                class="w-full"
              />
            </UFormField>

            <UFormField
              name="description"
              label="Description"
            >
              <UTextarea
                v-model="step1.description"
                placeholder="A brief description of the show..."
                class="w-full"
                :rows="3"
              />
            </UFormField>

            <UFormField label="Poster image">
              <div class="flex items-center gap-3">
                <div
                  v-if="imagePreview"
                  class="relative size-16 shrink-0 rounded-md overflow-hidden border border-default"
                >
                  <img
                    :src="imagePreview"
                    alt="Poster preview"
                    class="w-full h-full object-cover"
                  >
                </div>
                <div
                  v-else
                  class="size-16 shrink-0 rounded-md border border-dashed border-default flex items-center justify-center text-muted"
                >
                  <UIcon
                    name="i-lucide-image"
                    class="size-6"
                  />
                </div>
                <div class="flex flex-col gap-1">
                  <UButton
                    :label="imageFile ? 'Change poster' : 'Upload poster'"
                    icon="i-lucide-upload"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    @click="fileInputRef?.click()"
                  />
                  <UButton
                    v-if="imageFile"
                    label="Remove"
                    size="sm"
                    color="error"
                    variant="ghost"
                    @click="() => { imageFile = null; imagePreview = null }"
                  />
                  <p class="text-xs text-muted">
                    JPEG, PNG or WebP, max 5 MB
                  </p>
                </div>
              </div>
              <input
                ref="fileInputRef"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                class="hidden"
                @change="handlePosterSelect"
              >
            </UFormField>
          </UForm>

          <!-- Show-level scheduling defaults -->
          <div class="border-t border-default pt-4 space-y-3">
            <p class="text-sm font-medium text-muted">
              Scheduling defaults
              <span class="font-normal">— inherited by each performance, and can be overridden per performance</span>
            </p>

            <div class="grid grid-cols-2 gap-x-4 gap-y-3">
              <UFormField
                label="Default venue"
                class="col-span-2"
              >
                <USelect
                  v-model="showDefaults.venueId"
                  :items="venueItems"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Duration (minutes)">
                <UInput
                  v-model.number="showDefaults.durationMinutes"
                  type="number"
                  min="1"
                  placeholder="120"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Capacity override">
                <UInput
                  v-model.number="showDefaults.capacityOverride"
                  type="number"
                  min="1"
                  placeholder="Venue default"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Intervals">
                <UInput
                  v-model.number="showDefaults.intervalCount"
                  type="number"
                  min="0"
                  max="5"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Interval length (minutes)">
                <UInput
                  v-model.number="showDefaults.intervalMinutes"
                  type="number"
                  min="1"
                  placeholder="20"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>

          <p
            v-if="step1Error"
            class="text-sm text-error"
          >
            {{ step1Error }}
          </p>

          <div class="flex justify-end pt-2">
            <UButton
              label="Next: Performances"
              trailing-icon="i-lucide-arrow-right"
              @click="tryGoToStep2"
            />
          </div>
        </template>

        <!-- ── Step 1: Performances ─────────────────────────────── -->
        <template v-else-if="currentStep === 1">
          <div
            v-if="pendingPerformances.length === 0"
            class="text-center py-8 text-muted border border-dashed border-default rounded-lg"
          >
            <UIcon
              name="i-lucide-calendar-x"
              class="size-10 mx-auto mb-2 opacity-40"
            />
            <p class="text-sm">
              No performances yet. You can add them now or after the show is created.
            </p>
          </div>

          <div
            v-for="(perf, idx) in pendingPerformances"
            :key="perf._id"
            class="border border-default rounded-lg p-4 space-y-3"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold text-highlighted">
                Performance {{ idx + 1 }}
              </span>
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="xs"
                @click="removePerformance(perf._id)"
              />
            </div>

            <div class="grid grid-cols-2 gap-x-4 gap-y-3">
              <UFormField
                label="Venue"
                class="col-span-2"
              >
                <USelect
                  v-model="perf.venueId"
                  :items="venueItems"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Date">
                <UInput
                  v-model="perf.date"
                  type="date"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Start time">
                <UInput
                  v-model="perf.time"
                  type="time"
                  class="w-full"
                  @change="onPerformanceTimeChange(perf)"
                />
              </UFormField>

              <UFormField label="Doors open">
                <UInput
                  v-model="perf.doorsTime"
                  type="time"
                  class="w-full"
                  @change="perf.doorsManuallyEdited = true"
                />
              </UFormField>

              <UFormField label="Duration (minutes)">
                <UInput
                  v-model.number="perf.durationMinutes"
                  type="number"
                  min="1"
                  :placeholder="showDefaults.durationMinutes ? String(showDefaults.durationMinutes) : '120'"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Intervals">
                <UInput
                  v-model.number="perf.intervalCount"
                  type="number"
                  min="0"
                  max="5"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Interval length (minutes)">
                <UInput
                  v-model.number="perf.intervalMinutes"
                  type="number"
                  min="1"
                  placeholder="20"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Capacity override">
                <UInput
                  v-model.number="perf.capacityOverride"
                  type="number"
                  min="1"
                  :placeholder="showDefaults.capacityOverride ? String(showDefaults.capacityOverride) : 'Venue default'"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                label="Internal notes"
                class="col-span-2"
              >
                <UInput
                  v-model="perf.notes"
                  placeholder="Production or scheduling notes..."
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>

          <UButton
            label="Add performance"
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            block
            @click="addPerformance"
          />

          <div class="flex justify-between pt-2">
            <UButton
              label="Back"
              leading-icon="i-lucide-arrow-left"
              color="neutral"
              variant="ghost"
              @click="() => { currentStep = 0 }"
            />
            <UButton
              label="Next: Review"
              trailing-icon="i-lucide-arrow-right"
              @click="() => { currentStep = 2 }"
            />
          </div>
        </template>

        <!-- ── Step 2: Review & create ──────────────────────────── -->
        <template v-else-if="currentStep === 2">
          <div class="space-y-4">
            <div class="rounded-lg bg-elevated/50 border border-default p-4 space-y-1.5">
              <p class="font-semibold text-highlighted">
                {{ step1.title }}
              </p>
              <p
                v-if="step1.subtitle"
                class="text-sm text-muted"
              >
                {{ step1.subtitle }}
              </p>
              <code class="text-xs bg-muted/20 text-muted rounded px-1.5 py-0.5">
                /shows/{{ step1.slug }}
              </code>
            </div>

            <div
              v-if="pendingPerformances.length > 0"
              class="space-y-1"
            >
              <p class="text-sm font-medium">
                {{ pendingPerformances.length }} performance(s):
              </p>
              <ul class="space-y-1">
                <li
                  v-for="p in pendingPerformances"
                  :key="p._id"
                  class="text-sm text-muted flex items-center gap-2"
                >
                  <UIcon
                    name="i-lucide-calendar"
                    class="size-4 shrink-0"
                  />
                  <span>
                    {{ venues?.find(v => v.id === p.venueId)?.name ?? 'Unknown venue' }}
                    — {{ p.date }} at {{ p.time }}
                  </span>
                </li>
              </ul>
            </div>
            <p
              v-else
              class="text-sm text-muted"
            >
              No performances — you can schedule them after creation.
            </p>

            <UFormField
              label="Initial status"
              hint="You can change this at any time"
            >
              <USelect
                v-model="initialStatus"
                :items="statusItems"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="flex justify-between pt-2">
            <UButton
              label="Back"
              leading-icon="i-lucide-arrow-left"
              color="neutral"
              variant="ghost"
              @click="() => { currentStep = 1 }"
            />
            <UButton
              label="Create show"
              icon="i-lucide-check"
              :loading="isSubmitting"
              @click="onSubmit"
            />
          </div>
        </template>
      </div>
    </template>
  </UModal>
</template>
