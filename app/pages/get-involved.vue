<script setup lang="ts">
// The one public page that is a landing page rather than a reading column (J-111). Everything on
// it comes from content/get-involved.md, so the committee changes words and never this file.
const { account } = useAccount()

const { data: page } = await useAsyncData('content:/get-involved', () => queryCollection('content').path('/get-involved').first())

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

const departments = computed(() => page.value?.departments ?? [])
const steps = computed(() => page.value?.steps ?? [])

// The tiles and the steps describe the theatre whoever writes the page; a quotation is somebody's
// own sentence, so it waits for the copy rather than standing in for it (D-103 criterion 6).
const quote = computed(() => (page.value?.placeholder ? null : page.value?.quote ?? null))

// Joining is a membership, so a member goes to their own record and everybody else starts with
// an account. The home page's invitation lands here and this is the step after it.
const joinTo = computed(() => (account.value.signedIn ? '/account/membership' : '/register'))

useSeoMeta({
  title: page.value.title,
  description: page.value.description,
})

useSchemaOrg([
  defineBreadcrumb({
    itemListElement: [
      { name: 'Home', item: '/' },
      { name: page.value.title, item: '/get-involved' },
    ],
  }),
])
</script>

<template>
  <div data-test="get-involved">
    <PhotoHero
      :src="page!.banner!"
      align="start"
      :title="page!.headline ?? page!.title"
      :description="page!.description"
    >
      <template
        v-if="page!.flash"
        #headline
      >
        <UBadge
          variant="sticker"
          size="lg"
        >
          {{ page!.flash }}
        </UBadge>
      </template>
      <template #links>
        <!-- The view's one marquee: joining is what this page is for. -->
        <UButton
          variant="marquee"
          size="lg"
          :to="joinTo"
          data-test="join-action"
        >
          Join the theatre
        </UButton>
        <UButton
          variant="poster"
          size="lg"
          to="/training/modules"
        >
          See what we teach
        </UButton>
      </template>
    </PhotoHero>

    <UContainer class="py-16">
      <UAlert
        v-if="page!.placeholder"
        data-test="placeholder-banner"
        color="warning"
        variant="subtle"
        icon="i-lucide-pencil"
        title="Awaiting committee copy"
        description="This page is a placeholder. It is not yet the committee's own words, and nothing on it should be read as fact."
        class="mb-12"
      />

      <section v-if="departments.length">
        <h2 class="nnt-headline text-3xl sm:text-4xl">
          Pick your department <span class="text-lg font-normal text-muted">(or several)</span>
        </h2>

        <ul class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <li
            v-for="department in departments"
            :key="department.title"
            class="nnt-ticket rounded-lg bg-elevated p-5"
            data-test="department"
          >
            <UIcon
              :name="department.icon"
              class="size-6 text-primary"
              aria-hidden="true"
            />
            <h3 class="mt-3 font-semibold text-highlighted">
              {{ department.title }}
            </h3>
            <p class="mt-2 text-sm text-muted">
              {{ department.blurb }}
            </p>
          </li>
        </ul>
      </section>

      <section
        v-if="steps.length"
        class="mt-16"
      >
        <h2 class="sr-only">
          How to start
        </h2>
        <ol class="grid gap-4 sm:grid-cols-3">
          <li
            v-for="(step, index) in steps"
            :key="step.title"
            class="rounded-lg bg-elevated p-5 ring-1 ring-default"
            data-test="step"
          >
            <p class="font-mono text-xs text-primary">
              {{ String(index + 1).padStart(2, '0') }}
            </p>
            <h3 class="mt-3 font-semibold text-highlighted">
              {{ step.title }}
            </h3>
            <p class="mt-2 text-sm text-muted">
              {{ step.blurb }}
            </p>
          </li>
        </ol>
      </section>
    </UContainer>

    <!-- The view's one spotlight. Nobody is quoted until the committee has chosen whose words
         these are, so the band is absent rather than filled with a stand-in (D-103 criterion 6). -->
    <div
      v-if="quote"
      class="dark nnt-spotlight"
      data-test="join-quote"
    >
      <UContainer class="py-16">
        <blockquote class="nnt-headline max-w-3xl text-2xl text-highlighted sm:text-3xl">
          {{ quote }}
        </blockquote>
        <UButton
          class="mt-8"
          variant="poster"
          size="lg"
          :to="joinTo"
        >
          Join the theatre
        </UButton>
      </UContainer>
    </div>

    <UContainer class="py-16">
      <UPage>
        <UPageBody
          class="max-w-prose"
          data-test="content-body"
        >
          <ContentRenderer :value="page!" />
        </UPageBody>
      </UPage>
    </UContainer>
  </div>
</template>
