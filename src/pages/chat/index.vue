<script setup lang="ts">
import type { MealType } from '@/api/types/smartdiet'
import { createRecord, getRecords, uploadFoodImage } from '@/api/smartdiet'
import { useChatStore, useTokenStore } from '@/store'
import { chooseImage, formatDate, getCurrentMealType, mealOptions } from '@/utils/smartdiet'

definePage({
  type: 'home',
  style: { navigationStyle: 'custom', enablePullDownRefresh: false },
})

const recordStore = useChatStore()
const tokenStore = useTokenStore()
const dailyScore = ref(0)
const todayRecordCount = ref(0)
const mealLabels = mealOptions.map(item => item.label)
const positiveTagOptions = ['好吃', '新鲜', '营养均衡', '高蛋白', '蔬菜丰富', '饱腹感强']
const negativeTagOptions = ['太油', '太咸', '太甜', '不新鲜', '分量不足', '价格偏高']
const draft = computed(() => recordStore.draft)

function ensureLogin() {
  if (!tokenStore.updateNowTime().hasLogin) {
    uni.reLaunch({ url: '/pages/login/index' })
    return false
  }
  return true
}

function normalizeDraft() {
  const current = recordStore.draft
  if (!current)
    return
  current.localImageUrl ||= ''
  current.imageUrl ||= ''
  current.name ||= ''
  current.description ||= ''
  current.positiveTags ||= []
  current.negativeTags ||= []
  current.price ??= null
}

async function refreshTodayRecords() {
  if (!tokenStore.updateNowTime().hasLogin)
    return
  try {
    const records = await getRecords(formatDate(new Date()))
    todayRecordCount.value = records.length
    dailyScore.value = records.length
      ? Math.round(records.reduce((sum, item) => sum + (item.rating || 0), 0) / records.length * 10) / 10
      : 0
  }
  catch {
    todayRecordCount.value = 0
    dailyScore.value = 0
  }
}

function startRecord() {
  if (!ensureLogin())
    return
  recordStore.draft = {
    localImageUrl: '',
    imageUrl: '',
    date: formatDate(new Date()),
    mealType: getCurrentMealType(),
    name: '',
    description: '',
    positiveTags: [],
    negativeTags: [],
    price: null,
    rating: 0,
    saving: false,
    saved: false,
  }
}

async function chooseRecordImage() {
  const current = draft.value
  if (!current || current.saving)
    return
  try {
    const localImageUrl = await chooseImage(['camera', 'album'])
    if (!localImageUrl)
      return
    const uploaded = await uploadFoodImage(localImageUrl)
    current.localImageUrl = localImageUrl
    current.imageUrl = uploaded.url
  }
  catch (error) {
    const message = error instanceof Error ? error.message : '图片上传失败'
    if (!message.includes('cancel'))
      uni.showToast({ title: message, icon: 'none' })
  }
}

function onMealChange(event: { detail: { value: string } }) {
  if (recordStore.draft)
    recordStore.draft.mealType = mealOptions[Number(event.detail.value)]?.value || 'other'
}

function toggleTag(kind: 'positive' | 'negative', tag: string) {
  const current = recordStore.draft
  if (!current)
    return
  const tags = kind === 'positive' ? current.positiveTags : current.negativeTags
  const index = tags.indexOf(tag)
  if (index >= 0)
    tags.splice(index, 1)
  else
    tags.push(tag)
}

function onPriceInput(event: { detail: { value: string } }) {
  if (!recordStore.draft)
    return
  const value = event.detail.value.trim()
  const price = Number(value)
  recordStore.draft.price = value && Number.isFinite(price) ? price : null
}

async function saveDraft() {
  const current = recordStore.draft
  if (!current || current.saving)
    return
  const name = current.name.trim()
  if (!name) {
    uni.showToast({ title: '请填写饮食名称', icon: 'none' })
    return
  }
  current.saving = true
  try {
    await createRecord({
      date: current.date,
      mealType: current.mealType,
      name,
      description: current.description.trim(),
      positiveTags: current.positiveTags,
      negativeTags: current.negativeTags,
      price: current.price,
      imageUrl: current.imageUrl,
      rating: current.rating,
    })
    current.saved = true
    uni.showToast({ title: '记录已保存', icon: 'success' })
    await refreshTodayRecords()
  }
  catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' })
  }
  finally {
    current.saving = false
  }
}

function preview(url: string) {
  if (url)
    uni.previewImage({ urls: [url], current: url })
}

onLoad(normalizeDraft)
onShow(() => {
  if (!ensureLogin())
    return
  normalizeDraft()
  refreshTodayRecords()
})
</script>

