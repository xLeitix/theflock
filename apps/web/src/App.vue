<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import type { Activity, ActivityResponse, CareActionInput, CareCase, CareInput, FeedingInput, Persona, Place, PlaceInput, Recency, SessionResponse } from '../../../packages/contracts/src/index';
import { ISSUE_TYPES, PILOT_CENTER } from '../../../packages/contracts/src/index';
import { api, ApiError, setCsrf } from './api';
import { locale, t, label, formatDate, type TranslationKey } from './i18n';
import { newFeeding, stockholmToday, type FeedingDraft } from './types';
import MapCanvas from './components/MapCanvas.vue';
import Dialog from './components/Dialog.vue';
import FeedingFields from './components/FeedingFields.vue';
import ActivityList from './components/ActivityList.vue';
import Icon from './components/Icon.vue';

type Modal = 'login' | 'account' | 'add' | 'feeding' | 'care' | 'case' | null;
const page = ref<'map' | 'emergency'>(location.pathname === '/emergency' ? 'emergency' : 'map');
const session = ref<SessionResponse>();
const places = ref<Place[]>([]), activity = ref<Activity[]>([]), cases = ref<CareCase[]>([]);
const selectedId = ref(''), search = ref(''), filter = ref<Recency | 'all' | 'care'>('all');
const selected = computed(() => places.value.find(place => place.id === selectedId.value));
const listMode = ref(false), expanded = ref(false), loading = ref(true), detailLoading = ref(false), hasMore = ref(false), activityHasMore = ref(false);
const error = ref(''), formError = ref(''), detailError = ref(''), notice = ref(''), busy = ref(false);
const modal = ref<Modal>(null), pendingModal = ref<Modal>(null);
const feedingDraft = reactive(newFeeding());
const placeDraft = reactive({ name: '', latitude: PILOT_CENTER[1], longitude: PILOT_CENTER[0], comment: '', initialFeeding: false, publicLocationConfirmed: false });
const careDraft = reactive({ issueTypes: [] as string[], urgency: '' as '' | 'now' | 'today', birdCount: 1, description: '', resolveImmediately: false, resolutionComment: '' });
const activeCase = ref<CareCase>(), caseLoading = ref(false), actionComment = ref(''), plannedDate = ref(stockholmToday());
const emergencyLoading = ref(false), emergencyError = ref('');
const geoState = ref<'idle' | 'locating' | 'located' | 'manual' | 'denied' | 'unavailable' | 'timeout' | 'unsupported' | 'outside'>('idle');
const geoAccuracy = ref<number | null>(null);
let locationRequest = 0, geoTimer: ReturnType<typeof setTimeout> | undefined;
let detailSequence = 0, caseSequence = 0;
let casePoll: ReturnType<typeof setInterval> | undefined;
let idempotency: { signature: string; key: string } | undefined;
const filteredPlaces = computed(() => places.value.filter(place => place.name.toLocaleLowerCase(locale.value).includes(search.value.trim().toLocaleLowerCase(locale.value)) && (filter.value === 'all' || (filter.value === 'care' ? place.careCount > 0 : place.recency === filter.value))));
const activeCases = computed(() => cases.value.filter(item => item.state !== 'resolved'));
const caseActivity = computed(() => activity.value.filter(item => item.kind === 'care' && item.care.caseId === activeCase.value?.id));
const coordinate = computed<[number, number]>(() => [Number(placeDraft.longitude), Number(placeDraft.latitude)]);
const statusFilters: Array<{ key: Recency | 'care'; class: string }> = [{ key: 'recent', class: 'recent' }, { key: 'due', class: 'due' }, { key: 'overdue', class: 'overdue' }, { key: 'unknown', class: 'unknown' }, { key: 'care', class: 'care-dot' }];
const userRoles = computed(() => t(session.value?.user?.roles.includes('moderator') ? 'personaModerator' : 'personaMember'));
const geoMessage = computed(() => t(({idle:'geoIdle',locating:'geoLocating',located:'geoLocated',manual:'geoManual',denied:'geoDenied',unavailable:'geoUnavailable',timeout:'geoTimeout',unsupported:'geoUnsupported',outside:'geoOutside'} as const)[geoState.value]));
function count(key: Recency | 'care') { return places.value.filter(place => key === 'care' ? place.careCount > 0 : place.recency === key).length; }
watch(formError, async value => { if (value) { await nextTick(); document.querySelector<HTMLElement>('.form-error')?.focus(); } });
function statusLabel(place: Place) { return t(`${place.recency}Status` as TranslationKey); }
function flockLabel(band: string) { return band === 'unknown' ? t('notRecorded') : label(band); }
function errorMessage(caught: unknown) {
  if (caught instanceof ApiError) {
    if (caught.code === 'CLIENT_UPDATE_REQUIRED') return t('clientUpdateRequired');
    if (caught.message === 'SAVE_UNCONFIRMED') return t('uncertainSave');
    if (['CONNECTION_FAILED', 'SERVER_UNAVAILABLE'].includes(caught.message)) return t('connectionError');
    if (caught.status === 401) return t('sessionExpired');
  }
  return caught instanceof Error ? caught.message : t('connectionError');
}
function keyFor(path: string, body: unknown) { const signature = path + JSON.stringify(body); if (!idempotency || signature !== idempotency.signature) idempotency = { signature, key: crypto.randomUUID() }; return idempotency.key; }
function clearCase() { activeCase.value = undefined; caseSequence++; actionComment.value = ''; plannedDate.value = stockholmToday(); }
function invalidateLocationRequest() { locationRequest++; if (geoTimer) clearTimeout(geoTimer); geoTimer = undefined; }
function manualLocationChange() { invalidateLocationRequest(); placeDraft.publicLocationConfirmed = false; geoAccuracy.value = null; geoState.value = 'manual'; }
watch(() => [placeDraft.longitude, placeDraft.latitude], manualLocationChange, { flush: 'sync' });
watch(() => placeDraft.publicLocationConfirmed, confirmed => { if (confirmed) { invalidateLocationRequest(); if (geoState.value === 'locating') geoState.value = 'manual'; } }, { flush: 'sync' });
function pickPlace([longitude, latitude]: [number, number]) { manualLocationChange(); placeDraft.longitude = longitude; placeDraft.latitude = latitude; }
function useMyLocation() {
  if (modal.value !== 'add') return;
  invalidateLocationRequest(); placeDraft.publicLocationConfirmed = false; geoAccuracy.value = null;
  if (!navigator.geolocation) { geoState.value = 'unsupported'; return; }
  const request = locationRequest; geoState.value = 'locating';
  const current = () => request === locationRequest && modal.value === 'add' && !placeDraft.publicLocationConfirmed;
  geoTimer = setTimeout(() => { if (current()) { invalidateLocationRequest(); geoState.value = 'timeout'; } }, 10000);
  try {
    navigator.geolocation.getCurrentPosition(position => {
      if (!current()) return;
      invalidateLocationRequest();
      const {longitude, latitude, accuracy} = position.coords;
      if (![longitude, latitude].every(Number.isFinite) || longitude < 11.4 || longitude > 12.6 || latitude < 57.4 || latitude > 58.1) { geoState.value = 'outside'; return; }
      placeDraft.longitude = Number(longitude.toFixed(6)); placeDraft.latitude = Number(latitude.toFixed(6));
      geoAccuracy.value = Number.isFinite(accuracy) && accuracy >= 0 ? Math.round(accuracy) : null;
      geoState.value = 'located';
    }, failure => {
      if (!current()) return;
      invalidateLocationRequest(); geoState.value = failure.code === 1 ? 'denied' : failure.code === 3 ? 'timeout' : 'unavailable';
    }, {enableHighAccuracy:true,timeout:8000,maximumAge:30000});
  } catch { invalidateLocationRequest(); geoState.value = 'unavailable'; }
}
watch(modal, (next, previous) => { if (previous === 'add') invalidateLocationRequest(); if (next === 'add') useMyLocation(); }, {flush:'sync'});
function resetPlace() { invalidateLocationRequest(); Object.assign(placeDraft, { name: '', latitude: PILOT_CENTER[1], longitude: PILOT_CENTER[0], comment: '', initialFeeding: false, publicLocationConfirmed: false }); geoState.value = 'idle'; geoAccuracy.value = null; }
function resetCare() { Object.assign(careDraft, { issueTypes: [], urgency: '', birdCount: 1, description: '', resolveImmediately: false, resolutionComment: '' }); }
function clearDrafts() { Object.assign(feedingDraft, newFeeding()); resetPlace(); resetCare(); }
async function refreshSession() {
  const next = await api<SessionResponse>('/session');
  if (session.value && session.value.user?.id !== next.user?.id) { clearCase(); clearDrafts(); if (modal.value !== 'login') modal.value = null; }
  session.value = next; setCsrf(next);
}
async function loadPlaces(selectNew?: string) {
  const result = await api<{ places: Place[]; hasMore: boolean }>('/places'); places.value = result.places; hasMore.value = result.hasMore;
  if (selectNew) selectedId.value = selectNew;
  if (!selectedId.value && result.places.length) selectedId.value = result.places[0]!.id;
  if (selectedId.value && !places.value.some(place => place.id === selectedId.value)) selectedId.value = '';
  if (selectedId.value) await loadDetails(selectedId.value);
}
async function loadDetails(id: string) {
  const sequence = ++detailSequence; detailLoading.value = true; detailError.value = ''; activity.value = []; cases.value = [];
  try { const [history, reports] = await Promise.all([api<ActivityResponse>(`/places/${id}/activity`), api<{ cases: CareCase[] }>(`/places/${id}/care-cases`)]); if (sequence !== detailSequence) return; activity.value = history.activity; activityHasMore.value = history.hasMore; cases.value = reports.cases; }
  catch (caught) { if (sequence === detailSequence) detailError.value = errorMessage(caught); }
  finally { if (sequence === detailSequence) detailLoading.value = false; }
}
function selectPlace(id: string) { selectedId.value = id; expanded.value = false; loadDetails(id); }
function closeDetail() { selectedId.value = ''; detailSequence++; activity.value = []; cases.value = []; }
async function initialize() { loading.value = true; error.value = ''; try { await refreshSession(); await loadPlaces(); } catch (caught) { error.value = errorMessage(caught); } finally { loading.value = false; } }
function resetFilters() { search.value = ''; filter.value = 'all'; }
function toggleLocale() { locale.value = locale.value === 'en' ? 'sv' : 'en'; localStorage.setItem('flock-locale', locale.value); }
watch(locale, () => { document.documentElement.lang = locale.value; document.title = `Flock · ${t('gothenburg')}`; }, { immediate: true });
function goPage(next: 'map' | 'emergency') { page.value = next; history.replaceState(null, '', next === 'map' ? '/' : '/emergency'); if (next === 'emergency') loadEmergency(); }
async function loadEmergency() { emergencyLoading.value = true; emergencyError.value = ''; try { await api('/emergency-contacts'); } catch (caught) { emergencyError.value = errorMessage(caught); } finally { emergencyLoading.value = false; } }
function openLogin() { formError.value = ''; modal.value = 'login'; }
function openAction(action: 'add' | 'feeding' | 'care') {
  formError.value = ''; notice.value = ''; idempotency = undefined;
  if (action === 'add') { resetPlace(); Object.assign(feedingDraft, newFeeding()); }
  if (action === 'feeding') Object.assign(feedingDraft, newFeeding());
  if (action === 'care') resetCare();
  if (!session.value?.user) { pendingModal.value = action; modal.value = 'login'; } else modal.value = action;
}
function closeModal() { if (busy.value) return; modal.value = null; formError.value = ''; pendingModal.value = null; clearCase(); }
async function login(persona: Persona) {
  busy.value = true; formError.value = '';
  try {
    const next = await api<SessionResponse>('/dev/login', { body: { persona } });
    clearCase(); session.value = next; setCsrf(next); modal.value = pendingModal.value; pendingModal.value = null; notice.value = t('signedIn');
    if (selectedId.value) await loadDetails(selectedId.value);
  } catch (caught) { formError.value = errorMessage(caught); } finally { busy.value = false; }
}
async function logout() {
  busy.value = true; formError.value = '';
  try { await api('/auth/logout', { body: {} }); clearCase(); clearDrafts(); modal.value = null; await refreshSession(); notice.value = t('signedOut'); if (selectedId.value) await loadDetails(selectedId.value); }
  catch (caught) { formError.value = errorMessage(caught); } finally { busy.value = false; }
}
function feedingInput(draft: FeedingDraft): FeedingInput {
  if (!draft.flockBand) throw new Error(t('requiredFlock'));
  return { flockBand: draft.flockBand, foodTypes: draft.foodTypes, comment: draft.comment.trim() || undefined, occurredAt: new Date(draft.occurredAt).toISOString() };
}
async function afterSave(message: TranslationKey, placeId?: string) {
  modal.value = null; idempotency = undefined; notice.value = t(message); clearDrafts();
  try { await loadPlaces(placeId); } catch { error.value = t('refreshError'); }
}
async function savePlace() {
  busy.value = true; formError.value = '';
  try {
    if (!placeDraft.publicLocationConfirmed) throw new Error(t('confirmLocationRequired'));
    const body: PlaceInput = { name: placeDraft.name.trim(), longitude: Number(placeDraft.longitude), latitude: Number(placeDraft.latitude), publicLocationConfirmed:true, comment: placeDraft.comment.trim() || undefined, ...(placeDraft.initialFeeding ? { initialFeeding: feedingInput(feedingDraft) } : {}) };
    const result = await api<{ place: Place }>('/places', { body, key: keyFor('/places', body) }); await afterSave('placeSaved', result.place.id);
  } catch (caught) { formError.value = errorMessage(caught); } finally { busy.value = false; }
}
async function saveFeeding() {
  if (!selectedId.value) return; busy.value = true; formError.value = '';
  try { const body = feedingInput(feedingDraft), path = `/places/${selectedId.value}/feedings`; await api(path, { body, key: keyFor(path, body) }); await afterSave('feedingSaved'); }
  catch (caught) { formError.value = errorMessage(caught); } finally { busy.value = false; }
}
async function saveCare() {
  if (!selectedId.value) return; busy.value = true; formError.value = '';
  try {
    if (!careDraft.issueTypes.length || !careDraft.urgency) throw new Error(t('requiredCare'));
    const body: CareInput = { placeId: selectedId.value, issueTypes: careDraft.issueTypes, urgency: careDraft.urgency, birdCount: Number(careDraft.birdCount), description: careDraft.description.trim(), resolveImmediately:careDraft.resolveImmediately, ...(careDraft.resolveImmediately ? {resolutionComment:careDraft.resolutionComment.trim() || undefined} : {}) };
    await api('/care-cases', { body, key: keyFor('/care-cases', body) }); await afterSave('careSaved');
  } catch (caught) { formError.value = errorMessage(caught); } finally { busy.value = false; }
}
async function openCase(careCase: CareCase) { await openCaseId(careCase.id, careCase); }
async function openCaseId(id: string, initial?: CareCase) {
  formError.value = ''; clearCase(); activeCase.value = initial; modal.value = 'case'; idempotency = undefined; await refreshCase(id);
}
async function refreshCase(id: string) {
  const sequence = ++caseSequence; caseLoading.value = true;
  try { const result = await api<{ case: CareCase }>(`/care-cases/${id}`); if (sequence === caseSequence) activeCase.value = result.case; }
  catch (caught) { if (sequence === caseSequence) { if (caught instanceof ApiError && [404,410].includes(caught.status)) activeCase.value = undefined; formError.value = errorMessage(caught); } }
  finally { if (sequence === caseSequence) caseLoading.value = false; }
}
async function caseAction(action: 'claim' | 'release' | 'resolve' | 'reopen' | 'comment') {
  if (!activeCase.value) return; busy.value = true; formError.value = ''; const current = activeCase.value;
  try {
    if (action === 'reopen' && actionComment.value.trim().length < 3) throw new Error(t('requiredReopen'));
    if (action === 'comment' && !actionComment.value.trim()) throw new Error(t('commentRequired'));
    if (action === 'claim' && (!plannedDate.value || plannedDate.value < stockholmToday())) throw new Error(t('plannedDateRequired'));
    const path = `/care-cases/${current.id}/${action === 'comment' ? 'comments' : action}`;
    const body: CareActionInput = {comment:actionComment.value.trim() || undefined,...(action === 'claim' ? {plannedDate:plannedDate.value} : {})};
    await api(path, {body,version:current.version,key:keyFor(path,body)});
    idempotency = undefined; actionComment.value = ''; notice.value = t('caseUpdated'); await refreshCase(current.id); await loadPlaces();
  } catch (caught) { if (caught instanceof ApiError && caught.code !== 'CLIENT_UPDATE_REQUIRED' && [409,412].includes(caught.status)) { await refreshCase(current.id); formError.value = t('staleCase'); } else formError.value = errorMessage(caught); }
  finally { busy.value = false; }
}
async function handleVisibility() { if (!document.hidden && session.value && !busy.value) { try { await refreshSession(); if (modal.value === 'case' && activeCase.value) await refreshCase(activeCase.value.id); } catch { clearCase(); } } }
function reloadPage() { location.reload(); }
onMounted(() => { initialize(); if (page.value === 'emergency') loadEmergency(); document.addEventListener('visibilitychange', handleVisibility); window.addEventListener('focus', handleVisibility); casePoll = setInterval(() => { if (modal.value === 'case') handleVisibility(); }, 30000); });
onBeforeUnmount(() => { invalidateLocationRequest(); if (casePoll) clearInterval(casePoll); document.removeEventListener('visibilitychange', handleVisibility); window.removeEventListener('focus', handleVisibility); });
const modalTitle = computed(() => modal.value === 'login' ? t('demoLogin') : modal.value === 'account' ? t('account') : modal.value === 'add' ? t('addPlace') : modal.value === 'feeding' ? t('recordFeeding') : modal.value === 'care' ? t('reportTitle') : t('caseTitle'));
</script>


