<template>
  <img
    :class="props.class"
    src="/ywcoder-logo.png"
    alt="YwCoder"
    width="172"
    height="48"
  />
</template>

<script setup lang="ts">
interface Props {
  class?: string;
}

const props = defineProps<Props>();
</script>

<style scoped>
img {
  max-width: 172px;
  height: auto;
  object-fit: contain;
}
</style>
