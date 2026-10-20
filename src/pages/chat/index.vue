<script setup lang="ts">
import type { MealType } from '@/api/types/smartdiet'
import { absoluteAssetUrl, createRecord, getRecords, uploadFoodImage } from '@/api/smartdiet'
import { useChatStore, useTokenStore } from '@/store'
import { chooseImages, formatDate, getCurrentMealType, mealOptions } from '@/utils/smartdiet'

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
const maxPhotos = 6
const uploadingPhotos = ref(false)
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
  if (!Array.isArray(current.imageUrls))
    current.imageUrls = current.imageUrl ? [current.imageUrl] : []
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
    imageUrls: [],
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

function closeRecord() {
  const current = recordStore.draft
  if (!current)
    return
  const hasContent = !!(current.name.trim() || current.description.trim() || current.imageUrls.length
    || current.positiveTags.length || current.negativeTags.length || current.price !== null || current.rating)
  if (hasContent && !current.saved) {
    uni.showModal({
      title: '放弃当前记录？',
      content: '已填写的内容将不会保存。',
      confirmText: '放弃',
      confirmColor: '#b85b48',
      success: res => { if (res.confirm) recordStore.draft = null },
    })
    return
  }
  recordStore.draft = null
}

async function chooseRecordImages() {
  const current = draft.value
  if (!current || current.saving || uploadingPhotos.value || current.imageUrls.length >= maxPhotos)
    return
  try {
    const paths = await chooseImages(maxPhotos - current.imageUrls.length)
    uploadingPhotos.value = true
    const results = await Promise.allSettled(paths.map(path => uploadFoodImage(path)))
    for (const result of results) {
      if (result.status === 'fulfilled')
        current.imageUrls.push(result.value.url)
    }
    const failed = results.filter(result => result.status === 'rejected').length
    if (failed)
      uni.showToast({ title: `${failed} 张照片上传失败，请重试`, icon: 'none' })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : '图片上传失败'
    if (!message.includes('cancel'))
      uni.showToast({ title: message, icon: 'none' })
  }
  finally {
    uploadingPhotos.value = false
  }
}

