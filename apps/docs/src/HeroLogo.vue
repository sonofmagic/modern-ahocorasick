<script setup lang="ts">
defineProps<{ language: 'en' | 'zh' }>()
</script>

<template>
  <div
    class="hero-logo"
    data-testid="hero-logo"
    role="img"
    :aria-label="language === 'zh' ? 'modern-ahocorasick 标志' : 'modern-ahocorasick logo'"
  >
    <img class="hero-logo-light" src="/brand/logo-light.svg" alt="" width="400" height="400">
    <img class="hero-logo-dark" src="/brand/logo-dark.svg" alt="" width="400" height="400">
  </div>
</template>

<style scoped>
.hero-logo {
  justify-self: end;
  width: min(100%, 400px);
  aspect-ratio: 1;
}

.hero-logo img {
  display: block;
  width: 100%;
  height: auto;
}

.hero-logo .hero-logo-dark,
:global(.dark .hero-logo .hero-logo-light) {
  display: none;
}

:global(.dark .hero-logo .hero-logo-dark) {
  display: block;
}

@media (max-width: 960px) {
  .hero-logo {
    justify-self: center;
    width: clamp(200px, 28vw, 260px);
  }
}
</style>
