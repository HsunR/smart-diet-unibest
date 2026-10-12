<script setup lang="ts">
import type { FoodItem, MealOverview, MealType } from '@/api/types/smartdiet'
import {
  createRecord,
  getRecords,
  uploadFoodImage,
} from '@/api/smartdiet'
import { useChatStore, useTokenStore } from '@/store'
import { chooseImage, formatDate, getCurrentMealType, mealOptions } from '@/utils/smartdiet'

definePage({
  type: 'home',
  style: {
    navigationStyle: 'custom',
    enablePullDownRefresh: false,
  },
})

const chatStore = useChatStore()
const tokenStore = useTokenStore()
const dailyScore = ref(0)
const scrollAnchor = ref('')
const mealLabels = mealOptions.map(item => item.label)
const positiveTagOptions = ['好吃', '新鲜', '营养均衡', '高蛋白', '蔬菜丰富', '饱腹感强']
const negativeTagOptions = ['太油', '太咸', '太甜', '不新鲜', '分量不足', '价格偏高']

const draft = computed(() => chatStore.draft)

function scrollToBottom() {
  nextTick(() => {
    scrollAnchor.value = ''
    setTimeout(() => {
      scrollAnchor.value = 'chat-bottom'
    }, 10)
  })
}

function ensureLogin() {
  if (!tokenStore.updateNowTime().hasLogin) {
    uni.reLaunch({ url: '/pages/login/index' })
    return false
  }
  return true
}

async function refreshDailyScore() {
  if (!tokenStore.updateNowTime().hasLogin)
    return
  try {
    const records = await getRecords(formatDate(new Date()))
    dailyScore.value = records.length
      ? Math.round(records.reduce((sum, item) => sum + (item.mealOverview?.overallHealthScore || 0), 0) / records.length)
      : 0
  }
  catch {
    dailyScore.value = 0
  }
}

onLoad(() => {
  chatStore.ensureWelcome()
  if (chatStore.draft) {
    const current = chatStore.draft
    current.recognizing = false
    current.name ||= current.foods?.[0]?.name || ''
    current.description ||= ''
    current.positiveTags ||= []
    current.negativeTags ||= []
    current.price ??= null
  }
})

onShow(() => {
  if (!ensureLogin())
    return
  const pending = uni.getStorageSync('pendingRecord') as { date?: string, mealType?: MealType } | undefined
  if (pending && chatStore.draft) {
    chatStore.draft.date = pending.date || chatStore.draft.date
    chatStore.draft.mealType = pending.mealType || chatStore.draft.mealType
  }
  uni.removeStorageSync('pendingRecord')
  refreshDailyScore()
  scrollToBottom()
})

async function takeFoodPhoto(sourceType: Array<'camera' | 'album'>) {
  if (draft.value?.saving)
    return
  try {
    const localImageUrl = await chooseImage(sourceType)
    if (!localImageUrl)
      return
    chatStore.addMessage({ role: 'user', type: 'image', content: '上传了一张餐食照片', imageUrl: localImageUrl })
    const uploaded = await uploadFoodImage(localImageUrl)
    const pending = uni.getStorageSync('pendingRecord') as { date?: string, mealType?: MealType } | undefined
    const emptyOverview: MealOverview = { overallHealthScore: 0, healthTags: { positive: [], warning: [] }, tagReasons: {}, summary: '' }
    chatStore.draft = {
      localImageUrl,
      imageUrl: uploaded.url,
      date: pending?.date || formatDate(new Date()),
      mealType: pending?.mealType || getCurrentMealType(),
      name: '',
      description: '',
      positiveTags: [],
      negativeTags: [],
      price: null,
      rating: 0,
      foods: [],
      mealOverview: emptyOverview,
      dietaryAdvice: '',
      recognizing: false,
      saving: false,
      saved: false,
    }
    uni.removeStorageSync('pendingRecord')
    scrollToBottom()
  }
  catch (error) {
    const message = error instanceof Error ? error.message : '图片处理失败'
    if (!message.includes('cancel'))
      uni.showToast({ title: message, icon: 'none' })
  }
}

