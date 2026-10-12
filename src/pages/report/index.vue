<script setup lang="ts">
import type { FoodRecord, MealType } from '@/api/types/smartdiet'
import { absoluteAssetUrl, deleteRecord, getRecordHistory, updateRecord } from '@/api/smartdiet'
import { useTokenStore } from '@/store'
import { formatDate, mealOptions, startOfWeek } from '@/utils/smartdiet'

definePage({
  style: {
    navigationBarTitleText: '饮食报告',
    navigationBarBackgroundColor: '#f6fbf7',
    enablePullDownRefresh: true,
  },
})

interface WeekDay {
  date: string
  dayName: string
  dayNum: number
  isToday: boolean
}

const tokenStore = useTokenStore()
const focusDate = ref(new Date())
const loading = ref(false)
const records = ref<FoodRecord[]>([])
const detailRecords = ref<FoodRecord[]>([])
const detailIndex = ref(0)
const editing = ref(false)
const editRecord = ref<FoodRecord | null>(null)
const saving = ref(false)
const mealLabels = mealOptions.map(item => item.label)

const weekDays = computed<WeekDay[]>(() => {
  const start = startOfWeek(focusDate.value)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return {
      date: formatDate(date),
      dayName: `周${['日', '一', '二', '三', '四', '五', '六'][date.getDay()]}`,
      dayNum: date.getDate(),
      isToday: formatDate(date) === formatDate(new Date()),
    }
  })
})

const weekRange = computed(() => `${weekDays.value[0]?.date.slice(5)} ~ ${weekDays.value[6]?.date.slice(5)}`)

const calendar = computed(() => {
  const data: Record<string, Record<MealType, FoodRecord[]>> = {}
  for (const day of weekDays.value)
    data[day.date] = { breakfast: [], lunch: [], dinner: [], other: [] }
  for (const record of records.value) {
    if (data[record.date])
      data[record.date][record.mealType || 'other'].push(record)
  }
  return data
})

const dailyScores = computed(() => weekDays.value.map((day) => {
  const items = records.value.filter(record => record.date === day.date)
  return {
    ...day,
    score: items.length ? Math.round(items.reduce((sum, item) => sum + (item.rating || 0), 0) / items.length * 10) / 10 : 0,
  }
}))

const averageScore = computed(() => {
  const scored = dailyScores.value.filter(item => item.score > 0)
  return scored.length ? Math.round(scored.reduce((sum, item) => sum + item.score, 0) / scored.length * 10) / 10 : 0
})

const detail = computed(() => detailRecords.value[detailIndex.value] || null)

async function loadWeek() {
  if (!tokenStore.updateNowTime().hasLogin) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  loading.value = true
  try {
    records.value = await getRecordHistory(weekDays.value[0].date, weekDays.value[6].date)
  }
  catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '加载报告失败', icon: 'none' })
  }
  finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

onShow(loadWeek)
onPullDownRefresh(loadWeek)

function shiftWeek(offset: number) {
  const next = new Date(focusDate.value)
  next.setDate(next.getDate() + offset * 7)
  focusDate.value = next
  loadWeek()
}

function changeDate(event: { detail: { value: string } }) {
  focusDate.value = new Date(`${event.detail.value}T12:00:00`)
  loadWeek()
}

function cellRecords(date: string, mealType: MealType) {
  return calendar.value[date]?.[mealType] || []
}

function openCell(date: string, mealType: MealType) {
  const items = cellRecords(date, mealType)
  if (!items.length) {
    uni.showModal({
      title: '添加饮食记录',
      content: `要为 ${date} 的${mealOptions.find(item => item.value === mealType)?.label}填写饮食记录吗？`,
      success(res) {
        if (res.confirm) {
          uni.setStorageSync('pendingRecord', { date, mealType })
          uni.switchTab({ url: '/pages/chat/index' })
        }
      },
    })
    return
  }
  detailRecords.value = items
  detailIndex.value = 0
  editing.value = false
  editRecord.value = null
}

function closeDetail() {
  detailRecords.value = []
  editing.value = false
  editRecord.value = null
}

function startEdit() {
  if (!detail.value)
    return
  editRecord.value = JSON.parse(JSON.stringify(detail.value))
  editing.value = true
}

function onEditMealChange(event: { detail: { value: string } }) {
  if (editRecord.value)
    editRecord.value.mealType = mealOptions[Number(event.detail.value)]?.value || 'other'
}

