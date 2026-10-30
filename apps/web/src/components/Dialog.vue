<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import Icon from './Icon.vue';
const props = defineProps<{ title: string; subtitle?: string; closeLabel: string; busy?: boolean; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement>();
const previous = document.activeElement as HTMLElement | null;
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !props.busy) emit('close');
  if (event.key !== 'Tab' || !panel.value) return;
  const items = [...panel.value.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')].filter(item => item.offsetParent !== null);
  const first = items[0], last = items.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
onMounted(async () => {
  document.body.style.overflow = 'hidden';
  document.querySelector('#app-shell')?.setAttribute('inert', '');
  await nextTick();
  panel.value?.focus();
});
onBeforeUnmount(() => { document.body.style.overflow = ''; document.querySelector('#app-shell')?.removeAttribute('inert'); previous?.focus(); });
</script>
<template>
  <Teleport to="body"><div class="dialog-backdrop" @click.self="!busy && emit('close')">
    <section ref="panel" class="flock-dialog" :class="{ wide }" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1" @keydown="keydown">
      <header class="dialog-header"><div><p v-if="subtitle" class="eyebrow">{{ subtitle }}</p><h2 id="dialog-title">{{ title }}</h2></div><button class="icon-button" type="button" :aria-label="closeLabel" :disabled="busy" @click="emit('close')"><Icon name="close" /></button></header>
      <div class="dialog-body"><slot /></div>
    </section>
  </div></Teleport>
</template>