function removeRecordImage(index: number) {
  if (!draft.value || uploadingPhotos.value || draft.value.saving)
    return
  draft.value.imageUrls.splice(index, 1)
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
  if (!current || current.saving || uploadingPhotos.value)
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
      imageUrl: current.imageUrls[0] || '',
      imageUrls: current.imageUrls,
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

function handlePrimaryAction() {
  if (!draft.value || draft.value.saved)
    startRecord()
  else
    saveDraft()
}

function preview(url: string, urls: string[]) {
  if (url)
    uni.previewImage({ urls: urls.map(absoluteAssetUrl), current: absoluteAssetUrl(url) })
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
        <template v-if="!draft">
          <view class="empty-hero">
            <view class="hero-kicker"><text class="kicker-dot" /> 今日饮食 · 用心记录</view>
            <text class="hero-title">好好吃饭，</text><text class="hero-title">也好好记录。</text>
            <text class="hero-copy">记下今天的味道，慢慢看见更好的自己。</text>
            <view class="hero-illustration">
              <view class="illustration-halo" />
              <image class="bowl-illustration" src="/static/images/meal-bowl-illustration.png" mode="aspectFit" />
            </view>
            <view class="today-summary"><view><text class="summary-number">{{ todayRecordCount }}</text><text class="summary-unit">餐</text></view><text class="summary-label">今日已记录</text></view>
          </view>
          <view class="guide-card">
            <view class="guide-heading"><view><text class="guide-kicker">轻松开始</text><text class="guide-title">让每一餐都有迹可循</text></view><text class="guide-sparkle">✦</text></view>
            <view class="guide-steps">
              <view class="guide-step"><view class="step-icon">✎</view><text class="step-number">01</text><text class="step-label">写下餐食</text></view>
              <view class="step-connector" />
              <view class="guide-step"><view class="step-icon">♡</view><text class="step-number">02</text><text class="step-label">记下感受</text></view>
              <view class="step-connector" />
              <view class="guide-step"><view class="step-icon">★</view><text class="step-number">03</text><text class="step-label">给出评分</text></view>
            </view>
          </view>
        </template>

        <view v-else class="form-layout">
          <view class="form-hero">
            <view class="form-heading-row"><text class="form-back" @click="closeRecord">‹</text><text class="form-kicker">今日饮食 · 新记录</text></view>
            <text class="form-title">这一餐，吃了什么？</text>
            <text class="form-intro">花一分钟，记下味道和当时的心情。</text>
            <image class="form-art" src="/static/images/meal-bowl-illustration.png" mode="aspectFit" />
            <view class="record-fields">
              <picker mode="date" :value="draft.date" @change="draft.date = $event.detail.value"><view class="field-pill">📅 <text>{{ draft.date }}</text><text class="pill-arrow">⌄</text></view></picker>
              <picker :range="mealLabels" :value="mealOptions.findIndex(item => item.value === draft?.mealType)" @change="onMealChange"><view class="field-pill">🍽 <text>{{ mealOptions.find(item => item.value === draft?.mealType)?.label }}</text><text class="pill-arrow">⌄</text></view></picker>
            </view>
          </view>

          <view class="form-section">
            <view class="section-heading"><view class="section-heading-main"><text class="section-index">01</text><text class="section-title">餐食信息</text></view><text class="section-hint">先从名字开始</text></view>
            <view class="form-field"><text class="field-label required">饮食名称</text><input v-model="draft.name" class="form-input" placeholder="例如：番茄鸡蛋面" :maxlength="120"></view>
            <view class="form-field"><text class="field-label">饮食描述 <text class="optional">可选</text></text><textarea v-model="draft.description" class="form-textarea" auto-height placeholder="说说口味、食材，或这一餐的感受…" :maxlength="1000" /></view>
            <view class="form-field"><view class="photo-label-row"><text class="field-label">餐食照片 <text class="optional">可选</text></text><text class="photo-count">{{ draft.imageUrls.length }}/{{ maxPhotos }}</text></view>
              <view class="photo-grid">
                <view v-for="(url, index) in draft.imageUrls" :key="`${url}-${index}`" class="photo-tile"><image :src="absoluteAssetUrl(url)" mode="aspectFill" @click="preview(url, draft.imageUrls)" /><view class="photo-remove" @click.stop="removeRecordImage(index)">×</view></view>
                <view v-if="draft.imageUrls.length < maxPhotos" class="photo-add" @click="chooseRecordImages"><text class="photo-add-icon">{{ uploadingPhotos ? '◌' : '＋' }}</text><text>{{ uploadingPhotos ? '上传中' : '添加照片' }}</text></view>
              </view>
              <text class="photo-help">可多选上传，最多 6 张 · 不进行 AI 识别</text>
            </view>
          </view>

          <view class="form-section">
            <view class="section-heading"><view class="section-heading-main"><text class="section-index">02</text><text class="section-title">这一餐的感受</text></view><text class="section-hint">轻触标签即可选择</text></view>
            <view class="form-field"><text class="field-label">喜欢的地方 <text class="label-emoji">♡</text></text><view class="tag-picker"><text v-for="tag in positiveTagOptions" :key="tag" class="selectable-tag positive" :class="{ selected: draft.positiveTags.includes(tag) }" @click="toggleTag('positive', tag)">{{ tag }}</text></view></view>
            <view class="form-field"><text class="field-label">可以更好的地方 <text class="label-emoji">✳</text></text><view class="tag-picker"><text v-for="tag in negativeTagOptions" :key="tag" class="selectable-tag negative" :class="{ selected: draft.negativeTags.includes(tag) }" @click="toggleTag('negative', tag)">{{ tag }}</text></view></view>
          </view>

          <view class="form-section final-section">
            <view class="section-heading"><view class="section-heading-main"><text class="section-index">03</text><text class="section-title">最后补充一下</text></view></view>
            <view class="form-field"><text class="field-label">饮食价格 <text class="optional">可选</text></text><view class="price-input-wrap"><text>¥</text><input :value="draft.price === null ? '' : String(draft.price)" type="digit" class="price-input" placeholder="0.00" @input="onPriceInput" /></view></view>
            <view class="rating-block"><view><text class="field-label">这一餐，打几星？</text><text class="rating-note">按自己的感受来就好</text></view><view class="rating-stars"><text v-for="star in 5" :key="star" class="star" :class="{ active: star <= draft.rating }" @click="draft.rating = star">★</text></view></view>
            <view v-if="draft.saved" class="saved-message">✓ 已保存，可以在饮食报告中查看</view>
          </view>
        </view>
      </view>
    </scroll-view>

    <view class="action-bar pb-safe"><button class="record-button" :disabled="!!draft && !draft.saved && (!draft.name.trim() || draft.saving || uploadingPhotos)" :loading="draft?.saving" @click="handlePrimaryAction"><text>{{ !draft ? '开始记录这一餐' : draft.saved ? '再填写一餐' : '保存这一餐' }}</text><text class="action-arrow">→</text></button></view>
  </view>
</template>

<style scoped lang="scss">
.record-page { --header-height: 112rpx; --action-height: 126rpx; --tabbar-height: 100rpx; height: 100%; min-height: 0; background: #f7f8f3; color: #244532; }
.record-header { box-sizing: border-box; position: fixed; z-index: 2; top: 0; right: 0; left: 0; height: calc(var(--header-height) + env(safe-area-inset-top)); padding: 0 30rpx 20rpx; background: rgba(255, 255, 255, 0.98); border-bottom: 1rpx solid #eef1e9; display: flex; align-items: flex-end; justify-content: space-between; }
.header-title { display: block; color: #173c2b; font-size: 36rpx; font-weight: 750; letter-spacing: 1rpx; }
.header-subtitle { margin-top: 5rpx; color: #889b8d; font-size: 21rpx; display: flex; align-items: center; gap: 9rpx; }
.online-dot { width: 11rpx; height: 11rpx; border-radius: 50%; background: #42b977; box-shadow: 0 0 0 5rpx rgba(66, 185, 119, 0.13); }
.score-pill { min-width: 104rpx; padding: 9rpx 17rpx; border: 1rpx solid #e5f2e7; border-radius: 23rpx; background: #f0f8ef; text-align: center; }
.score-value, .score-label { display: block; }
.score-value { color: #21864d; font-size: 29rpx; font-weight: 750; line-height: 1.1; }
.score-label { margin-top: 4rpx; color: #73907b; font-size: 18rpx; }
.record-scroll { position: fixed; top: calc(var(--header-height) + env(safe-area-inset-top)); right: 0; bottom: calc(var(--action-height) + var(--tabbar-height) + env(safe-area-inset-bottom)); left: 0; }
.record-content { padding: 24rpx 25rpx 44rpx; }
.empty-hero { position: relative; overflow: hidden; padding: 38rpx 38rpx 28rpx; border-radius: 35rpx; background: linear-gradient(145deg, #e8f5e6 0%, #f2f8e9 54%, #fff4e2 100%); border: 1rpx solid rgba(69, 127, 70, 0.08); }
.empty-hero::before { content: ''; position: absolute; top: -105rpx; right: -115rpx; width: 350rpx; height: 350rpx; border: 1rpx solid rgba(255, 255, 255, 0.7); border-radius: 50%; }
.hero-kicker { position: relative; z-index: 1; display: flex; align-items: center; gap: 10rpx; color: #49865e; font-size: 20rpx; font-weight: 700; letter-spacing: 2rpx; }
.kicker-dot { width: 11rpx; height: 11rpx; border-radius: 50%; background: #37a76c; }
.hero-title { position: relative; z-index: 1; display: block; margin-top: 21rpx; color: #193e2b; font-size: 47rpx; font-weight: 800; line-height: 1.24; letter-spacing: 1rpx; }
.hero-title + .hero-title { margin-top: 0; }
.hero-copy { position: relative; z-index: 1; display: block; margin-top: 17rpx; color: #698273; font-size: 22rpx; line-height: 1.55; }
.hero-illustration { position: relative; height: 230rpx; margin-top: 13rpx; }
.illustration-circle { position: absolute; top: 0; left: 50%; width: 220rpx; height: 220rpx; transform: translateX(-50%); border-radius: 50%; background: rgba(255, 255, 255, 0.54); display: flex; align-items: center; justify-content: center; }
.illustration-plate { width: 151rpx; height: 151rpx; border-radius: 50%; background: #fff; box-shadow: 0 18rpx 30rpx rgba(54, 114, 65, 0.14), inset 0 0 0 10rpx #f8fcf5; font-size: 80rpx; display: flex; align-items: center; justify-content: center; transform: rotate(-9deg); }
.illustration-note { position: absolute; z-index: 1; padding: 10rpx 17rpx; border-radius: 999rpx; background: #fff; color: #467253; box-shadow: 0 8rpx 22rpx rgba(53, 90, 59, 0.1); font-size: 19rpx; font-weight: 650; }
.note-top { top: 30rpx; right: 0; transform: rotate(7deg); }
.note-bottom { bottom: 23rpx; left: 0; transform: rotate(-6deg); }
.today-summary { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; padding: 17rpx 23rpx; border-radius: 22rpx; background: rgba(255, 255, 255, 0.78); }
.summary-number { color: #1d844e; font-size: 35rpx; font-weight: 800; }
.summary-unit { margin-left: 6rpx; color: #527b60; font-size: 21rpx; }
.summary-label { color: #728d78; font-size: 21rpx; }
.guide-card { margin-top: 23rpx; padding: 27rpx 29rpx 14rpx; border: 1rpx solid #eef0e9; border-radius: 30rpx; background: #fff; box-shadow: 0 9rpx 26rpx rgba(34, 66, 45, 0.035); }
.guide-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12rpx; }
.guide-kicker, .guide-title { display: block; }
.guide-kicker { color: #64a073; font-size: 19rpx; font-weight: 700; letter-spacing: 2rpx; }
.guide-title { margin-top: 6rpx; color: #254332; font-size: 27rpx; font-weight: 750; }
.guide-sparkle { color: #e5b46d; font-size: 42rpx; }
.guide-row { min-height: 64rpx; border-top: 1rpx solid #f1f3ee; color: #657c6b; font-size: 21rpx; display: flex; align-items: center; gap: 19rpx; }
.guide-index { color: #45a66b; font-size: 19rpx; font-weight: 750; }
.guide-mark { margin-left: auto; color: #a4b5a8; font-size: 25rpx; }
.form-layout { display: flex; flex-direction: column; gap: 20rpx; }
.form-hero { padding: 32rpx 31rpx 29rpx; border-radius: 30rpx; background: linear-gradient(125deg, #eaf5e7 0%, #f3f7e8 70%, #fff3df 100%); }
.form-kicker { display: block; color: #529267; font-size: 19rpx; font-weight: 750; letter-spacing: 2rpx; }
.form-title { display: block; margin-top: 16rpx; color: #1b442e; font-size: 36rpx; font-weight: 800; }
.form-intro { display: block; margin-top: 7rpx; color: #718977; font-size: 21rpx; }
.record-fields { display: flex; flex-wrap: wrap; gap: 13rpx; margin-top: 25rpx; }
.field-pill { display: flex; align-items: center; gap: 8rpx; min-height: 59rpx; padding: 0 16rpx; border: 1rpx solid rgba(51, 122, 71, 0.1); border-radius: 17rpx; color: #3b6c4b; background: rgba(255, 255, 255, 0.83); font-size: 21rpx; font-weight: 600; }
.pill-arrow { margin-left: 8rpx; color: #8ca997; font-size: 25rpx; }
.form-section { padding: 27rpx 28rpx 31rpx; border: 1rpx solid #edf0e9; border-radius: 30rpx; background: #fff; box-shadow: 0 8rpx 27rpx rgba(34, 66, 45, 0.035); }
.section-heading, .section-heading-main { display: flex; align-items: center; }
.section-heading { justify-content: space-between; gap: 12rpx; }
.section-heading-main { gap: 13rpx; }
.section-index { width: 39rpx; height: 39rpx; border-radius: 13rpx; color: #3e9861; background: #e9f5e9; font-size: 18rpx; font-weight: 750; display: flex; align-items: center; justify-content: center; }
.section-title { color: #244532; font-size: 27rpx; font-weight: 750; }
.section-hint { color: #9aac9d; font-size: 18rpx; }
.form-field { margin-top: 27rpx; }
.field-label { display: block; margin-bottom: 13rpx; color: #365742; font-size: 22rpx; font-weight: 650; }
.field-label.required::after { margin-left: 5rpx; color: #e07c70; content: '*'; }
.optional { margin-left: 5rpx; color: #a4b3a7; font-size: 19rpx; font-weight: 400; }
.label-emoji { margin-left: 5rpx; color: #9cbca1; }
.form-input, .form-textarea { box-sizing: border-box; width: 100%; border: 1rpx solid #e3ebe4; border-radius: 18rpx; background: #f8faf6; color: #244532; font-size: 24rpx; }
.form-input { height: 78rpx; padding: 0 21rpx; }
.form-textarea { min-height: 123rpx; padding: 18rpx 21rpx; line-height: 1.55; }
.image-upload { display: flex; align-items: center; gap: 18rpx; min-height: 105rpx; padding: 11rpx 18rpx; border: 1rpx dashed #b7d7bd; border-radius: 20rpx; background: #f4faf4; }
.upload-icon { width: 65rpx; height: 65rpx; flex: none; border-radius: 18rpx; background: #e5f3e8; color: #3e9c64; font-size: 42rpx; font-weight: 300; display: flex; align-items: center; justify-content: center; }
.image-upload image { width: 68rpx; height: 68rpx; flex: none; border-radius: 16rpx; }
.upload-title, .upload-note { display: block; }
.upload-title { color: #315b3e; font-size: 22rpx; font-weight: 650; }
.upload-note { margin-top: 5rpx; color: #8aa38e; font-size: 18rpx; }
.upload-arrow { margin-left: auto; color: #95af99; font-size: 39rpx; }
.tag-picker { display: flex; flex-wrap: wrap; gap: 11rpx; }
.selectable-tag { padding: 11rpx 18rpx; border: 1rpx solid #e2e9e2; border-radius: 999rpx; color: #657c69; background: #f8faf7; font-size: 20rpx; line-height: 1.25; }
.selectable-tag.positive.selected { border-color: #6fbd8b; color: #227746; background: #e5f5e7; font-weight: 650; }
.selectable-tag.negative.selected { border-color: #e4b47d; color: #9a611d; background: #fff2e3; font-weight: 650; }
.price-input-wrap { height: 76rpx; padding: 0 21rpx; border: 1rpx solid #e3ebe4; border-radius: 18rpx; color: #319059; background: #f8faf6; font-size: 27rpx; display: flex; align-items: center; gap: 12rpx; }
.price-input { flex: 1; height: 100%; color: #244532; font-size: 24rpx; }
.rating-block { display: flex; align-items: center; justify-content: space-between; gap: 8rpx; margin-top: 29rpx; padding-top: 26rpx; border-top: 1rpx solid #eef2ec; }
.rating-block .field-label { margin-bottom: 4rpx; }
.rating-note { color: #a2b0a3; font-size: 18rpx; }
.rating-stars { display: flex; align-items: center; }
.star { padding-left: 3rpx; color: #dce4db; font-size: 34rpx; line-height: 1; }
.star.active { color: #efb445; }
.saved-message { margin-top: 26rpx; padding: 16rpx; border-radius: 15rpx; color: #2b8b50; background: #e9f6e9; font-size: 21rpx; text-align: center; }
.action-bar { box-sizing: border-box; position: fixed; z-index: 2; right: 0; bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom)); left: 0; height: calc(var(--action-height) + env(safe-area-inset-bottom)); padding: 15rpx 22rpx calc(16rpx + env(safe-area-inset-bottom)); background: rgba(255, 255, 255, 0.98); border-top: 1rpx solid #e9eee7; }
.record-button { width: 100%; height: 94rpx; border: 0; border-radius: 21rpx; color: #fff; background: #269b58; box-shadow: 0 8rpx 21rpx rgba(38, 155, 88, 0.19); font-size: 26rpx; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 13rpx; }
.record-button[disabled] { color: #93aa9a; background: #e5eee6; box-shadow: none; }
.record-button::after { border: 0; }
.action-icon { font-size: 29rpx; }
.action-arrow { margin-left: 4rpx; font-size: 29rpx; }

/* SmartDiet editorial theme shared with the concept preview. */
.record-page { background: #faf8f1; color: var(--sd-forest); }
.record-header { background: rgba(250, 248, 241, 0.98); border-bottom-color: #f0eee4; }
.header-title { color: var(--sd-forest); }
.score-pill { background: #fffdf8; border-color: #efeadf; box-shadow: 0 5rpx 16rpx rgba(61, 73, 45, 0.05); }
.score-value { color: var(--sd-green); }
.record-content { padding: 23rpx 25rpx 45rpx; }
.empty-hero { padding: 34rpx 32rpx 28rpx; background: radial-gradient(circle at 65% 38%, #fffdf5 0%, #f6f5e8 48%, #e9f0dc 100%); border-color: #e8ecd9; box-shadow: var(--sd-card-shadow); }
.empty-hero::before { top: -96rpx; right: -90rpx; width: 300rpx; height: 300rpx; border-color: rgba(75, 119, 59, 0.12); }
.empty-hero::after { content: ''; position: absolute; bottom: 90rpx; left: -75rpx; width: 260rpx; height: 260rpx; border-radius: 50%; background: rgba(173, 202, 151, 0.15); }
.hero-kicker { color: #548761; font-size: 20rpx; }
.hero-title { margin-top: 15rpx; color: #153d2b; font-size: 48rpx; line-height: 1.17; }
.hero-title + .hero-title { margin-top: 0; }
.hero-copy { margin-top: 11rpx; color: #71836d; }
.hero-illustration { height: 370rpx; margin-top: -5rpx; }
.illustration-halo { position: absolute; top: 32rpx; left: 50%; width: 340rpx; height: 300rpx; transform: translateX(-50%); border-radius: 50%; background: rgba(255, 255, 255, 0.63); filter: blur(10rpx); }
.bowl-illustration { position: relative; z-index: 1; display: block; width: 100%; height: 100%; filter: drop-shadow(0 18rpx 15rpx rgba(82, 87, 47, 0.15)); }
.today-summary { padding: 13rpx 23rpx; border-radius: 22rpx; background: rgba(255, 255, 254, 0.9); box-shadow: 0 8rpx 18rpx rgba(82, 89, 59, 0.06); }
.summary-number { color: #508a43; font-size: 43rpx; }
.summary-unit { color: #4d774d; font-size: 23rpx; font-weight: 650; }
.summary-label { color: #6a816d; font-size: 22rpx; }
.guide-card { margin-top: 20rpx; padding: 26rpx 26rpx 28rpx; border-color: #eeece2; background: #fffdfa; box-shadow: var(--sd-card-shadow); }
.guide-title { color: #244733; }
.guide-steps { display: flex; align-items: flex-start; justify-content: space-between; margin-top: 23rpx; }
.guide-step { min-width: 115rpx; display: flex; flex-direction: column; align-items: center; text-align: center; }
.step-icon { width: 69rpx; height: 69rpx; border-radius: 50%; background: #e8f1e5; color: #3f7952; font-size: 38rpx; display: flex; align-items: center; justify-content: center; }
.step-number { margin-top: 7rpx; color: #4b8750; font-size: 18rpx; font-weight: 700; }
.step-label { margin-top: 4rpx; color: #718073; font-size: 19rpx; }
.step-connector { flex: 1; height: 2rpx; margin-top: 34rpx; background: #d4dfd1; }
.form-hero { position: relative; overflow: hidden; background: radial-gradient(circle at 90% 10%, #fffdf7 0%, #f6f4e8 55%, #e9f0e0 100%); border: 1rpx solid #e9ecd9; }
.form-heading-row { position: relative; z-index: 2; display: flex; align-items: center; gap: 12rpx; }
.form-back { width: 34rpx; height: 34rpx; border-radius: 50%; border: 1rpx solid #d6e4d2; background: #fffdf8; color: #3c7850; font-size: 31rpx; line-height: 30rpx; text-align: center; }
.form-kicker { color: #5e9166; }
.form-title { position: relative; z-index: 1; color: var(--sd-forest); font-size: 37rpx; max-width: 74%; }
.form-intro { position: relative; z-index: 1; max-width: 75%; }
.form-art { position: absolute; top: 6rpx; right: 4rpx; width: 175rpx; height: 170rpx; opacity: 0.97; }
.record-fields { position: relative; z-index: 1; }
.form-section { border-color: #eeece2; background: #fffefa; box-shadow: var(--sd-card-shadow); }
.section-index { color: #467c4c; background: #e8f1e5; }
.section-title { color: #214330; }
.form-input, .form-textarea, .price-input-wrap { border-color: #e5e9df; background: #fafbf6; }
.image-upload { background: #f6f8ef; border-color: #bdcfb4; }
.upload-icon { background: #e5efe0; color: #4b8752; }
.selectable-tag { background: #fafaf6; border-color: #e7ebe2; }
.selectable-tag.positive.selected { background: #e7f2e1; border-color: #9fc39d; }
.selectable-tag.negative.selected { background: #fcf0e4; border-color: #e4c8a9; }
.star.active { color: #e7ad4c; }
.action-bar { background: rgba(255, 254, 251, 0.98); border-top-color: #f0eee5; }
.record-button { border-radius: 999rpx; background: linear-gradient(120deg, #438d58, #276e45); box-shadow: 0 12rpx 24rpx rgba(45, 111, 68, 0.2); }
.record-button { position: relative; }
.action-arrow { position: absolute; right: 28rpx; margin-left: 0; }
.photo-label-row { display: flex; align-items: center; justify-content: space-between; }
.photo-count { color: #7c927e; font-size: 20rpx; }
.photo-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 13rpx; }
.photo-tile, .photo-add { position: relative; height: 166rpx; border-radius: 20rpx; overflow: hidden; }
.photo-tile image { width: 100%; height: 100%; }
.photo-remove { position: absolute; top: 7rpx; right: 7rpx; width: 35rpx; height: 35rpx; border-radius: 50%; color: #fff; background: rgba(31, 50, 37, 0.74); font-size: 29rpx; line-height: 33rpx; text-align: center; }
.photo-add { border: 2rpx dashed #b9cfb2; background: #f6f9ef; color: #68866a; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5rpx; font-size: 19rpx; }
.photo-add-icon { color: #4b8752; font-size: 49rpx; line-height: 1; font-weight: 300; }
.photo-help { display: block; margin-top: 11rpx; color: #9ba99b; font-size: 18rpx; }
</style>