async function saveEdit() {
  if (!editRecord.value)
    return
  saving.value = true
  try {
    const updated = await updateRecord(editRecord.value.id, {
      mealType: editRecord.value.mealType,
      name: editRecord.value.name,
      description: editRecord.value.description,
      positiveTags: editRecord.value.positiveTags,
      negativeTags: editRecord.value.negativeTags,
      price: editRecord.value.price,
      rating: editRecord.value.rating,
    })
    const recordIndex = records.value.findIndex(item => item.id === updated.id)
    if (recordIndex >= 0)
      records.value[recordIndex] = updated
    detailRecords.value[detailIndex.value] = updated
    editing.value = false
    editRecord.value = null
    uni.showToast({ title: '修改已保存', icon: 'success' })
  }
  catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' })
  }
  finally {
    saving.value = false
  }
}

function removeCurrent() {
  if (!detail.value)
    return
  uni.showModal({
    title: '删除这条记录？',
    content: '删除后无法恢复。',
    confirmColor: '#d14a43',
    async success(res) {
      if (!res.confirm || !detail.value)
        return
      try {
        await deleteRecord(detail.value.id)
        records.value = records.value.filter(item => item.id !== detail.value?.id)
        detailRecords.value.splice(detailIndex.value, 1)
        if (detailIndex.value >= detailRecords.value.length)
          detailIndex.value = Math.max(0, detailRecords.value.length - 1)
        if (!detailRecords.value.length)
          closeDetail()
        uni.showToast({ title: '已删除', icon: 'success' })
      }
      catch (error) {
        uni.showToast({ title: error instanceof Error ? error.message : '删除失败', icon: 'none' })
      }
    },
  })
}
</script>

