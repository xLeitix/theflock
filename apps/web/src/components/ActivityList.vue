<script setup lang="ts">
import type { Activity, CareAction } from '../../../../packages/contracts/src/index';
import { t, label, formatDate } from '../i18n';
import Icon from './Icon.vue';
withDefaults(defineProps<{ items: Activity[]; showCaseLinks?: boolean }>(), {showCaseLinks:true});
const emit = defineEmits<{ openCase:[id:string] }>();
const actionLabels = {create:'activityReported',reported_resolved:'activityReportedResolved',claim:'activityClaimed',release:'activityReleased',resolve:'activityResolved',reopen:'activityReopened',comment:'activityCommented'} as const;
function actionLabel(action:CareAction) { return t(actionLabels[action]); }
</script>
<template>
  <article v-for="(item,index) in items" :key="item.kind + item.id" class="feeding-row activity-row" :class="{'care-activity':item.kind==='care'}" data-testid="activity-item" :data-kind="item.kind" :data-case-id="item.care?.caseId">
    <div class="feeding-avatar" :class="'avatar-' + index % 3"><Icon :name="item.kind==='feeding' ? 'bird' : 'heart'" :size="20" /></div>
    <div class="activity-copy">
      <h3>{{ item.authorDisplayName }}</h3>
      <p class="activity-action">{{ item.kind==='feeding' ? t('activityFed') : actionLabel(item.care.action) }}</p>
      <time :datetime="item.date">{{ formatDate(item.date) }}</time>
      <p v-if="item.kind==='feeding'"><span class="small-pill">{{ item.feeding.flockBand==='unknown' ? t('notRecorded') : label(item.feeding.flockBand) }}</span><span v-if="item.feeding.foodTypes.length">{{ item.feeding.foodTypes.map(label).join(' · ') }}</span></p>
      <p v-else><span class="small-pill care-pill">{{ item.care.issueTypes.map(label).join(', ') }}</span><span v-if="item.care.plannedDate">{{ t('plannedFor') }} {{ formatDate(item.care.plannedDate) }}</span></p>
      <p v-if="item.comment" class="activity-comment">{{ item.comment }}</p>
      <button v-if="item.kind==='care' && showCaseLinks" class="activity-case-link" @click="emit('openCase',item.care.caseId)">{{ t('viewCase') }}<Icon name="arrow" :size="14" /></button>
    </div>
  </article>
</template>