function onMealChange(event: { detail: { value: string } }) {
  if (chatStore.draft)
    chatStore.draft.mealType = mealOptions[Number(event.detail.value)]?.value || 'other'
}

function toggleTag(kind: 'positive' | 'negative', tag: string) {
  const current = chatStore.draft
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
  if (!chatStore.draft)
    return
  const value = event.detail.value.trim()
  const price = Number(value)
  chatStore.draft.price = value && Number.isFinite(price) ? price : null
}

async function saveDraft() {
  const current = chatStore.draft
  if (!current || current.saving)
    return
  const name = current.name.trim()
  if (!name) {
    uni.showToast({ title: '请填写饮食名称', icon: 'none' })
    return
  }
  current.saving = true
  try {
    const food: FoodItem = {
      name,
      category: '',
      score: 0,
      weight: 0,
      confidence: 1,
      tags: { positive: current.positiveTags, warning: current.negativeTags },
      tagReasons: {},
      advice: '',
    }
    current.foods = [food]
    current.mealOverview = {
      overallHealthScore: 0,
      healthTags: { positive: current.positiveTags, warning: current.negativeTags },
      tagReasons: {},
      summary: current.description,
    }
    await createRecord({
      date: current.date,
      mealType: current.mealType,
      name,
      description: current.description.trim(),
      positiveTags: current.positiveTags,
      negativeTags: current.negativeTags,
      price: current.price,
      foods: current.foods,
      mealOverview: current.mealOverview,
      imageUrl: current.imageUrl,
      rating: current.rating,
    })
    current.saved = true
    uni.showToast({ title: '记录已保存', icon: 'success' })
    await refreshDailyScore()
  }
  catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' })
  }
  finally {
    current.saving = false
  }
}

async function showTodaySummary() {
  try {
    const records = await getRecords(formatDate(new Date()))
    const score = records.length ? Math.round(records.reduce((sum, item) => sum + item.mealOverview.overallHealthScore, 0) / records.length) : 0
    const names = Array.from(new Set(records.flatMap(item => item.foods.map(food => food.name))))
    chatStore.addMessage({
      role: 'assistant',
      type: 'text',
      content: records.length
        ? `📊 今日饮食摘要\n\n已记录 ${records.length} 餐，平均健康评分 ${score} 分。\n食物：${names.join('、')}\n\n继续保持均衡饮食，多关注蔬菜和优质蛋白。`
        : '今天还没有饮食记录。拍一张餐食照片，开始记录吧！',
    })
    scrollToBottom()
  }
  catch {
    uni.showToast({ title: '获取今日记录失败', icon: 'none' })
  }
}

function preview(url: string) {
  uni.previewImage({ urls: [url], current: url })
}
</script>

