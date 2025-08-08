<template>
  <footer class="app-footer">
    <hr class="app-footer__divider">
    <section class="app-footer__section">
      <div class="app-footer__container app-footer__socials">
        <h2 class="app-footer__heading">
          Find Us On Social Media
        </h2>
        <ul class="app-footer__socials-list">
          <li
            v-for="link in socials"
            :key="link.url"
            class="app-footer__socials-item"
          >
            <NuxtLink
              :to="link.url"
              class="app-footer__socials-link"
            >
              <Icon
                v-if="link.icon"
                class="app-footer__icon"
                :name="'icon:' + link.icon"
              />
              <span
                v-else
                class="app-footer__missing-icon"
              >Icon Missing</span>
            </NuxtLink>
          </li>
        </ul>
      </div>
      <nav class="app-footer__container app-footer__links">
        <ul class="app-footer__links-list">
          <li
            v-for="link in links"
            :key="link.url"
            class="app-footer__links-item"
          >
            <NuxtLink
              :to="link.url"
              class="app-footer__link"
            >{{ link.text }}</NuxtLink>
          </li>
        </ul>
      </nav>
    </section>
    <section class="app-footer__section">
      <div class="app-footer__legal">
        <p class="app-footer__copyright">
          &copy; {{ legal?.copyright }}
        </p>
        <span class="app-footer__separator app-footer__separator--hide">&bull;</span>
        <span class="app-footer__credits">
          <p>Part of <a
            href="https://su.nottingham.ac.uk"
            class="app-footer__external-link"
          >UoNSU</a></p>
          <span class="app-footer__separator">&bull;</span>
          <p>Source on <a
            href="https://github.com/newtheatre/website/"
            class="app-footer__external-link"
          >GitHub</a></p>
        </span>
      </div>
    </section>
  </footer>
</template>

<script lang="ts" setup>
const { data } = await useAsyncData('footer', () => {
  return queryCollection('footer').first()
})

const { links, socials, legal } = data.value || { links: [], socials: [], copyright: '' }
</script>

<style scoped>
.app-footer {
  display: flex;
  padding: 2.5rem;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.5rem;
  align-self: stretch;
}

.app-footer__divider {
  max-width: var(--page-max-width);
  width: 100%;
  border: none;
  border-top: 3px solid #191919;
  margin: 0 auto;
}

.app-footer__section {
  display: flex;
  max-width: var(--page-max-width);
  margin: 0 auto;
  padding: 1.2rem;
  width: 100%;
  justify-content: space-between;
  justify-items: center;
}

.app-footer__container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex: 1 0 0;
}

.app-footer__socials {
  align-items: flex-start;
}

.app-footer__links {
  align-items: flex-end;
}

.app-footer__legal,
.app-footer__credits {
  display: flex;
  justify-content: center;
  text-align: center;
  align-self: stretch;
  gap: 1rem;
  margin: 0;
}

.app-footer__legal p {
  width: fit-content;
  margin: 0;
}

.app-footer__socials-list,
.app-footer__links-list {
  list-style: none;
  display: flex;
  padding: 0;
  gap: 1rem;
}

.app-footer__links-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-end;
  align-self: stretch;
  padding: 0;
  gap: .4rem;
  text-align: right;
}

.app-footer__socials-list {
  font-size: 1.5rem;
  align-items: center;
}

.app-footer__missing-icon {
  font-size: 0.6rem;
  width: min-content;
  display: inline-block;
}

.app-footer__icon {
    color: var(--primary-text-color);
}

.app-footer__icon:hover,
.app-footer__icon:active,
.app-footer__icon:focus {
    color: var(--link-color);
}

/* Can be modified as needed for different screen sizes */
@media (max-width: 768px) {

  .app-footer,
  .app-footer__section {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .app-footer__container,
  .app-footer__socials {
    align-items: center;
  }

  .app-footer__socials-list {
    justify-content: center;
  }

  .app-footer__links-list {
    text-align: center;
    align-items: center;
    padding: 2rem 0;
  }

  .app-footer__separator--hide {
    display: none;
  }

  .app-footer__legal {
    flex-direction: column;
    gap: 1rem;
    text-align: center;
    align-items: center;
  }
}
</style>
