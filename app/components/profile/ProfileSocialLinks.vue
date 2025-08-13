<template>
  <div
    v-if="hasSocialLinks(socialLinks)"
    class="social-links"
  >
    <h3 class="social-links__title">
      Social Links
    </h3>
    <div class="social-links__grid">
      <a
        v-if="socialLinks?.github"
        :href="socialLinks.github"
        target="_blank"
        rel="noopener noreferrer"
        class="social-link"
      >
        GitHub
      </a>
      <a
        v-if="socialLinks?.linkedin"
        :href="socialLinks.linkedin"
        target="_blank"
        rel="noopener noreferrer"
        class="social-link"
      >
        LinkedIn
      </a>
      <a
        v-if="socialLinks?.facebook"
        :href="socialLinks.facebook"
        target="_blank"
        rel="noopener noreferrer"
        class="social-link"
      >
        Facebook
      </a>
      <span
        v-if="socialLinks?.discord"
        class="social-link social-link--text"
      >
        Discord: {{ socialLinks.discord }}
      </span>
      <span
        v-if="socialLinks?.instagram"
        class="social-link social-link--text"
      >
        Instagram: {{ socialLinks.instagram }}
      </span>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { SocialLinks } from '../../../shared/types/api'

interface Props {
  socialLinks?: SocialLinks | null
}

defineProps<Props>()

const { hasSocialLinks } = useFormatters()
</script>

<style scoped>
.social-links {
  margin-top: var(--spacing-md);
}

.social-links__title {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0 0 var(--spacing-sm) 0;
}

.social-links__grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
}

.social-link {
  color: var(--nnt-orange);
  text-decoration: none;
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  font-size: var(--font-size-sm);
  transition: var(--transition-fast);
}

.social-link:hover {
  background: var(--nnt-orange);
  color: var(--primary-bg-color);
  text-decoration: none;
  border-color: var(--nnt-orange);
}

.social-link--text {
  color: var(--primary-text-color);
  pointer-events: none;
}
</style>
