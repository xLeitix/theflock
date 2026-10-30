<script setup lang="ts">
import type { FeedingDraft } from '../types';
import { FOOD_TYPES } from '../../../../packages/contracts/src/index';
import { t, label } from '../i18n';
const props = defineProps<{ model: FeedingDraft }>();
</script>
<template>
  <div class="mb-4"><label class="form-label" for="feeding-time">{{ t('feedingTime') }}</label><input id="feeding-time" data-testid="feeding-time" v-model="props.model.occurredAt" type="datetime-local" class="form-control" required><div class="form-text">{{ t('timeHint') }} · {{ Intl.DateTimeFormat().resolvedOptions().timeZone }}</div></div>
  <fieldset class="mb-4"><legend class="form-label">{{ t('flockSize') }} <span class="required">*</span></legend><div class="flock-options">
    <label v-for="band in (['small','medium','large'] as const)" :key="band" class="flock-option" :class="{ chosen: props.model.flockBand === band }"><input :data-testid="'flock-' + band" v-model="props.model.flockBand" type="radio" name="flock-band" :value="band" required><span class="flock-glyph" aria-hidden="true">{{ band === 'small' ? '••' : band === 'medium' ? '•••' : '••••' }}</span><strong>{{ t(band) }}</strong><span>{{ t(`${band}Count`) }}</span></label>
  </div></fieldset>
  <fieldset class="mb-4"><legend class="form-label">{{ t('foodTypes') }} <span class="optional">{{ t('optional') }}</span></legend><div class="choice-chips"><label v-for="food in FOOD_TYPES" :key="food" class="choice-chip" :class="{ chosen: props.model.foodTypes.includes(food) }"><input :data-testid="'food-' + food" v-model="props.model.foodTypes" type="checkbox" :value="food">{{ label(food) }}</label></div></fieldset>
  <div class="mb-4"><label class="form-label" for="feeding-comment">{{ t('publicComment') }} <span class="optional">{{ t('optional') }}</span></label><textarea id="feeding-comment" data-testid="feeding-comment" v-model="props.model.comment" class="form-control" rows="3" maxlength="1000" aria-describedby="feeding-comment-hint"></textarea><div id="feeding-comment-hint" class="form-text">{{ t('commentAudience') }}</div></div>
</template>
