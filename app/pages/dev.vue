<script setup lang="ts">
import { renderSVG } from 'uqr'
import type { Persona } from '#shared/utils/personas'

// Development only: nuxt.config keeps this file out of a production build (K-124).

definePageMeta({ layout: 'console', title: 'Developer tools' })

interface Seeded { id: string, email: string, name: string, anonymisedAt: number | null }
interface Row extends Persona { account: Seeded | null }
interface Letter { name: string, to: string, subject: string, body: string }

interface Tools {
  session: { id: string, name: string, email: string, roles: string[], permissions: string[], factor: boolean } | null
  personas: Row[]
  mailbox: Letter[]
  totp: { secret: string, uri: string }
}

const toast = useToast()
const { refresh: refreshAccount } = useAccount()
const tools = ref<Tools | null>(null)
const working = ref('')
const reading = ref<Letter | null>(null)
const totpQr = computed(() => tools.value ? `data:image/svg+xml;base64,${btoa(renderSVG(tools.value.totp.uri))}` : '')

async function load(): Promise<void> {
  tools.value = await $fetch<Tools>('/api/dev')
}

async function seed(): Promise<void> {
  working.value = 'seed'
  try {
    const answer = await $fetch<{ made: number, held: number }>('/api/dev/seed', { method: 'POST' })
    toast.add({ title: `${answer.made} made, ${answer.held} already there`, icon: 'i-lucide-sprout' })
    await load()
  }
  finally {
    working.value = ''
  }
}

async function be(row: Row): Promise<void> {
  if (!row.account) return
  working.value = row.email
  try {
    const answer = await $fetch<{ name: string }>('/api/dev/sign-in-as', { method: 'POST', body: { userId: row.account.id } })
    await refreshAccount()
    toast.add({ title: `Signed in as ${answer.name}`, icon: 'i-lucide-user-check', color: 'success' })
    await load()
  }
  catch (error) {
    toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    working.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <UAlert
      color="warning"
      variant="subtle"
      icon="i-lucide-flask-conical"
      title="Development only"
      description="These tools sign in without a password. They are not in a production build: nuxt.config leaves the route out of the bundle rather than guarding it at runtime."
    />

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-database"
      title="This seeds the accounts only"
      description="Shows, performances, bookings, the rota, the bar and the ledger come from `bun run seed`, which prints the credentials it generates once. Both write the same personas, so either order works."
    />

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="nnt-headline text-lg">
            Be somebody
          </h2>
          <UButton
            icon="i-lucide-sprout"
            color="neutral"
            variant="outline"
            :loading="working === 'seed'"
            data-test="dev-seed"
            @click="seed"
          >
            Seed the personas
          </UButton>
        </div>
      </template>

      <ul class="divide-y divide-default">
        <li
          v-for="row in tools?.personas ?? []"
          :key="row.email"
          class="flex flex-wrap items-center gap-3 py-3"
        >
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-2 text-sm font-medium">
              {{ row.name }}
              <UBadge
                v-if="row.role"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                {{ row.role }}
              </UBadge>
              <UBadge
                v-if="row.shape !== 'full'"
                color="warning"
                variant="subtle"
                size="sm"
              >
                {{ row.shape }}
              </UBadge>
            </p>
            <p class="text-sm text-muted">
              {{ row.describes }}
            </p>
          </div>

          <UButton
            v-if="row.account && row.shape !== 'tombstone'"
            size="sm"
            :loading="working === row.email"
            :data-test="`dev-be-${row.role ?? row.shape}`"
            @click="be(row)"
          >
            Be them
          </UButton>
          <UBadge
            v-else-if="row.account"
            color="neutral"
            variant="subtle"
          >
            Nobody to be
          </UBadge>
          <span
            v-else
            class="text-sm text-muted"
          >Not seeded</span>
        </li>
      </ul>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="nnt-headline text-lg">
          Authenticator app
        </h2>
      </template>

      <div class="flex flex-wrap items-center gap-4">
        <img
          data-test="dev-totp-qr"
          :src="totpQr"
          alt="QR code for the shared persona authenticator secret"
          class="size-32 rounded border border-default"
        >
        <div class="space-y-1 text-sm">
          <p class="text-muted">
            Every seeded 'full' persona already has this confirmed as its second factor, so no
            admin screen refuses one for lacking an authenticator. Scan it once and the same code
            works for any of them, across every reseed.
          </p>
          <p
            data-test="dev-totp-secret"
            class="font-mono text-muted"
          >
            {{ tools?.totp.secret }}
          </p>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="nnt-headline text-lg">
          This session
        </h2>
      </template>

      <div
        v-if="tools?.session"
        class="space-y-3 text-sm"
        data-test="dev-session"
      >
        <p>
          {{ tools.session.name }}
          <span class="font-mono text-muted">{{ tools.session.email }}</span>
        </p>
        <div class="flex flex-wrap gap-1">
          <UBadge
            v-for="role in tools.session.roles"
            :key="role"
            variant="subtle"
          >
            {{ role }}
          </UBadge>
          <UBadge
            :color="tools.session.factor ? 'success' : 'warning'"
            variant="subtle"
          >
            {{ tools.session.factor ? 'authenticator enrolled' : 'no authenticator' }}
          </UBadge>
        </div>
        <div class="flex flex-wrap gap-1">
          <UBadge
            v-for="permission in tools.session.permissions"
            :key="permission"
            color="neutral"
            variant="subtle"
            size="sm"
            class="font-mono"
          >
            {{ permission }}
          </UBadge>
          <span
            v-if="!tools.session.permissions.length"
            class="text-sm text-muted"
          >No permissions. Every admin screen refuses this session.</span>
        </div>
      </div>
      <p
        v-else
        class="text-sm text-muted"
      >
        Nobody is signed in.
      </p>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="nnt-headline text-lg">
          Mailbox
        </h2>
      </template>

      <p
        v-if="!tools?.mailbox.length"
        class="text-sm text-muted"
      >
        Nothing sent yet. Development never hands a message to a provider; it writes it to
        <span class="font-mono">.data/mail</span> instead.
      </p>
      <ul
        v-else
        class="divide-y divide-default"
        data-test="dev-mailbox"
      >
        <li
          v-for="letter in tools.mailbox"
          :key="letter.name"
          class="flex flex-wrap items-center gap-3 py-2"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm">
              {{ letter.subject }}
            </p>
            <p class="truncate font-mono text-xs text-muted">
              {{ letter.to }}
            </p>
          </div>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            @click="reading = letter"
          >
            Read
          </UButton>
        </li>
      </ul>
    </UCard>

    <UModal
      :open="reading !== null"
      :title="reading?.subject ?? ''"
      :description="reading?.to ?? ''"
      @update:open="reading = null"
    >
      <template #body>
        <pre class="overflow-x-auto whitespace-pre-wrap text-xs">{{ reading?.body }}</pre>
      </template>
    </UModal>
  </div>
</template>