<template>
  <div id="app-shell">
    <a class="skip-link" href="#place-panel" @click="listMode = true">{{ t('skip') }}</a>
    <div class="prototype-banner"><span class="prototype-tag">{{ t(session?.mode === 'preview' ? 'protectedPreview' : 'prototype') }}</span><span>{{ t(session?.mode === 'preview' ? 'previewOnly' : 'demoData') }}</span><span class="demo-dot" aria-hidden="true"></span></div>
    <header class="app-header">
      <a class="brand" href="/" aria-label="Flock" @click.prevent="goPage('map')"><span class="brand-icon"><Icon name="bird" :size="25" /></span><span>Flock<span class="brand-dot">.</span></span></a>
      <label class="search-box"><Icon name="search" :size="18" /><input data-testid="search-places" v-model="search" type="search" :placeholder="t('search')" :aria-label="t('search')" @input="page === 'emergency' && goPage('map')"><span class="search-shortcut" aria-hidden="true">⌕</span></label>
      <nav class="desktop-nav" aria-label="Main"><button :class="{ active: page === 'map' }" @click="goPage('map')">{{ t('map') }}</button><button :class="{ active: page === 'emergency' }" @click="goPage('emergency')">{{ t('emergency') }}</button></nav>
      <button class="language-button" data-testid="language-toggle" :aria-label="locale === 'en' ? 'Byt till svenska' : 'Switch to English'" @click="toggleLocale"><Icon name="globe" :size="18" /><span>{{ locale.toUpperCase() }}</span></button>
      <button v-if="!session?.user" class="login-button" data-testid="demo-login" @click="openLogin">{{ t('login') }}<Icon name="arrow" :size="15" /></button>
      <button v-else class="account-button" data-testid="account-menu" :aria-label="t('account')" @click="modal = 'account'; formError = ''"><Icon name="user" :size="19" /><span>{{ session.user.displayName }}</span></button>
    </header>
    <div v-if="notice" class="toast-notice" role="status"><Icon name="check" /><span>{{ notice }}</span><button class="icon-button" :aria-label="t('close')" @click="notice = ''"><Icon name="close" :size="16" /></button></div>
    <main v-if="page === 'map'" class="workspace" :class="{ 'has-selection': !!selected, 'details-expanded': expanded }">
      <section class="map-section" :aria-label="t('map')">
        <MapCanvas :places="filteredPlaces" :selected="selectedId" @select="selectPlace" />
        <div class="map-top-controls">
          <div class="filter-row" role="group" :aria-label="t('filters')"><button v-for="item in statusFilters" :key="item.key" class="filter-chip" :class="{ active: filter === item.key }" :aria-pressed="filter === item.key" @click="filter = filter === item.key ? 'all' : item.key"><span class="status-dot" :class="item.class">{{ item.key === 'care' ? '+' : '' }}</span><span>{{ t(item.key) }}</span><span class="filter-count">{{ count(item.key) }}</span></button></div>
          <div v-if="error" class="map-error" role="alert"><span>{{ error }}</span><button class="btn btn-sm btn-light" @click="initialize">{{ t('retry') }}</button></div>
        </div>
        <div class="map-area-label"><span class="live-dot"></span>{{ t('gothenburg') }}<span class="area-separator">/</span>{{ filteredPlaces.length }} {{ t('loadedPlaces') }}</div>
        <div class="map-bottom-controls"><button class="view-toggle" data-testid="toggle-list" :aria-pressed="listMode" @click="listMode = !listMode"><Icon :name="listMode ? 'map' : 'list'" /><span>{{ listMode ? t('showMap') : t('list') }}</span></button><button class="btn btn-primary add-place-button" data-testid="add-place" @click="openAction('add')"><Icon name="plus" /><span>{{ t('addPlace') }}</span></button></div>
        <div v-if="listMode" id="place-list" class="map-place-list" data-testid="place-list">
          <div class="list-heading"><div><p class="eyebrow">{{ t('gothenburg') }}</p><h2>{{ t('all') }}</h2></div><button class="icon-button" :aria-label="t('close')" @click="listMode = false"><Icon name="close" /></button></div>
          <p v-if="loading" class="empty-copy" role="status">{{ t('loading') }}</p>
          <div v-else-if="!filteredPlaces.length" class="empty-state"><Icon name="search" :size="28" /><h3>{{ places.length ? t('noMatches') : t('noPlaces') }}</h3><p>{{ places.length ? t('noMatchesText') : t('noPlacesText') }}</p><button class="btn btn-outline-primary" @click="resetFilters">{{ t('reset') }}</button></div>
          <button v-for="place in filteredPlaces" :key="place.id" :data-testid="'place-' + place.id" class="place-list-row" :class="{ selected: selectedId === place.id }" @click="selectPlace(place.id); listMode = false"><span class="list-pin" :class="place.recency"><Icon name="bird" /></span><span class="place-list-copy"><strong>{{ place.name }}</strong><span>{{ statusLabel(place) }}</span><small v-if="place.careCount" class="care-text">+ {{ t('care') }}</small></span><Icon name="arrow" :size="16" /></button>
          <p v-if="hasMore" class="form-text px-3">{{ t('morePlaces') }}</p>
        </div>
        <div v-else-if="!loading && !filteredPlaces.length && !error" class="floating-empty"><strong>{{ places.length ? t('noMatches') : t('noPlaces') }}</strong><p>{{ places.length ? t('noMatchesText') : t('noPlacesText') }}</p><button v-if="places.length" class="btn btn-outline-primary" @click="resetFilters">{{ t('reset') }}</button></div>
      </section>
      <aside id="place-panel" class="detail-panel" :class="{ 'empty-panel': !selected }" tabindex="-1" :aria-label="selected?.name || t('all')">
        <template v-if="selected">
          <button class="sheet-handle" :aria-label="expanded ? t('collapse') : t('expand')" @click="expanded = !expanded"><span></span></button>
          <div class="detail-heading"><div><p class="eyebrow">{{ t('gothenburg') }}</p><h1 data-testid="selected-place-name">{{ selected.name }}</h1></div><button class="icon-button" :aria-label="t('close')" @click="closeDetail"><Icon name="close" /></button></div>
          <div class="detail-content">
            <p v-if="selected.comment" class="place-public-comment" data-testid="place-public-comment">{{ selected.comment }}</p>
            <div class="feeding-status" :class="selected.recency"><span class="status-dot" :class="selected.recency"></span><div><strong>{{ statusLabel(selected) }}</strong><span>{{ selected.recency === 'unknown' ? t('unknownStatus') : formatDate(selected.lastFedLabel) }}</span></div><Icon name="check" v-if="selected.recency === 'recent'" :size="18" /></div>
            <div class="flock-summary"><Icon name="bird" :size="18" /><span>{{ t('latestFlock') }}</span><strong>{{ flockLabel(selected.flockBand) }}</strong></div>
            <button v-for="item in activeCases.slice(0, 2)" :key="item.id" class="care-summary" :data-testid="'care-case-' + item.id" @click="openCase(item)"><span class="care-symbol">+</span><span><strong>{{ item.issueTypes.map(label).join(', ') }}</strong><small>{{ item.state === 'claimed' ? item.assignedDisplayName + ' · ' + (item.plannedDate ? formatDate(item.plannedDate) : t('statusClaimed')) : t('statusOpen') }}<span v-if="item.overdue"> · {{ t('commitmentOverdue') }}</span></small></span><Icon name="arrow" :size="18" /></button>
            <div class="detail-actions"><button class="btn btn-primary w-100" data-testid="record-feeding" @click="openAction('feeding')"><Icon :name="session?.user ? 'check' : 'plus'" />{{ session?.user ? t('recordFeeding') : t('loginFeeding') }}</button><button class="btn btn-care w-100" data-testid="report-care" @click="openAction('care')"><Icon name="plus" :size="17" />{{ t('reportCare') }}</button></div>
          </div>
          <section class="feeding-history" data-testid="activity-log"><div class="section-label"><h2>{{ t('feedingLog') }}</h2><span>{{ activity.length }}</span></div>
            <div v-if="detailLoading" class="empty-copy" role="status">{{ t('placeLoading') }}</div>
            <div v-else-if="detailError" class="alert alert-light" role="alert">{{ detailError }} <button class="btn btn-outline-primary btn-sm" @click="loadDetails(selected.id)">{{ t('retry') }}</button></div>
            <div v-else-if="!activity.length" class="history-empty"><Icon name="bird" :size="30" /><p>{{ t('emptyActivity') }}</p></div>
            <ActivityList v-else :items="activity" @open-case="openCaseId" />
            <p v-if="activityHasMore" class="form-text">{{ t('moreActivity') }}</p><p class="privacy-footnote"><Icon name="globe" :size="15" />{{ t('publicActivity') }}</p>
          </section>
          <section v-if="cases.some(item => item.state === 'resolved')" class="resolved-cases"><p class="eyebrow">{{ t('careReports') }}</p><button v-for="item in cases.filter(item => item.state === 'resolved')" :key="item.id" class="resolved-case" @click="openCase(item)"><Icon name="check" />{{ t('statusResolved') }} · {{ item.issueTypes.map(label).join(', ') }}<Icon name="arrow" /></button></section>
        </template>
        <div v-else class="welcome-panel"><div class="welcome-art"><Icon name="bird" :size="68" /><span>+</span></div><p class="eyebrow">FLOCK · GÖTEBORG</p><h1>{{ t('selectPlace') }}</h1><p>{{ t('selectPlaceText') }}</p><button class="btn btn-primary" @click="listMode = true"><Icon name="list" />{{ t('showList') }}</button><div class="welcome-footer">{{ t('tagline') }}</div></div>
      </aside>
    </main>
    <main v-else class="emergency-page"><div class="emergency-intro"><div class="emergency-emblem"><Icon name="heart" :size="32" /></div><p class="eyebrow">FLOCK · {{ t('emergency') }}</p><h1>{{ t('emergencyTitle') }}</h1><p>{{ t('emergencyIntro') }}</p></div><section class="directory-card"><div class="directory-region"><Icon name="pin" />{{ t('gothenburg') }}</div><div class="directory-empty"><Icon name="shield" :size="38" /><h2>{{ t('noContacts') }}</h2><p>{{ t('noContactsText') }}</p><p v-if="emergencyLoading" role="status">{{ t('loading') }}</p><div v-if="emergencyError" class="alert alert-warning" role="alert">{{ emergencyError }}<button class="btn btn-light" @click="loadEmergency">{{ t('retry') }}</button></div></div><div class="emergency-note"><Icon name="info" /><div><strong>{{ t('noAlerts') }}</strong><p>{{ t('emergencyHonesty') }}</p></div></div></section><button class="btn btn-outline-primary mt-4" @click="goPage('map')"><Icon name="arrowLeft" />{{ t('backMap') }}</button></main>
    <nav class="mobile-nav" aria-label="Main"><button :class="{ active: page === 'map' }" @click="goPage('map')"><Icon name="map" /><span>{{ t('map') }}</span></button><button :class="{ active: page === 'emergency' }" @click="goPage('emergency')"><Icon name="heart" /><span>{{ t('emergency') }}</span></button><button @click="session?.user ? (modal = 'account') : openLogin()"><Icon name="user" /><span>{{ session?.user ? t('profile') : t('login') }}</span></button></nav>
  </div>

  <Dialog v-if="modal" :title="modalTitle" :subtitle="modal === 'feeding' || modal === 'care' ? selected?.name : modal === 'login' || modal === 'account' ? t(session?.mode === 'preview' ? 'previewOnly' : 'localOnly') : undefined" :close-label="t('close')" :busy="busy" @close="closeModal">
    <div v-if="formError" class="form-error" role="alert" tabindex="-1" data-testid="form-error"><strong>{{ t('errorTitle') }}</strong><p>{{ formError }}</p><button v-if="formError === t('sessionExpired')" type="button" class="btn btn-outline-primary" @click="pendingModal = modal; modal = 'login'; formError = ''">{{ t('login') }}</button><button v-if="formError === t('clientUpdateRequired')" type="button" class="btn btn-outline-primary" @click="reloadPage">{{ t('reloadPage') }}</button></div>
    <div v-if="modal === 'login'" class="login-content"><div class="login-illustration"><Icon name="bird" :size="52" /><span>+</span></div><p>{{ t('demoLoginText') }}</p><div class="persona-options"><button v-for="persona in (['member','member2','moderator'] as const)" :key="persona" :data-testid="'persona-' + persona" :disabled="busy" @click="login(persona)"><span class="persona-icon"><Icon :name="persona === 'moderator' ? 'shield' : 'bird'" /></span><span><strong>{{ persona === 'member' ? 'Alex' : persona === 'member2' ? 'Sam' : 'Robin' }} · {{ t(persona === 'moderator' ? 'personaModerator' : 'personaMember') }}</strong><small>{{ t(persona === 'moderator' ? 'moderatorText' : 'memberText') }}</small></span><Icon name="arrow" :size="18" /></button></div></div>
    <div v-if="modal === 'account'" class="account-content"><div class="account-summary"><div class="account-avatar"><Icon name="user" :size="30" /></div><div><h3>{{ session?.user?.displayName }}</h3><p>{{ userRoles }}</p></div></div><div class="privacy-callout"><Icon name="shield" /><p>{{ t('accountText') }}</p></div><p class="form-text mb-4">{{ t('accountLimits') }}</p><button class="btn btn-outline-primary w-100 mb-2" @click="clearCase(); clearDrafts(); modal = 'login'">{{ t('switchAccount') }}</button><button class="btn btn-dark w-100" data-testid="logout" :disabled="busy" @click="logout"><Icon name="logout" />{{ t('logout') }}</button></div>
    <form v-if="modal === 'add'" data-testid="place-form" @submit.prevent="savePlace">
      <div class="mb-4"><label for="place-name" class="form-label">{{ t('placeName') }} <span class="required">*</span></label><input id="place-name" data-testid="place-name" v-model="placeDraft.name" class="form-control" required minlength="2" maxlength="100" autocomplete="off" :disabled="busy"><div class="form-text">{{ t('placeNameHint') }}</div></div>
      <fieldset class="mb-4"><legend class="form-label">{{ t('chooseLocation') }}</legend><p class="form-text">{{ t('locationHelp') }}</p>
        <button class="btn btn-outline-primary mb-2" type="button" data-testid="use-my-location" :disabled="busy || geoState === 'locating'" @click="useMyLocation"><Icon name="pin" />{{ t('useMyLocation') }}</button>
        <p data-testid="geolocation-status" class="geolocation-status" :class="{'location-error':['denied','unavailable','timeout','unsupported','outside'].includes(geoState)}" role="status">{{ geoMessage }}<span v-if="geoAccuracy !== null"> {{ t('locationAccuracy') }} ±{{ geoAccuracy }} m.</span></p>
        <div class="location-picker"><MapCanvas :places="[]" picking :coordinate="coordinate" @pick="pickPlace" /></div>
        <div class="row g-3 mt-1"><div class="col-6"><label for="latitude" class="form-label">{{ t('latitude') }}</label><input id="latitude" data-testid="latitude" v-model.number="placeDraft.latitude" @input="manualLocationChange" class="form-control" type="number" step="any" min="57.4" max="58.1" required></div><div class="col-6"><label for="longitude" class="form-label">{{ t('longitude') }}</label><input id="longitude" data-testid="longitude" v-model.number="placeDraft.longitude" @input="manualLocationChange" class="form-control" type="number" step="any" min="11.4" max="12.6" required></div></div>
        <p class="form-text mt-2">{{ t('nearbyPlaces') }} {{ places.slice(0, 3).map(place => place.name).join(' · ') }}</p>
        <label class="public-location-confirmation"><input data-testid="public-location-confirmed" v-model="placeDraft.publicLocationConfirmed" class="form-check-input" type="checkbox" required><span>{{ t('confirmPublicLocation') }}</span></label>
      </fieldset>
      <div class="mb-4"><label for="place-comment" class="form-label">{{ t('placeComment') }} <span class="optional">{{ t('optional') }}</span></label><textarea id="place-comment" data-testid="place-comment" v-model="placeDraft.comment" class="form-control" rows="2" maxlength="500"></textarea><div class="form-text">{{ t('commentAudience') }}</div></div>
      <label class="initial-feeding"><input data-testid="initial-feeding" v-model="placeDraft.initialFeeding" class="form-check-input" type="checkbox"><span><strong>{{ t('initialFeeding') }}</strong></span><Icon name="bird" /></label><FeedingFields v-if="placeDraft.initialFeeding" :model="feedingDraft" />
      <div class="privacy-callout"><Icon name="globe" /><p>{{ t('placePrivacy') }}</p></div><button class="btn btn-primary w-100" data-testid="save-place" :disabled="busy || !placeDraft.publicLocationConfirmed" type="submit"><Icon name="check" />{{ busy ? t('saving') : t('savePlace') }}</button>
    </form>
    <form v-if="modal === 'feeding'" data-testid="feeding-form" @submit.prevent="saveFeeding"><FeedingFields :model="feedingDraft" /><div class="privacy-callout"><Icon name="shield" /><p>{{ t('feedingPrivacy') }}</p></div><button class="btn btn-primary w-100" data-testid="save-feeding" :disabled="busy" type="submit"><Icon name="check" />{{ busy ? t('saving') : t('saveFeeding') }}</button></form>
    <form v-if="modal === 'care'" data-testid="care-form" @submit.prevent="saveCare">
      <p class="intro-text">{{ t('reportIntro') }}</p><p class="care-place-reference"><Icon name="pin" />{{ selected?.name }}</p>
      <fieldset class="mb-4"><legend class="form-label">{{ t('issueTypes') }} <span class="required">*</span></legend><div class="choice-chips care-choices"><label v-for="issue in ISSUE_TYPES" :key="issue" class="choice-chip" :class="{ chosen: careDraft.issueTypes.includes(issue) }"><input :data-testid="'issue-' + issue" v-model="careDraft.issueTypes" type="checkbox" :value="issue">{{ label(issue) }}</label></div></fieldset>
      <fieldset class="mb-4"><legend class="form-label">{{ t('urgency') }} <span class="required">*</span></legend><div class="urgency-options"><label v-for="urgency in (['now', 'today'] as const)" :key="urgency" :class="{ chosen: careDraft.urgency === urgency }"><input :data-testid="'urgency-' + urgency" v-model="careDraft.urgency" type="radio" name="urgency" :value="urgency" required>{{ t(urgency) }}</label></div><div v-if="careDraft.urgency === 'now'" class="urgency-note"><Icon name="info" /><p>{{ t('emergencyHonesty') }}</p></div></fieldset>
      <div class="mb-4"><label for="bird-count" class="form-label">{{ t('birdCount') }}</label><input id="bird-count" data-testid="bird-count" v-model.number="careDraft.birdCount" class="form-control count-input" type="number" min="1" max="1000" required></div>
      <div class="mb-4"><label for="care-description" class="form-label">{{ t('description') }} <span class="required">*</span></label><textarea id="care-description" data-testid="care-description" v-model="careDraft.description" class="form-control" rows="4" required minlength="3" maxlength="2000" aria-describedby="description-hint"></textarea><div id="description-hint" class="form-text">{{ t('descriptionHint') }}</div></div>
      <label class="initial-feeding resolved-option"><input data-testid="resolve-immediately" v-model="careDraft.resolveImmediately" class="form-check-input" type="checkbox"><span><strong>{{ t('resolveImmediately') }}</strong><small>{{ t('resolveImmediatelyHint') }}</small></span><Icon name="check" /></label>
      <div v-if="careDraft.resolveImmediately" class="mb-4"><label for="resolution-comment" class="form-label">{{ t('resolutionComment') }} <span class="optional">{{ t('optional') }}</span></label><textarea id="resolution-comment" data-testid="resolution-comment" v-model="careDraft.resolutionComment" class="form-control" rows="3" maxlength="1000"></textarea><div class="form-text">{{ t('commentAudience') }}</div></div>
      <div class="privacy-callout care-privacy"><Icon name="globe" /><p>{{ t('carePrivacy') }}</p></div><button class="btn btn-care-solid w-100" data-testid="save-care" :disabled="busy" type="submit"><Icon :name="careDraft.resolveImmediately ? 'check' : 'plus'" />{{ busy ? t('saving') : t('saveCare') }}</button>
    </form>
    <div v-if="modal === 'case'" class="case-content">
      <p v-if="caseLoading" role="status">{{ t('caseLoading') }}</p>
      <template v-if="activeCase">
        <section data-testid="case-public">
          <div class="case-badges"><span class="small-pill care-pill">{{ activeCase.state === 'open' ? t('statusOpen') : activeCase.state === 'claimed' ? t('statusClaimed') : t('statusResolved') }}</span><span class="small-pill">{{ t(activeCase.urgency) }}</span><span v-if="activeCase.overdue" class="small-pill overdue-pill">{{ t('commitmentOverdue') }}</span></div>
          <h3>{{ activeCase.issueTypes.map(label).join(', ') }}</h3><p class="text-secondary">{{ selected?.name }} · {{ formatDate(activeCase.date) }}</p>
          <p class="report-author">{{ t('reportedBy') }} <strong>{{ activeCase.reporterDisplayName }}</strong></p>
          <p class="public-description">{{ activeCase.description || t('noPublicDescription') }}</p>
          <p>{{ t('birdCount') }}: {{ activeCase.birdCount }}</p>
          <div v-if="activeCase.assignedDisplayName && activeCase.plannedDate" class="care-commitment"><Icon name="heart" /><p><strong>{{ activeCase.assignedDisplayName }}</strong><span>{{ t('plannedFor') }} {{ formatDate(activeCase.plannedDate) }}</span><small v-if="activeCase.overdue">{{ t('overdueExplanation') }}</small></p></div>
        </section>
        <div v-if="activeCase.canClaim || activeCase.canRelease || activeCase.canResolve || activeCase.canReopen || activeCase.canComment" class="case-actions">
          <div v-if="activeCase.canClaim" class="mb-3"><label for="planned-date" class="form-label">{{ t('plannedDate') }} <span class="required">*</span></label><input id="planned-date" data-testid="planned-date" v-model="plannedDate" :disabled="busy" type="date" :min="stockholmToday()" class="form-control"><div class="form-text">{{ t('plannedDateHint') }}</div></div>
          <label for="action-comment" class="form-label">{{ t('publicComment') }} <span class="optional">{{ t('optionalForActions') }}</span></label><textarea id="action-comment" data-testid="action-comment" v-model="actionComment" :disabled="busy" class="form-control" rows="3" maxlength="1000"></textarea><p class="form-text">{{ activeCase.canReopen ? t('freshObservation') : t('commentAudience') }}</p>
          <button v-if="activeCase.canClaim" class="btn btn-care-solid" data-testid="case-claim" :disabled="busy" @click="caseAction('claim')">{{ t('claim') }}</button>
          <button v-if="activeCase.canResolve" class="btn btn-primary" data-testid="case-resolve" :disabled="busy" @click="caseAction('resolve')">{{ t('resolve') }}</button>
          <button v-if="activeCase.canRelease" class="btn btn-outline-primary" data-testid="case-release" :disabled="busy" @click="caseAction('release')">{{ t('release') }}</button>
          <button v-if="activeCase.canReopen" class="btn btn-care" data-testid="case-reopen" :disabled="busy" @click="caseAction('reopen')">{{ t('reopen') }}</button>
          <button v-if="activeCase.canComment" class="btn btn-outline-primary" data-testid="case-comment" :disabled="busy || !actionComment.trim()" @click="caseAction('comment')">{{ t('postComment') }}</button>
        </div>
        <div v-else-if="!session?.user" class="privacy-callout"><Icon name="user" /><p>{{ t('loginCareActions') }}</p></div>
        <section v-if="caseActivity.length" class="case-history" data-testid="case-activity-log"><h4>{{ t('caseActivity') }}</h4><ActivityList :items="caseActivity" :show-case-links="false" /></section>
        <p v-if="activityHasMore" class="form-text">{{ t('moreActivity') }}</p><p class="privacy-footnote mt-4">{{ t('noAlerts') }}</p>
      </template>
    </div>
  </Dialog>
</template>
