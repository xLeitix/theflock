<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 });
const paths: Record<string, string> = {
  bird: 'M3 17c5 0 7-2 9-6 1-2 2-4 5-4 2 0 3 1 3 3l2 1-3 1c-1 6-6 8-12 8H3l4-4m6-5-6-4 1 6M17 9h.01',
  search: 'm21 21-5-5M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  plus: 'M12 5v14M5 12h14', close: 'm6 6 12 12M6 18 18 6',
  map: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6m6-3v15m6-12v15',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  check: 'm5 12 4 4L19 6', arrow: 'm9 5 7 7-7 7',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3m-4 9 3 3 5-6',
  user: 'M20 21v-2a7 7 0 0 0-14 0v2M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  heart: 'M20 4c-3-2-6 0-8 2-2-2-5-4-8-2-7 5 8 16 8 16S27 9 20 4Z',
  locate: 'M12 2v3M12 19v3M2 12h3M19 12h3M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 11v6M12 7h.01',
  arrowLeft: 'M19 12H5m7-7-7 7 7 7', logout: 'M9 5H4v14h5M9 12h12m-5-5 5 5-5 5'
};
</script>
<template><svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.bird" /></svg></template>