<template>
  <view class="report-page">
    <view class="week-nav">
      <view class="nav-button" @click="shiftWeek(-1)">
        ‹
      </view>
      <picker mode="date" :value="formatDate(focusDate)" @change="changeDate">
        <view class="week-picker">
          <text class="week-title">本周饮食</text><text class="week-range">{{ weekRange }}⌄</text>
        </view>
      </picker>
      <view class="nav-button" @click="shiftWeek(1)">
        ›
      </view>
    </view>

    <view class="summary-row">
      <view class="summary-main">
        <text class="summary-eyebrow">本周平均星级</text><view><text class="summary-score">{{ averageScore || '--' }}</text><text class="summary-unit">/ 5</text></view>
      </view>
      <view class="summary-stat">
        <text class="stat-value">{{ records.length }}</text><text class="stat-label">已记录餐次</text>
      </view>
      <view class="summary-stat">
        <text class="stat-value">{{ records.filter(item => item.rating).length }}</text><text class="stat-label">已评分餐次</text>
      </view>
    </view>

    <view class="section-card calendar-card">
      <view class="section-heading">
        <text>一周记录</text><text class="section-hint">点击格子查看或添加</text>
      </view>
      <scroll-view scroll-x class="calendar-scroll" :show-scrollbar="false">
        <view class="calendar-grid">
          <view class="grid-header meal-header">
            餐次
          </view>
          <view v-for="day in weekDays" :key="day.date" class="grid-header day-header" :class="{ today: day.isToday }">
            <text>{{ day.dayName }}</text><text class="day-number">{{ day.dayNum }}</text>
          </view>
          <template v-for="meal in mealOptions" :key="meal.value">
            <view class="meal-cell">
              <text class="meal-icon">{{ meal.icon }}</text><text>{{ meal.label }}</text>
            </view>
            <view v-for="day in weekDays" :key="`${meal.value}-${day.date}`" class="record-cell" :class="{ today: day.isToday }" @click="openCell(day.date, meal.value)">
              <template v-if="cellRecords(day.date, meal.value).length">
                <image v-if="cellRecords(day.date, meal.value)[0].imageUrl" class="cell-image" :src="absoluteAssetUrl(cellRecords(day.date, meal.value)[0].imageUrl)" mode="aspectFill" />
                <text class="cell-score">{{ cellRecords(day.date, meal.value)[0].rating || '-' }}★</text>
                <text class="cell-food">{{ cellRecords(day.date, meal.value)[0].name || '已记录' }}</text>
                <text v-if="cellRecords(day.date, meal.value).length > 1" class="record-count">+{{ cellRecords(day.date, meal.value).length - 1 }}</text>
              </template>
              <text v-else class="add-mark">＋</text>
            </view>
          </template>
        </view>
      </scroll-view>
      <view v-if="loading" class="loading-mask">
        <view class="spinner" /><text>加载中</text>
      </view>
    </view>

    <view class="section-card trend-card">
      <view class="section-heading">
        <text>评分趋势</text><text class="section-hint">每日平均星级评分</text>
      </view>
      <view class="trend-chart">
        <view v-for="item in dailyScores" :key="item.date" class="trend-column">
          <text class="trend-score">{{ item.score || '' }}</text>
          <view class="bar-track">
            <view class="bar-value" :class="{ empty: !item.score }" :style="{ height: `${Math.max(item.score * 20, 5)}%` }" />
          </view>
          <text :class="{ todayText: item.isToday }">{{ item.dayName.slice(1) }}</text>
        </view>
      </view>
    </view>

    <view v-if="detail" class="modal-overlay" @click="closeDetail">
      <view class="detail-sheet" @click.stop>
        <view class="sheet-handle" />
        <view class="sheet-header">
          <view><text class="sheet-title">{{ detail.date }} · {{ mealOptions.find(item => item.value === detail?.mealType)?.label }}</text><text v-if="detailRecords.length > 1" class="sheet-subtitle">第 {{ detailIndex + 1 }} / {{ detailRecords.length }} 条</text></view><view class="close-button" @click="closeDetail">
            ×
          </view>
        </view>

        <template v-if="!editing">
          <image v-if="detail.imageUrl" class="detail-image" :src="absoluteAssetUrl(detail.imageUrl)" mode="aspectFill" />
          <view class="detail-score-row">
            <view><text class="detail-score">{{ detail.rating || '--' }}</text><text class="detail-score-unit">星</text></view><text class="rating">{{ detail.rating ? '★'.repeat(detail.rating) : '未评分' }}</text>
          </view>
          <text class="detail-summary">{{ detail.name }}</text>
          <text v-if="detail.description" class="detail-summary">{{ detail.description }}</text>
          <text v-if="detail.price !== null" class="detail-price">消费 ¥{{ detail.price }}</text>
          <view v-if="detail.positiveTags.length" class="tag-section">
            <text class="tag-label">喜欢</text><view class="tag-row"><text v-for="tag in detail.positiveTags" :key="`positive-${tag}`" class="tag positive">{{ tag }}</text></view>
          </view>
          <view v-if="detail.negativeTags.length" class="tag-section">
            <text class="tag-label">不喜欢</text><view class="tag-row"><text v-for="tag in detail.negativeTags" :key="`negative-${tag}`" class="tag warning">{{ tag }}</text></view>
          </view>
          <view v-if="detailRecords.length > 1" class="record-nav">
            <button :disabled="detailIndex === 0" @click="detailIndex--">
              上一条
            </button><button :disabled="detailIndex === detailRecords.length - 1" @click="detailIndex++">
              下一条
            </button>
          </view>
          <view class="sheet-actions">
            <button class="danger-button" @click="removeCurrent">
              删除
            </button><button class="edit-button" @click="startEdit">
              编辑记录
            </button>
          </view>
        </template>

        <template v-else-if="editRecord">
          <picker :range="mealLabels" :value="mealOptions.findIndex(item => item.value === editRecord?.mealType)" @change="onEditMealChange">
            <view class="edit-field">
              <text>餐次</text><text>{{ mealOptions.find(item => item.value === editRecord?.mealType)?.label }} ›</text>
            </view>
          </picker>
          <view class="edit-field vertical">
            <text>饮食名称</text><input v-model="editRecord.name" placeholder="饮食名称">
          </view>
          <view class="edit-field vertical">
            <text>饮食描述</text><textarea v-model="editRecord.description" auto-height :maxlength="1000" />
          </view>
          <view class="edit-field">
            <text>饮食价格</text><input v-model.number="editRecord.price" type="digit" placeholder="未填写">
          </view>
          <view class="edit-field">
            <text>星级评分</text><view><text v-for="star in 5" :key="star" class="star" :class="{ active: star <= (editRecord.rating || 0) }" @click="editRecord.rating = star">★</text></view>
          </view>
          <view class="sheet-actions">
            <button class="danger-button" @click="editing = false">
              取消
            </button><button class="edit-button" :loading="saving" @click="saveEdit">
              保存修改
            </button>
          </view>
        </template>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.report-page {
  --tabbar-height: 100rpx;
  min-height: 100vh;
  box-sizing: border-box;
  padding: 24rpx 24rpx calc(160rpx + env(safe-area-inset-bottom));
  background: #f3f6f3;
  color: #244233;
}
.week-nav {
  height: 96rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.nav-button {
  width: 64rpx;
  height: 64rpx;
  border-radius: 20rpx;
  background: #fff;
  color: #567061;
  font-size: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6rpx 22rpx rgba(27, 67, 42, 0.06);
}
.week-picker {
  text-align: center;
}
.week-title,
.week-range {
  display: block;
}
.week-title {
  color: #173c29;
  font-size: 33rpx;
  font-weight: 750;
}
.week-range {
  margin-top: 5rpx;
  color: #829188;
  font-size: 21rpx;
}
.summary-row {
  padding: 28rpx;
  border-radius: 30rpx;
  color: #fff;
  background: linear-gradient(135deg, #2fac62, #22824d);
  box-shadow: 0 16rpx 38rpx rgba(37, 143, 80, 0.18);
  display: grid;
  grid-template-columns: 1.35fr 1fr 1fr;
  align-items: center;
}
.summary-main {
  border-right: 1rpx solid rgba(255, 255, 255, 0.2);
}
.summary-eyebrow,
.stat-label {
  display: block;
  color: rgba(255, 255, 255, 0.72);
  font-size: 19rpx;
}
.summary-score {
  font-size: 54rpx;
  font-weight: 780;
}
.summary-unit {
  font-size: 20rpx;
  opacity: 0.7;
}
.summary-stat {
  text-align: center;
}
.stat-value {
  display: block;
  font-size: 36rpx;
  font-weight: 730;
}
.section-card {
  position: relative;
  margin-top: 24rpx;
  border-radius: 30rpx;
  background: #fff;
  box-shadow: 0 9rpx 34rpx rgba(31, 67, 45, 0.06);
  overflow: hidden;
}
.section-heading {
  padding: 25rpx 28rpx 18rpx;
  font-size: 28rpx;
  font-weight: 680;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-hint {
  color: #99a59d;
  font-size: 19rpx;
  font-weight: 400;
}
.calendar-scroll {
  width: 100%;
}
.calendar-grid {
  width: 1140rpx;
  padding: 0 20rpx 24rpx;
  display: grid;
  grid-template-columns: 94rpx repeat(7, 1fr);
}
.grid-header {
  height: 78rpx;
  color: #819086;
  background: #f7f9f7;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 20rpx;
}
.grid-header.today {
  color: #218f50;
  background: #eaf8ef;
}
.meal-header {
  border-radius: 16rpx 0 0;
}
.day-number {
  margin-top: 5rpx;
  font-size: 24rpx;
  font-weight: 650;
}
.meal-cell {
  height: 130rpx;
  border-right: 1rpx solid #edf1ee;
  border-bottom: 1rpx solid #edf1ee;
  color: #63766b;
  background: #fbfcfb;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 19rpx;
}
.meal-icon {
  font-size: 28rpx;
  margin-bottom: 5rpx;
}
.record-cell {
  height: 130rpx;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
  border-right: 1rpx solid #edf1ee;
  border-bottom: 1rpx solid #edf1ee;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.record-cell.today {
  background: #fbfffc;
}
.cell-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.28;
}
.cell-score,
.cell-food {
  position: relative;
  z-index: 1;
}
.cell-score {
  color: #207d49;
  font-size: 28rpx;
  font-weight: 780;
}
.cell-food {
  width: 100rpx;
  margin-top: 6rpx;
  color: #4a5f53;
  font-size: 18rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}
.record-count {
  position: absolute;
  top: 5rpx;
  right: 5rpx;
  padding: 2rpx 7rpx;
  border-radius: 10rpx;
  color: #fff;
  background: #2ca45e;
  font-size: 16rpx;
}
.add-mark {
  color: #c5d0c9;
  font-size: 36rpx;
}
.loading-mask {
  position: absolute;
  inset: 70rpx 0 0;
  background: rgba(255, 255, 255, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  color: #708077;
  font-size: 22rpx;
}
.spinner {
  width: 26rpx;
  height: 26rpx;
  border: 4rpx solid #dbe8de;
  border-top-color: #2ca45e;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.trend-chart {
  height: 250rpx;
  padding: 10rpx 26rpx 28rpx;
  display: flex;
  align-items: flex-end;
  gap: 16rpx;
}
.trend-column {
  height: 100%;
  flex: 1;
  color: #89968e;
  font-size: 18rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
}
.trend-score {
  height: 28rpx;
  color: #4e6658;
  font-size: 18rpx;
}
.bar-track {
  width: 32rpx;
  height: 150rpx;
  border-radius: 12rpx;
  background: #edf2ee;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}
.bar-value {
  width: 100%;
  min-height: 8rpx;
  border-radius: 12rpx;
  background: linear-gradient(180deg, #5bc47f, #2c9b5a);
}
.bar-value.empty {
  background: #dfe7e1;
}
.todayText {
  color: #269b58;
  font-weight: 700;
}
.modal-overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom));
  left: 0;
  z-index: 100;
  background: rgba(13, 35, 23, 0.48);
  display: flex;
  align-items: flex-end;
}
.detail-sheet {
  width: 100%;
  max-height: 100%;
  box-sizing: border-box;
  padding: 14rpx 28rpx calc(28rpx + env(safe-area-inset-bottom));
  overflow-y: auto;
  border-radius: 34rpx 34rpx 0 0;
  background: #fff;
}
.sheet-handle {
  width: 72rpx;
  height: 8rpx;
  margin: 0 auto 20rpx;
  border-radius: 8rpx;
  background: #dfe6e1;
}
.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sheet-title,
.sheet-subtitle {
  display: block;
}
.sheet-title {
  color: #214430;
  font-size: 31rpx;
  font-weight: 730;
}
.sheet-subtitle {
  color: #91a097;
  font-size: 20rpx;
  margin-top: 4rpx;
}
.close-button {
  width: 58rpx;
  height: 58rpx;
  border-radius: 20rpx;
  color: #74847a;
  background: #f1f4f2;
  font-size: 38rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.detail-image {
  width: 100%;
  height: 300rpx;
  margin-top: 22rpx;
  border-radius: 26rpx;
}
.detail-score-row {
  margin-top: 22rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.detail-score {
  color: #258f51;
  font-size: 52rpx;
  font-weight: 780;
}
.detail-score-unit {
  color: #839087;
  font-size: 21rpx;
  margin-left: 8rpx;
}
.rating {
  color: #eaaa29;
  letter-spacing: 3rpx;
}
.detail-summary {
  display: block;
  margin-top: 10rpx;
  color: #566b5f;
  font-size: 24rpx;
  line-height: 1.55;
}
.detail-price {
  display: block;
  margin-top: 14rpx;
  color: #22884c;
  font-size: 25rpx;
  font-weight: 700;
}
.tag-section {
  margin-top: 16rpx;
}
.tag-label {
  display: block;
  color: #839087;
  font-size: 20rpx;
}
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 8rpx;
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
.detail-food-list {
  margin-top: 20rpx;
  border-top: 1rpx solid #edf1ee;
}
.detail-food {
  padding: 20rpx 0;
  border-bottom: 1rpx solid #edf1ee;
  display: flex;
  justify-content: space-between;
}
.detail-food-name,
.detail-food-advice {
  display: block;
}
.detail-food-name {
  color: #294b39;
  font-size: 27rpx;
  font-weight: 650;
}
.detail-food-advice {
  max-width: 440rpx;
  margin-top: 5rpx;
  color: #87958d;
  font-size: 20rpx;
}
.detail-food-meta {
  color: #607469;
  font-size: 21rpx;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6rpx;
}
.record-nav,
.sheet-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 22rpx;
}
.record-nav button,
.sheet-actions button {
  flex: 1;
  height: 76rpx;
  border: 0;
  border-radius: 21rpx;
  font-size: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.record-nav button::after,
.sheet-actions button::after {
  border: 0;
}
.record-nav button {
  color: #587064;
  background: #f0f4f1;
}
.danger-button {
  color: #bc4d48;
  background: #fff0ef;
}
.edit-button {
  color: #fff;
  background: #2ca45e;
}
.edit-field {
  min-height: 82rpx;
  margin-top: 20rpx;
  padding: 0 22rpx;
  border-radius: 20rpx;
  background: #f4f7f5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #3d5849;
  font-size: 24rpx;
}
.edit-field.vertical {
  padding: 20rpx 22rpx;
  flex-direction: column;
  align-items: stretch;
  gap: 14rpx;
}
.edit-field textarea {
  width: 100%;
  color: #5e7166;
  font-size: 23rpx;
}
.edit-food {
  margin-top: 16rpx;
  padding: 18rpx 22rpx;
  border: 1rpx solid #e3eae5;
  border-radius: 20rpx;
}
.edit-food > input {
  font-size: 27rpx;
  font-weight: 650;
}
.edit-food > view {
  margin-top: 14rpx;
  display: flex;
  align-items: center;
  gap: 8rpx;
  color: #75847b;
  font-size: 22rpx;
}
.edit-food > view input {
  width: 90rpx;
  padding: 8rpx;
  border-radius: 12rpx;
  background: #f2f5f3;
  text-align: right;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