<template>
  <view class="chat-page">
    <view class="chat-header pt-safe">
      <view>
        <text class="header-title">饮食记录</text><view class="online-row">
          <text class="online-dot" /><text>上传照片，补全这一餐</text>
        </view>
      </view>
      <view class="score-pill">
        <text class="score-value">{{ dailyScore || '--' }}</text><text class="score-label">今日评分</text>
      </view>
    </view>

    <scroll-view class="message-scroll" scroll-y :scroll-into-view="scrollAnchor" :show-scrollbar="false">
      <view class="message-list">
        <view v-for="message in chatStore.messages" :key="message.id" class="message-row" :class="message.role">
          <view v-if="message.role === 'assistant'" class="avatar">
            🥗
          </view>
          <view v-if="message.type === 'text'" class="bubble" :class="message.role">
            <text class="message-text">{{ message.content }}</text>
            <text v-if="message.streaming" class="typing-cursor">▍</text>
          </view>
          <image v-else class="message-image" :src="message.imageUrl" mode="aspectFill" @click="preview(message.imageUrl || '')" />
        </view>

        <view v-if="draft" class="food-card">
          <view class="food-card-hero">
            <image :src="draft.localImageUrl" mode="aspectFill" class="food-image" @click="preview(draft.localImageUrl)" />
          </view>
          <view class="food-card-body">
            <text class="form-title">记录这餐饮食</text>
            <view class="form-field">
              <text class="field-label required">饮食名称</text>
              <input v-model="draft.name" class="form-input" placeholder="例如：番茄鸡蛋面" :maxlength="120">
            </view>
            <view class="form-field">
              <text class="field-label">饮食描述（可选）</text>
              <textarea v-model="draft.description" class="form-textarea" auto-height placeholder="记录口味、食材或感受" :maxlength="1000" />
            </view>
            <view class="form-field">
              <text class="field-label">我觉得好的地方</text>
              <view class="tag-picker">
                <text v-for="tag in positiveTagOptions" :key="tag" class="selectable-tag positive" :class="{ selected: draft.positiveTags.includes(tag) }" @click="toggleTag('positive', tag)">{{ tag }}</text>
              </view>
            </view>
            <view class="form-field">
              <text class="field-label">我不喜欢的地方</text>
              <view class="tag-picker">
                <text v-for="tag in negativeTagOptions" :key="tag" class="selectable-tag negative" :class="{ selected: draft.negativeTags.includes(tag) }" @click="toggleTag('negative', tag)">{{ tag }}</text>
              </view>
            </view>
            <view class="form-field price-field">
              <text class="field-label">饮食价格（可选）</text>
              <view class="price-input-wrap"><text>¥</text><input :value="draft.price === null ? '' : String(draft.price)" type="digit" class="price-input" placeholder="0.00" @input="onPriceInput" /></view>
            </view>
            <view class="record-fields">
              <picker mode="date" :value="draft.date" @change="draft.date = $event.detail.value">
                <view class="field-pill">
                  📅 {{ draft.date }}
                </view>
              </picker>
              <picker :range="mealLabels" :value="mealOptions.findIndex(item => item.value === draft?.mealType)" @change="onMealChange">
                <view class="field-pill">
                  🍽 {{ mealOptions.find(item => item.value === draft?.mealType)?.label }}
                </view>
              </picker>
            </view>
            <view class="rating-row">
              <text>饮食星级评分</text><view><text v-for="star in 5" :key="star" class="star" :class="{ active: star <= draft.rating }" @click="draft.rating = star">★</text></view>
            </view>
            <button class="save-button" :disabled="draft.saved || !draft.name.trim()" :loading="draft.saving" @click="saveDraft">
              {{ draft.saved ? '✓ 已保存到饮食报告' : '保存饮食记录' }}
            </button>
          </view>
        </view>

        <view id="chat-bottom" class="bottom-anchor" />
      </view>
    </scroll-view>

    <view class="action-bar pb-safe">
      <view class="action-button primary" @click="takeFoodPhoto(['camera'])">
        <text class="action-icon">📷</text><text>拍照记录</text>
      </view>
      <view class="action-button" @click="takeFoodPhoto(['album'])">
        <text class="action-icon">🖼️</text><text>相册识别</text>
      </view>
      <view class="action-button" @click="showTodaySummary">
        <text class="action-icon">📊</text><text>今日记录</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.chat-page {
  height: 100vh;
  background: #f4f7f4;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #254334;
}
.chat-header {
  flex: none;
  padding-left: 30rpx;
  padding-right: 30rpx;
  padding-bottom: 22rpx;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 4rpx 22rpx rgba(23, 67, 42, 0.06);
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  z-index: 2;
}
.header-title {
  display: block;
  font-size: 36rpx;
  font-weight: 750;
  color: #153c27;
}
.online-row {
  margin-top: 7rpx;
  color: #819087;
  font-size: 21rpx;
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.online-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #33b767;
  box-shadow: 0 0 0 5rpx rgba(51, 183, 103, 0.12);
}
.score-pill {
  min-width: 112rpx;
  padding: 10rpx 16rpx;
  border-radius: 22rpx;
  background: #eef9f2;
  text-align: center;
}
.score-value,
.score-label {
  display: block;
}
.score-value {
  color: #218c50;
  font-size: 30rpx;
  font-weight: 750;
}
.score-label {
  color: #6b8877;
  font-size: 18rpx;
}
.message-scroll {
  flex: 1;
  min-height: 0;
}
.message-list {
  padding: 30rpx 26rpx 34rpx;
}
.message-row {
  margin-bottom: 26rpx;
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
}
.message-row.user {
  justify-content: flex-end;
}
.avatar {
  width: 64rpx;
  height: 64rpx;
  flex: none;
  border-radius: 22rpx;
  background: #fff;
  box-shadow: 0 7rpx 20rpx rgba(23, 67, 42, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34rpx;
}
.bubble {
  max-width: 540rpx;
  padding: 23rpx 26rpx;
  border-radius: 10rpx 28rpx 28rpx;
  background: #fff;
  box-shadow: 0 8rpx 28rpx rgba(28, 65, 43, 0.07);
}
.bubble.user {
  color: #fff;
  background: linear-gradient(135deg, #35b86c, #27995a);
  border-radius: 28rpx 10rpx 28rpx 28rpx;
}
.message-text {
  font-size: 27rpx;
  line-height: 1.65;
  white-space: pre-wrap;
}
.typing-cursor {
  color: #2ca862;
  animation: blink 0.8s infinite;
}
.message-image {
  width: 420rpx;
  height: 300rpx;
  border-radius: 30rpx 10rpx 30rpx 30rpx;
  box-shadow: 0 10rpx 30rpx rgba(26, 60, 40, 0.12);
}
.food-card {
  margin: 0 0 30rpx 78rpx;
  overflow: hidden;
  border-radius: 32rpx;
  background: #fff;
  box-shadow: 0 14rpx 44rpx rgba(30, 78, 48, 0.1);
}
.food-card-hero {
  height: 260rpx;
  position: relative;
}
.food-image {
  width: 100%;
  height: 100%;
}
.health-score {
  position: absolute;
  right: 20rpx;
  bottom: 18rpx;
  min-width: 92rpx;
  padding: 12rpx;
  border-radius: 22rpx;
  background: rgba(16, 49, 29, 0.82);
  color: #fff;
  text-align: center;
  font-size: 18rpx;
  backdrop-filter: blur(10px);
}
.health-score-number {
  display: block;
  font-size: 36rpx;
  font-weight: 750;
}
.food-card-body {
  padding: 26rpx;
}
.form-title {
  display: block;
  margin-bottom: 26rpx;
  color: #234734;
  font-size: 30rpx;
  font-weight: 700;
}
.form-field {
  margin-top: 22rpx;
}
.form-field:first-of-type {
  margin-top: 0;
}
.field-label {
  display: block;
  margin-bottom: 12rpx;
  color: #5e7668;
  font-size: 23rpx;
}
.field-label.required::after {
  margin-left: 5rpx;
  color: #d85a52;
  content: '*';
}
.form-input,
.form-textarea {
  box-sizing: border-box;
  width: 100%;
  border: 1rpx solid #dbe6de;
  border-radius: 16rpx;
  background: #f8fbf9;
  color: #294738;
  font-size: 25rpx;
}
.form-input {
  height: 76rpx;
  padding: 0 20rpx;
}
.form-textarea {
  min-height: 112rpx;
  padding: 17rpx 20rpx;
  line-height: 1.5;
}
.tag-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.selectable-tag {
  padding: 10rpx 16rpx;
  border: 1rpx solid #dbe6de;
  border-radius: 999rpx;
  color: #6f8177;
  background: #f8fbf9;
  font-size: 21rpx;
}
.selectable-tag.positive.selected {
  border-color: #7bc899;
  color: #227746;
  background: #e6f7eb;
}
.selectable-tag.negative.selected {
  border-color: #e3b97a;
  color: #a06313;
  background: #fff3df;
}
.price-input-wrap {
  height: 74rpx;
  padding: 0 20rpx;
  border: 1rpx solid #dbe6de;
  border-radius: 16rpx;
  color: #2b9b59;
  background: #f8fbf9;
  font-size: 27rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.price-input {
  flex: 1;
  height: 100%;
  color: #294738;
  font-size: 25rpx;
}
.recognizing {
  height: 120rpx;
  color: #688074;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18rpx;
}
.spinner {
  width: 30rpx;
  height: 30rpx;
  border: 5rpx solid #dceddf;
  border-top-color: #2ba45e;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.overview-summary {
  color: #40584c;
  font-size: 25rpx;
  line-height: 1.55;
}
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 16rpx;
}
.tag {
  padding: 7rpx 15rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
}
.tag.positive {
  color: #237d4b;
  background: #eaf8ef;
}
.tag.warning {
  color: #a26a17;
  background: #fff5dc;
}
.food-list {
  margin-top: 22rpx;
  border-top: 1rpx solid #eef1ee;
}
.food-item {
  padding: 20rpx 0;
  border-bottom: 1rpx solid #eef1ee;
}
.food-name {
  color: #234734;
  font-size: 28rpx;
  font-weight: 650;
}
.food-meta {
  margin-top: 10rpx;
  color: #849289;
  font-size: 22rpx;
  display: flex;
  align-items: center;
}
.weight-input {
  width: 80rpx;
  height: 46rpx;
  border-bottom: 1rpx solid #ccd9d0;
  text-align: right;
}
.food-score {
  margin-left: auto;
  color: #2b9b59;
  font-weight: 650;
}
.food-advice {
  display: block;
  margin-top: 8rpx;
  color: #839188;
  font-size: 21rpx;
}
.dietary-advice {
  display: block;
  margin-top: 20rpx;
  padding: 18rpx;
  border-radius: 18rpx;
  color: #596e62;
  background: #f4f8f5;
  font-size: 22rpx;
  line-height: 1.5;
}
.record-fields {
  display: flex;
  gap: 12rpx;
  margin-top: 22rpx;
}
.field-pill {
  padding: 14rpx 18rpx;
  border-radius: 18rpx;
  color: #4c6658;
  background: #f0f5f1;
  font-size: 21rpx;
}
.rating-row {
  margin-top: 22rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #687a70;
  font-size: 23rpx;
}
.star {
  margin-left: 5rpx;
  color: #dce2de;
  font-size: 35rpx;
}
.star.active {
  color: #f3b634;
}
.save-button {
  margin-top: 24rpx;
  height: 78rpx;
  border: 0;
  border-radius: 22rpx;
  color: #fff;
  background: #2ca45e;
  font-size: 25rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.save-button[disabled] {
  color: #779184;
  background: #e5eee8;
}
.save-button::after {
  border: 0;
}
.bottom-anchor {
  height: 2rpx;
}
.action-bar {
  flex: none;
  padding: 16rpx 22rpx;
  background: #fff;
  border-top: 1rpx solid #e9eeea;
  display: flex;
  gap: 12rpx;
}
.action-button {
  height: 94rpx;
  flex: 1;
  border: 1rpx solid #dbe6de;
  border-radius: 20rpx;
  color: #52705f;
  background: #f8fbf9;
  font-size: 21rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3rpx;
}
.action-button.primary {
  border-color: #2ca45e;
  color: #fff;
  background: #2ca45e;
}
.action-icon {
  font-size: 32rpx;
  line-height: 1;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
</style>