<template>
  <view class="record-page">
    <view class="record-header pt-safe">
      <view>
        <text class="header-title">饮食记录</text>
        <view class="header-subtitle"><text class="online-dot" />手动记录每一餐</view>
      </view>
      <view class="score-pill"><text class="score-value">{{ dailyScore || '--' }}</text><text class="score-label">今日星级</text></view>
    </view>

    <scroll-view class="record-scroll" scroll-y :show-scrollbar="false">
      <view class="record-content">
        <view v-if="!draft" class="empty-card">
          <view class="empty-icon">🥗</view>
          <text class="empty-title">记录今天吃了什么</text>
          <text class="empty-copy">填写饮食名称、感受、标签和星级，建立属于你的饮食记录。</text>
          <view class="today-summary">今日已记录 <text>{{ todayRecordCount }}</text> 餐</view>
        </view>

        <view v-else class="food-card">
          <view class="food-card-body">
            <view class="form-heading">
              <view><text class="form-title">填写饮食记录</text><text class="form-note">图片可选，不会进行 AI 识别</text></view>
              <view v-if="draft.localImageUrl" class="image-thumb" @click="preview(draft.localImageUrl)"><image :src="draft.localImageUrl" mode="aspectFill" /></view>
              <view v-else class="image-add" @click="chooseRecordImage"><text>＋</text><text>图片</text></view>
            </view>
            <view class="form-field"><text class="field-label required">饮食名称</text><input v-model="draft.name" class="form-input" placeholder="例如：番茄鸡蛋面" :maxlength="120"></view>
            <view class="form-field"><text class="field-label">饮食描述（可选）</text><textarea v-model="draft.description" class="form-textarea" auto-height placeholder="记录口味、食材或感受" :maxlength="1000" /></view>
            <view class="form-field"><text class="field-label">我觉得好的地方</text><view class="tag-picker"><text v-for="tag in positiveTagOptions" :key="tag" class="selectable-tag positive" :class="{ selected: draft.positiveTags.includes(tag) }" @click="toggleTag('positive', tag)">{{ tag }}</text></view></view>
            <view class="form-field"><text class="field-label">我不喜欢的地方</text><view class="tag-picker"><text v-for="tag in negativeTagOptions" :key="tag" class="selectable-tag negative" :class="{ selected: draft.negativeTags.includes(tag) }" @click="toggleTag('negative', tag)">{{ tag }}</text></view></view>
            <view class="form-field"><text class="field-label">饮食价格（可选）</text><view class="price-input-wrap"><text>¥</text><input :value="draft.price === null ? '' : String(draft.price)" type="digit" class="price-input" placeholder="0.00" @input="onPriceInput" /></view></view>
            <view class="record-fields">
              <picker mode="date" :value="draft.date" @change="draft.date = $event.detail.value"><view class="field-pill">📅 {{ draft.date }}</view></picker>
              <picker :range="mealLabels" :value="mealOptions.findIndex(item => item.value === draft?.mealType)" @change="onMealChange"><view class="field-pill">🍽 {{ mealOptions.find(item => item.value === draft?.mealType)?.label }}</view></picker>
            </view>
            <view class="rating-row"><text>饮食星级评分</text><view><text v-for="star in 5" :key="star" class="star" :class="{ active: star <= draft.rating }" @click="draft.rating = star">★</text></view></view>
            <button class="save-button" :disabled="draft.saved || !draft.name.trim()" :loading="draft.saving" @click="saveDraft">{{ draft.saved ? '✓ 已保存到饮食报告' : '保存饮食记录' }}</button>
          </view>
        </view>
      </view>
    </scroll-view>

    <view class="action-bar pb-safe"><button class="record-button" @click="startRecord"><text class="action-icon">✍️</text><text>{{ draft?.saved ? '再填写一餐' : '填写饮食记录' }}</text></button></view>
  </view>
</template>

