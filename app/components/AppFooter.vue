<template>
  <USeparator
    type="dashed"
    class="h-px"
  />

  <UFooter>
    <template #top>
      <UContainer>
        <UFooterColumns
          :columns="links"
          :ui="{
            center: 'xl:justify-items-end',
            label: 'text-lg font-semibold text-highlighted mt-0',
          }"
        >
          <template #left>
            <h1 class="text-2xl font-bold text-highlighted mb-2">
              Find us on Social Media!
            </h1>

            <div class="flex gap-1">
              <UButton
                v-for="social in socials"
                :key="social.label"
                :aria-label="social.label"
                :to="social.to"
                :target="social.target || '_blank'"
                :icon="social.icon"
                color="neutral"
                variant="link"
                square
              />
            </div>
          </template>
        </UFooterColumns>
      </UContainer>
    </template>

    <template #left>
      <p class="text-sm text-muted">
        © {{ year }} Nottingham New Theatre
      </p>
    </template>

    <template #right>
      <div class="flex items-center gap-2">
        <p class="text-sm text-muted">
          Part of <ULink
            to="https://su.nottingham.ac.uk/"
            class="text-secondary hover:underline"
          >
            UoNSU
          </ULink>
        </p>
        <span>&bull;</span>
        <p class="text-sm text-muted">
          Source on <ULink
            to="https://github.com/newtheatre/proscenium"
            class="text-secondary hover:underline"
          >GitHub</ULink>
        </p>
      </div>
    </template>
  </UFooter>
</template>

<script setup lang="ts">
import type { FooterColumn } from '@nuxt/ui'

interface SocialLink {
  icon: string
  to: string
  label: string
  target?: '_blank' | '_self' | '_parent' | '_top'
}

// Social media links
const socials: SocialLink[] = [
  {
    icon: 'i-lucide-mail',
    to: 'mailto:boxoffice@newtheatre.org.uk',
    label: 'Email',
  },
  {
    icon: 'i-simple-icons-facebook',
    to: 'https://www.facebook.com/thenottinghamnewtheatre/',
    label: 'Facebook',
  },
  {
    icon: 'i-simple-icons-instagram',
    to: 'https://www.instagram.com/nottinghamnewtheatre/',
    label: 'Instagram',
  },
  {
    icon: 'icon:su',
    to: 'https://su.nottingham.ac.uk/activities/view/new-theatre',
    label: 'Student Union',
  },
]

// Navigation links
const links: FooterColumn[] = [{
  label: 'Quick Links',
  children: [
  // {
  //   label: 'Wiki & Resources',
  //   to: '/wiki',
  // },
  // {
  //   label: 'Branding',
  //   to: '/wiki/governance/brand',
  // },
    {
      label: 'Mailing List',
      to: '/mailing-list',
    },
    {
      label: 'History',
      to: 'http://history.newtheatre.org.uk/',
      target: '_blank',
    },
    {
      label: 'Photo Gallery',
      to: 'http://photos.newtheatre.org.uk/',
      target: '_blank',
    },
  ],
}]

// Current year
const year = useState('footer-year', () => new Date().getFullYear())
</script>
