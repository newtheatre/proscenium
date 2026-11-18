<!-- Files given as an answer: each by its name and size, and as a link to open it where the reader
     may. The answering page lists them unlinked, with what is happening to each. -->
<script setup lang="ts">
import type { FileRef } from '../../shared/engine'

defineProps<{ files: (FileRef & { status?: 'checking' | 'ready' })[], linked?: boolean, removable?: boolean }>()
const emit = defineEmits<{ remove: [id: string] }>()
const { t } = useT()
</script>

<template>
  <ul class="space-y-1">
    <li
      v-for="file in files"
      :key="file.id"
      class="flex items-center gap-2 text-sm"
    >
      <UIcon
        :name="file.type === 'application/pdf' ? 'i-lucide-file-text' : file.type.startsWith('image/') ? 'i-lucide-image' : 'i-lucide-paperclip'"
        class="size-4 shrink-0 text-muted"
      />
      <ULink
        v-if="linked"
        :to="`/files/${file.id}`"
        target="_blank"
        class="min-w-0 truncate text-primary underline-offset-2 hover:underline"
        external
      >
        {{ file.name }}
      </ULink>
      <span
        v-else
        class="min-w-0 truncate"
      >{{ file.name }}</span>
      <span class="shrink-0 text-muted tabular-nums">{{ formsFileSize(file.size) }}</span>
      <span
        v-if="file.status === 'checking'"
        class="flex shrink-0 items-center gap-1 text-muted"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-4 animate-spin"
        />
        {{ t('forms.screens.fill.file-checking') }}
      </span>
      <IconButton
        v-if="removable"
        icon="i-lucide-x"
        size="sm"
        :label="t('forms.screens.fill.file-remove', { name: file.name })"
        @click="emit('remove', file.id)"
      />
    </li>
  </ul>
</template>
