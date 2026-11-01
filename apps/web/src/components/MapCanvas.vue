<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
let maplibregl: typeof import('maplibre-gl');
import type { Map as LibreMap, Marker, Tile } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { Place } from '../../../../packages/contracts/src/index';
import { PILOT_CENTER } from '../../../../packages/contracts/src/index';
import { t, locale, formatDate } from '../i18n';
const props = withDefaults(defineProps<{ places: Place[]; selected?: string; picking?: boolean; coordinate?: [number, number] }>(), { picking: false });
const emit = defineEmits<{ select: [id: string]; pick: [coordinate: [number, number]] }>();
const container = ref<HTMLDivElement>();
const failed = ref(false);
const tileWarning = ref(false);
// Track actual failed OSM tiles, not unrelated renderer or style errors.
const failedTiles = new Map<string, Tile>();
let map: LibreMap | undefined;
let markers: Marker[] = [];
let draft: Marker | undefined;
let observer: ResizeObserver | undefined;
let disposed = false;
let initialViewFitted = false;
function fitInitialPlaces() {
  if (!map || props.picking || initialViewFitted || !props.places.length) return;
  const bounds = new maplibregl.LngLatBounds();
  for (const place of props.places) bounds.extend(place.location.coordinates);
  const mobile = window.matchMedia('(max-width: 991px)').matches;
  // Keep the opening pins above the mobile place sheet and below the filters.
  const bottom = mobile && props.selected ? Math.round(map.getContainer().clientHeight * .60) + 32 : 64;
  map.fitBounds(bounds, { padding: { top: 86, bottom, left: 48, right: mobile ? 76 : 48 }, maxZoom: 14, duration: 0 });
  initialViewFitted = true;
}
function updateTileWarning() {
  if (!map) return;
  const bounds = map.getBounds();
  for (const [key, tile] of failedTiles) {
    const { x, y, z } = tile.tileID.canonical;
    const count = 2 ** z;
    const west = x / count * 360 - 180 + tile.tileID.wrap * 360;
    const east = west + 360 / count;
    const north = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / count))) * 180 / Math.PI;
    const south = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / count))) * 180 / Math.PI;
    // Recovered tiles and failures outside the current view are no longer relevant.
    if (tile.state !== 'errored' || east < bounds.getWest() || west > bounds.getEast() || north < bounds.getSouth() || south > bounds.getNorth()) failedTiles.delete(key);
  }
  tileWarning.value = failedTiles.size > 0;
}
function pinLabel(place: Place) { return `${place.name} · ${place.recency === 'unknown' ? t('unknownStatus') : formatDate(place.lastFedLabel)}${place.careCount ? ` · ${t('care')}` : ''}`; }
function markerText(place: Place) { if (place.recency === 'unknown') return '—'; const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); const days = Math.max(0, Math.round((Date.parse(today) - Date.parse(place.lastFedLabel)) / 86400000)); return Number.isFinite(days) ? (days === 0 ? t('todayLabel') : `${days}d`) : place.lastFedLabel.slice(0, 6); }
function renderPins() {
  if (!map) return;
  markers.forEach(marker => marker.remove()); markers = [];
  for (const place of props.places) {
    const element = document.createElement('button');
    element.type = 'button'; element.className = `place-pin ${place.recency}${props.selected === place.id ? ' selected' : ''}`;
    element.setAttribute('aria-label', pinLabel(place)); element.dataset.testid = `map-pin-${place.id}`;
    element.textContent = markerText(place);
    if (place.careCount) { const badge = document.createElement('span'); badge.className = 'pin-care'; badge.textContent = '+'; badge.setAttribute('aria-hidden', 'true'); element.append(badge); }
    element.addEventListener('click', event => { event.stopPropagation(); emit('select', place.id); });
    markers.push(new maplibregl.Marker({ element, anchor: 'center' }).setLngLat(place.location.coordinates).addTo(map));
  }
  renderDraft();
  fitInitialPlaces();
}
function renderDraft() {
  draft?.remove(); draft = undefined;
  if (!map || !props.picking || !props.coordinate || !props.coordinate.every(Number.isFinite) || Math.abs(props.coordinate[1]) > 90 || Math.abs(props.coordinate[0]) > 180) return;
  const element = document.createElement('div'); element.className = 'draft-pin'; element.textContent = '+';
  draft = new maplibregl.Marker({ element }).setLngLat(props.coordinate).addTo(map);
}
function fallbackPick(event: MouseEvent) {
  if (!props.picking) return;
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  emit('pick', [PILOT_CENTER[0] + ((event.clientX - bounds.left) / bounds.width - .5) * .06, PILOT_CENTER[1] - ((event.clientY - bounds.top) / bounds.height - .5) * .035]);
}
function fallbackPosition(coordinates: [number, number]) { return { left: `${Math.min(94, Math.max(6, 50 + (coordinates[0] - PILOT_CENTER[0]) / .06 * 100))}%`, top: `${Math.min(87, Math.max(17, 50 - (coordinates[1] - PILOT_CENTER[1]) / .035 * 100))}%` }; }
onMounted(async () => {
  try {
    maplibregl = await import('maplibre-gl');
    if (disposed) return;
    maplibregl.setWorkerUrl(workerUrl);
    const createdMap = new maplibregl.Map({ container: container.value!, center: props.coordinate || PILOT_CENTER, zoom: props.picking ? 14.4 : 13.3, minZoom: 10, maxZoom: 18,
      style: { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors', maxzoom: 19 } }, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e9ece6' } }, { id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': -.75, 'raster-contrast': -.12 } }] },
      attributionControl: { compact: true }, cooperativeGestures: false
    });
    map = createdMap;
    createdMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    createdMap.on('error', event => {
      // MapLibre adds sourceId and tile when bubbling a raster-tile failure.
      const sourceError = event as typeof event & { sourceId?: string; tile?: Tile };
      if (sourceError.sourceId !== 'osm' || !sourceError.tile?.tileID) return;
      failedTiles.set(String(sourceError.tile.tileID.key), sourceError.tile);
      updateTileWarning();
    });
    createdMap.on('sourcedata', event => {
      if (event.sourceId !== 'osm' || !event.tile?.tileID) return;
      if (event.tile.state === 'loaded') failedTiles.delete(String(event.tile.tileID.key));
      updateTileWarning();
    });
    createdMap.on('moveend', updateTileWarning);
    createdMap.on('load', () => { renderPins(); map?.resize(); });
    createdMap.on('click', event => { if (props.picking) emit('pick', [Number(event.lngLat.lng.toFixed(6)), Number(event.lngLat.lat.toFixed(6))]); });
    renderPins();
    observer = new ResizeObserver(() => map?.resize()); observer.observe(container.value!);
  } catch { failed.value = true; }
});
watch(() => [props.places, props.selected, locale.value], renderPins, { deep: true });
watch(() => props.coordinate, coordinates => {
  renderDraft();
  if (map && props.picking && coordinates && coordinates.every(Number.isFinite) && coordinates[0] >= 11.4 && coordinates[0] <= 12.6 && coordinates[1] >= 57.4 && coordinates[1] <= 58.1) {
    map.easeTo({center:coordinates,zoom:Math.max(map.getZoom(),14.4),duration:250});
  }
}, { deep: true });
onBeforeUnmount(() => { disposed = true; observer?.disconnect(); markers.forEach(marker => marker.remove()); draft?.remove(); map?.remove(); });
</script>
<template>
  <div class="map-canvas" :class="{ picking }" :aria-label="t('mapLabel')">
    <div v-show="!failed" ref="container" class="map-renderer"></div>
    <div v-if="failed" class="coordinate-map" @click="fallbackPick"><div class="schematic-river"></div><span class="schematic-name">GÖTEBORG</span><span class="schematic-water">Göta älv</span>
      <button v-for="place in places" :key="place.id" class="place-pin" :class="[place.recency, { selected: selected === place.id }]" :style="fallbackPosition(place.location.coordinates)" :aria-label="pinLabel(place)" @click.stop="emit('select', place.id)">{{ markerText(place) }}<span v-if="place.careCount" class="pin-care" aria-hidden="true">+</span></button>
      <span v-if="picking && coordinate" class="draft-pin" :style="fallbackPosition(coordinate)">+</span>
      <span class="schematic-label">{{ t('schematic') }}</span>
    </div>
    <div v-if="tileWarning || failed" class="map-warning" role="status">{{ t(failed ? 'mapUnavailable' : 'mapTilesUnavailable') }}</div>
  </div>
</template>