<style scoped lang="scss">
.record-page { --header-height: 112rpx; --action-height: 126rpx; --tabbar-height: 100rpx; height: 100%; min-height: 0; background: #f4f7f4; color: #254334; }
.record-header { box-sizing: border-box; position: fixed; z-index: 2; top: 0; right: 0; left: 0; height: calc(var(--header-height) + env(safe-area-inset-top)); padding: 0 30rpx 22rpx; background: rgba(255, 255, 255, 0.97); box-shadow: 0 4rpx 22rpx rgba(23, 67, 42, 0.06); display: flex; align-items: flex-end; justify-content: space-between; }
.header-title { display: block; color: #153c27; font-size: 36rpx; font-weight: 750; }
.header-subtitle { margin-top: 7rpx; color: #819087; font-size: 21rpx; display: flex; align-items: center; gap: 8rpx; }
.online-dot { width: 12rpx; height: 12rpx; border-radius: 50%; background: #33b767; box-shadow: 0 0 0 5rpx rgba(51, 183, 103, 0.12); }
.score-pill { min-width: 112rpx; padding: 10rpx 16rpx; border-radius: 22rpx; background: #eef9f2; text-align: center; }
.score-value, .score-label { display: block; }
.score-value { color: #218c50; font-size: 30rpx; font-weight: 750; }
.score-label { color: #6b8877; font-size: 18rpx; }
.record-scroll { position: fixed; top: calc(var(--header-height) + env(safe-area-inset-top)); right: 0; bottom: calc(var(--action-height) + var(--tabbar-height) + env(safe-area-inset-bottom)); left: 0; }
.record-content { padding: 30rpx 26rpx 40rpx; }
.empty-card, .food-card { border-radius: 32rpx; background: #fff; box-shadow: 0 14rpx 44rpx rgba(30, 78, 48, 0.1); }
.empty-card { padding: 68rpx 42rpx; text-align: center; }
.empty-icon { margin: 0 auto 24rpx; width: 100rpx; height: 100rpx; border-radius: 32rpx; background: #edf9f0; display: flex; align-items: center; justify-content: center; font-size: 54rpx; }
.empty-title { display: block; color: #234734; font-size: 32rpx; font-weight: 700; }
.empty-copy { display: block; margin-top: 18rpx; color: #75877c; font-size: 24rpx; line-height: 1.7; }
.today-summary { margin-top: 34rpx; color: #688074; font-size: 23rpx; }
.today-summary text { color: #249957; font-size: 31rpx; font-weight: 700; }
.food-card-body { padding: 28rpx; }
.form-heading { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; }
.form-title { display: block; color: #234734; font-size: 30rpx; font-weight: 700; }
.form-note { display: block; margin-top: 8rpx; color: #819087; font-size: 20rpx; }
.image-thumb, .image-add { width: 94rpx; height: 94rpx; flex: none; overflow: hidden; border-radius: 20rpx; }
.image-thumb image { width: 100%; height: 100%; }
.image-add { color: #4d8e66; background: #edf8f0; font-size: 18rpx; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.image-add text:first-child { font-size: 32rpx; line-height: 1; }
.form-field { margin-top: 24rpx; }
.field-label { display: block; margin-bottom: 12rpx; color: #5e7668; font-size: 23rpx; }
.field-label.required::after { margin-left: 5rpx; color: #d85a52; content: '*'; }
.form-input, .form-textarea { box-sizing: border-box; width: 100%; border: 1rpx solid #dbe6de; border-radius: 16rpx; background: #f8fbf9; color: #294738; font-size: 25rpx; }
.form-input { height: 76rpx; padding: 0 20rpx; }
.form-textarea { min-height: 112rpx; padding: 17rpx 20rpx; line-height: 1.5; }
.tag-picker { display: flex; flex-wrap: wrap; gap: 12rpx; }
.selectable-tag { padding: 10rpx 16rpx; border: 1rpx solid #dbe6de; border-radius: 999rpx; color: #6f8177; background: #f8fbf9; font-size: 21rpx; }
.selectable-tag.positive.selected { border-color: #7bc899; color: #227746; background: #e6f7eb; }
.selectable-tag.negative.selected { border-color: #e3b97a; color: #a06313; background: #fff3df; }
.price-input-wrap { height: 74rpx; padding: 0 20rpx; border: 1rpx solid #dbe6de; border-radius: 16rpx; color: #2b9b59; background: #f8fbf9; font-size: 27rpx; display: flex; align-items: center; gap: 12rpx; }
.price-input { flex: 1; height: 100%; color: #294738; font-size: 25rpx; }
.record-fields { display: flex; gap: 12rpx; margin-top: 24rpx; }
.field-pill { padding: 14rpx 18rpx; border-radius: 18rpx; color: #4c6658; background: #f0f5f1; font-size: 21rpx; }
.rating-row { margin-top: 24rpx; display: flex; align-items: center; justify-content: space-between; color: #687a70; font-size: 23rpx; }
.star { margin-left: 5rpx; color: #dce2de; font-size: 35rpx; }
.star.active { color: #f3b634; }
.save-button, .record-button { border: 0; color: #fff; background: #2ca45e; }
.save-button { margin-top: 28rpx; height: 78rpx; border-radius: 22rpx; font-size: 25rpx; display: flex; align-items: center; justify-content: center; }
.save-button[disabled] { color: #779184; background: #e5eee8; }
.save-button::after, .record-button::after { border: 0; }
.action-bar { box-sizing: border-box; position: fixed; z-index: 2; right: 0; bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom)); left: 0; height: calc(var(--action-height) + env(safe-area-inset-bottom)); padding: 16rpx 22rpx calc(16rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid #e9eeea; }
.record-button { width: 100%; height: 94rpx; border-radius: 20rpx; font-size: 27rpx; font-weight: 650; display: flex; align-items: center; justify-content: center; gap: 12rpx; }
.action-icon { font-size: 30rpx; }
</style>
