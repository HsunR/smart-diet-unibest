<script setup lang="ts">
import type { FoodRecord, MealType } from '@/api/types/smartdiet'
import { absoluteAssetUrl, deleteRecord, getRecordHistory, updateRecord, uploadFoodImage } from '@/api/smartdiet'
import DateCalendar from '@/components/DateCalendar.vue'
import SmartDietHeader from '@/components/SmartDietHeader.vue'
import { usePageHeader } from '@/hooks/usePageHeader'
import { useTokenStore } from '@/store'
import { chooseImages, formatDate, mealOptions, parseLocalDate, shortDateLabel, startOfWeek } from '@/utils/smartdiet'

definePage({
  style: {
    navigationStyle: 'custom',
    navigationBarTitleText: '饮食报告',
    navigationBarBackgroundColor: '#faf8f1',
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
const { pageHeaderStyle } = usePageHeader()
const focusDate = ref(new Date())
const showWeekCalendar = ref(false)
const expanded = ref(false)
const loading = ref(false)
const records = ref<FoodRecord[]>([])
const detailRecords = ref<FoodRecord[]>([])
const detailIndex = ref(0)
const detailPhotoIndex = ref(0)
const editing = ref(false)
const editRecord = ref<FoodRecord | null>(null)
const saving = ref(false)
const uploadingPhotos = ref(false)
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

const weekRange = computed(() => `${weekDays.value[0]?.date.slice(5).replace('-', '.')} — ${weekDays.value[6]?.date.slice(5).replace('-', '.')}`)
const weekTitle = computed(() => {
  const selectedStart = formatDate(startOfWeek(focusDate.value))
  const thisWeekStart = startOfWeek(new Date())
  if (selectedStart === formatDate(thisWeekStart))
    return '本周饮食'
  const lastWeekStart = new Date(thisWeekStart)
  lastWeekStart.setDate(lastWeekStart.getDate() - 7)
  if (selectedStart === formatDate(lastWeekStart))
    return '上周饮食'
  const earlierWeekStart = new Date(thisWeekStart)
  earlierWeekStart.setDate(earlierWeekStart.getDate() - 14)
  if (selectedStart === formatDate(earlierWeekStart))
    return '上上周饮食'
  const nextWeekStart = new Date(thisWeekStart)
  nextWeekStart.setDate(nextWeekStart.getDate() + 7)
  return selectedStart === formatDate(nextWeekStart) ? '下周饮食' : '选择的周'
})

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
  const items = records.value.filter(record => record.date === day.date && record.rating > 0)
  return {
    ...day,
    score: items.length ? Math.round(items.reduce((sum, item) => sum + (item.rating || 0), 0) / items.length * 10) / 10 : 0,
  }
}))

const averageScore = computed(() => {
  const scored = records.value.filter(item => item.rating > 0)
  return scored.length ? Math.round(scored.reduce((sum, item) => sum + item.rating, 0) / scored.length * 10) / 10 : 0
})

const detail = computed(() => detailRecords.value[detailIndex.value] || null)

function photos(record: FoodRecord) {
  return record.imageUrls?.length ? record.imageUrls : (record.imageUrl ? [record.imageUrl] : [])
}

function previewPhoto(url: string, urls: string[]) {
  uni.previewImage({ urls: urls.map(absoluteAssetUrl), current: absoluteAssetUrl(url) })
}

async function addEditPhotos() {
  const current = editRecord.value
  if (!current || uploadingPhotos.value || saving.value)
    return
  current.imageUrls = photos(current)
  if (current.imageUrls.length >= 6)
    return
  try {
    const paths = await chooseImages(6 - current.imageUrls.length)
    uploadingPhotos.value = true
    const results = await Promise.allSettled(paths.map(path => uploadFoodImage(path)))
    for (const result of results) {
      if (result.status === 'fulfilled')
        current.imageUrls.push(result.value.url)
    }
    if (results.some(result => result.status === 'rejected'))
      uni.showToast({ title: '部分照片上传失败，请重试', icon: 'none' })
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

function removeEditPhoto(index: number) {
  if (editRecord.value && !uploadingPhotos.value && !saving.value) {
    editRecord.value.imageUrls.splice(index, 1)
    editRecord.value.imageUrl = editRecord.value.imageUrls[0] || ''
  }
}

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

function selectWeekDate(value: string) {
  focusDate.value = parseLocalDate(value)
  showWeekCalendar.value = false
  loadWeek()
}

/** 切换横向全屏视图，沿用当前周和记录数据。 */
function toggleExpanded() {
  expanded.value = !expanded.value
}

function cellRecords(date: string, mealType: MealType) {
  return calendar.value[date]?.[mealType] || []
}

function loopedCellRecords(date: string, mealType: MealType) {
  const items = cellRecords(date, mealType)
  return [...items, ...items]
}

/** 空格子直接打开指定日期和餐次的新增表单；已有记录则展示详情。 */
function openCell(date: string, mealType: MealType, recordIndex = 0) {
  if (loading.value)
    return
  const items = cellRecords(date, mealType)
  if (!items.length) {
    // switchTab 不支持携带查询参数，由记录页 onShow 一次性消费该目标。
    expanded.value = false
    uni.setStorageSync('pendingRecord', { date, mealType })
    uni.switchTab({
      url: '/pages/chat/index',
      fail() {
        uni.removeStorageSync('pendingRecord')
        uni.showToast({ title: '打开记录页失败，请重试', icon: 'none' })
      },
    })
    return
  }
  detailRecords.value = items
  detailIndex.value = recordIndex
  detailPhotoIndex.value = 0
  editing.value = false
  editRecord.value = null
}

function closeDetail() {
  detailRecords.value = []
  detailPhotoIndex.value = 0
  editing.value = false
  editRecord.value = null
}

watch(detailIndex, () => {
  detailPhotoIndex.value = 0
})

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
  if (!editRecord.value || uploadingPhotos.value)
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
      imageUrls: photos(editRecord.value),
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
  <view class="report-page" :class="{ 'report-page-expanded': expanded }" :style="pageHeaderStyle">
    <view v-if="expanded" class="expanded-header">
      <view><text class="expanded-title">一周记录</text><text class="expanded-subtitle">横屏放大 · 点击餐食查看详情</text></view>
      <button class="collapse-button" aria-label="退出横屏放大" @click="toggleExpanded">收起 ×</button>
    </view>
    <SmartDietHeader v-if="!expanded" class="page-header" title="饮食报告" subtitle="每一餐，都在描绘你的这一周。" />
    <view class="week-nav">
      <view class="nav-button" @click="shiftWeek(-1)">
        ‹
      </view>
      <view class="week-picker" @click="showWeekCalendar = true"><view class="week-calendar-icon">▦</view><view class="week-picker-copy"><text class="week-title">{{ weekTitle }}</text><text class="week-range">{{ weekRange }}</text></view><text class="week-chevron">⌄</text></view>
      <view class="nav-button" @click="shiftWeek(1)">
        ›
      </view>
    </view>

    <view v-if="!expanded" class="summary-row">
      <view class="summary-main">
        <text class="summary-eyebrow">本周平均星级</text><view><text class="summary-score">{{ averageScore || '--' }}</text><text class="summary-unit">/ 5</text></view><view class="summary-stars"><text v-for="star in 5" :key="star" :class="{ filled: star <= Math.round(averageScore) }">★</text></view>
      </view>
      <view class="summary-side">
        <view class="summary-stat"><view class="stat-icon meals-icon">♧</view><view><text class="stat-label">已记录餐次</text><text class="stat-value">{{ records.length }}</text></view></view>
        <view class="summary-stat"><view class="stat-icon rated-icon">★</view><view><text class="stat-label">已评分餐次</text><text class="stat-value">{{ records.filter(item => item.rating > 0).length }}</text></view></view>
      </view>
    </view>

    <view class="section-card calendar-card">
      <view class="section-heading">
        <view class="section-heading-title"><text class="section-leaf">❧</text><text>一周记录</text></view>
        <view class="calendar-heading-actions"><text class="section-hint">轻触格子查看或添加</text><button v-if="!expanded" class="expand-button" aria-label="放大一周记录" @click="toggleExpanded"><text aria-hidden="true">⛶</text> 放大</button></view>
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
              <view v-if="cellRecords(day.date, meal.value).length > 1" class="record-marquee-viewport">
                <view class="record-marquee-track" :style="{ width: `${cellRecords(day.date, meal.value).length * 200}%`, animationDuration: `${cellRecords(day.date, meal.value).length * 7}s` }">
                  <view v-for="(item, index) in loopedCellRecords(day.date, meal.value)" :key="`${item.id}-${index}`" class="record-slide" :style="{ width: `${100 / (cellRecords(day.date, meal.value).length * 2)}%` }" @click.stop="openCell(day.date, meal.value, index % cellRecords(day.date, meal.value).length)">
                    <image v-if="photos(item).length" class="cell-image" :src="absoluteAssetUrl(photos(item)[0])" mode="aspectFill" />
                    <text v-if="item.rating > 0" class="cell-score">{{ item.rating }}★</text>
                    <text v-if="!photos(item).length" class="cell-food">{{ item.name || '已记录' }}</text>
                    <text class="record-count">{{ index % cellRecords(day.date, meal.value).length + 1 }}/{{ cellRecords(day.date, meal.value).length }}</text>
                  </view>
                </view>
              </view>
              <view v-else-if="cellRecords(day.date, meal.value).length" class="record-slide" @click.stop="openCell(day.date, meal.value)"><image v-if="photos(cellRecords(day.date, meal.value)[0]).length" class="cell-image" :src="absoluteAssetUrl(photos(cellRecords(day.date, meal.value)[0])[0])" mode="aspectFill" /><text v-if="cellRecords(day.date, meal.value)[0].rating > 0" class="cell-score">{{ cellRecords(day.date, meal.value)[0].rating }}★</text><text v-if="!photos(cellRecords(day.date, meal.value)[0]).length" class="cell-food">{{ cellRecords(day.date, meal.value)[0].name || '已记录' }}</text></view>
              <text v-else class="add-mark">＋</text>
            </view>
          </template>
        </view>
      </scroll-view>
      <view v-if="!loading && !records.length" class="calendar-empty">本周还没有记录，轻触 ＋ 添加第一餐</view>
      <view v-if="loading" class="loading-mask">
        <view class="spinner" /><text>加载中</text>
      </view>
    </view>

    <view v-if="!expanded" class="section-card trend-card">
      <view class="section-heading">
        <view class="section-heading-title"><text class="section-leaf">❧</text><text>评分趋势</text></view><text class="section-hint">每日平均星级</text>
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
          <view class="detail-header-copy"><text class="detail-eyebrow">SMARTDIET · 餐食记录</text><text class="sheet-title">{{ editing ? '编辑这一餐' : '饮食详情' }}</text><text class="sheet-subtitle">{{ detail.date.slice(0, 4) }}年{{ shortDateLabel(detail.date) }} · {{ mealOptions.find(item => item.value === detail?.mealType)?.label }}</text></view>
          <view class="close-button" @click="closeDetail">×</view>
        </view>

        <scroll-view class="detail-scroll" scroll-y :show-scrollbar="false">
          <template v-if="!editing">
            <view v-if="photos(detail).length" class="detail-hero">
              <swiper :key="detail.id" class="detail-photo-swiper" :circular="photos(detail).length > 1" @change="detailPhotoIndex = $event.detail.current">
                <swiper-item v-for="(url, index) in photos(detail)" :key="`${url}-${index}`"><image class="detail-hero-image" :src="absoluteAssetUrl(url)" mode="aspectFill" @click="previewPhoto(url, photos(detail))" /></swiper-item>
              </swiper>
              <text v-if="photos(detail).length > 1" class="detail-photo-counter">{{ detailPhotoIndex + 1 }} / {{ photos(detail).length }}</text>
            </view>
            <view v-else class="detail-photo-empty"><text class="detail-empty-icon">{{ mealOptions.find(item => item.value === detail?.mealType)?.icon }}</text><text>这一餐没有添加照片</text></view>

            <view class="detail-name-row"><text class="detail-meal-name">{{ detail.name || '未命名餐食' }}</text><text class="detail-leaf">❧</text></view>
            <view class="detail-meta-row">
              <view class="detail-rating-chip"><text class="rating-stars">{{ detail.rating ? '★'.repeat(detail.rating) : '☆' }}</text><text>{{ detail.rating ? `${detail.rating}.0 星` : '未评分' }}</text></view>
              <view v-if="detail.price !== null" class="detail-price-chip">¥{{ detail.price }}</view>
            </view>

            <view v-if="detail.description" class="detail-story"><text class="detail-card-title"><text class="detail-card-icon detail-story-icon">✎</text>补充描述</text><text class="detail-story-text">{{ detail.description }}</text></view>

            <view v-if="detail.positiveTags.length || detail.negativeTags.length" class="detail-tag-grid">
              <view v-if="detail.positiveTags.length" class="detail-tag-card"><text class="detail-card-title"><text class="detail-card-icon">♡</text>喜欢的地方</text><view class="tag-row"><text v-for="tag in detail.positiveTags" :key="`positive-${tag}`" class="tag positive">{{ tag }}</text></view></view>
              <view v-if="detail.negativeTags.length" class="detail-tag-card"><text class="detail-card-title"><text class="detail-card-icon">✦</text>可以更好的地方</text><view class="tag-row"><text v-for="tag in detail.negativeTags" :key="`negative-${tag}`" class="tag warning">{{ tag }}</text></view></view>
            </view>

            <view v-if="detailRecords.length > 1" class="record-nav"><button :disabled="detailIndex === 0" @click="detailIndex--">‹ 上一条</button><text>{{ detailIndex + 1 }} / {{ detailRecords.length }}</text><button :disabled="detailIndex === detailRecords.length - 1" @click="detailIndex++">下一条 ›</button></view>
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
          <view class="edit-field vertical"><text>餐食照片（{{ photos(editRecord).length }}/6）</text><view class="edit-photo-grid"><view v-for="(url, index) in photos(editRecord)" :key="`${url}-${index}`" class="edit-photo"><image :src="absoluteAssetUrl(url)" mode="aspectFill" @click="previewPhoto(url, photos(editRecord))" /><text class="edit-photo-remove" @click.stop="removeEditPhoto(index)">×</text></view><view v-if="photos(editRecord).length < 6" class="edit-photo-add" @click="addEditPhotos">{{ uploadingPhotos ? '上传中' : '＋ 添加' }}</view></view></view>
          <view class="edit-field">
            <text>饮食价格</text><input v-model.number="editRecord.price" type="digit" placeholder="未填写">
          </view>
          <view class="edit-field">
            <text>星级评分</text><view><text v-for="star in 5" :key="star" class="star" :class="{ active: star <= (editRecord.rating || 0) }" @click="editRecord.rating = star">★</text></view>
          </view>
          </template>
        </scroll-view>
        <view class="sheet-actions"><template v-if="!editing"><button class="danger-button" @click="removeCurrent">删除记录</button><button class="edit-button" @click="startEdit">编辑记录</button></template><template v-else><button class="danger-button" @click="editing = false">取消</button><button class="edit-button" :disabled="uploadingPhotos" :loading="saving" @click="saveEdit">保存修改</button></template></view>
      </view>
    </view>
    <DateCalendar :visible="showWeekCalendar" :selected-date="formatDate(focusDate)" mode="week" @close="showWeekCalendar = false" @select="selectWeekDate" />
  </view>
</template>

<style scoped lang="scss">
.page-header { margin: 0 -24rpx; }
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
.detail-photo-strip { width: 100%; margin-top: 22rpx; }
.detail-photo-row { display: flex; gap: 12rpx; }
.detail-photo-row .detail-image { width: 300rpx; height: 300rpx; flex: none; margin-top: 0; }
.edit-photo-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10rpx; width: 100%; }
.edit-photo, .edit-photo-add { position: relative; height: 132rpx; border-radius: 15rpx; overflow: hidden; }
.edit-photo image { width: 100%; height: 100%; }
.edit-photo-remove { position: absolute; top: 4rpx; right: 4rpx; width: 30rpx; height: 30rpx; border-radius: 50%; color: #fff; background: rgba(26, 45, 31, .75); line-height: 28rpx; text-align: center; }
.edit-photo-add { border: 2rpx dashed #b9cfb2; color: #5c845d; background: #f5f9ef; display: flex; align-items: center; justify-content: center; }
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
.report-page { background: #faf8f1; color: var(--sd-forest); }
.week-nav { height: 112rpx; }
.nav-button { border: 1rpx solid #e9ede3; border-radius: 19rpx; color: #457452; background: #fffefa; box-shadow: 0 5rpx 16rpx rgba(41, 73, 49, 0.04); }
.week-title { color: #214631; font-size: 27rpx; }
.week-range { color: #7e947f; }
.summary-row { padding: 30rpx 24rpx; border: 1rpx solid #e9eddd; border-radius: 30rpx; color: #244b32; background: linear-gradient(120deg, #edf4e7, #fffaf0); box-shadow: var(--sd-card-shadow); }
.summary-main { border-right-color: #d9e4d3; }
.summary-eyebrow, .summary-row .stat-label { color: #708d74; }
.summary-score { color: #2c7544; }
.summary-unit { color: #608463; }
.summary-row .stat-value { color: #275d3c; }
.section-card { border: 1rpx solid #eeeae0; border-radius: 29rpx; background: #fffefa; box-shadow: var(--sd-card-shadow); }
.section-heading { color: #254633; }
.section-hint { color: #8c9c8d; }
.grid-header { color: #7f947e; background: #f5f7ee; }
.grid-header.today { color: #2c7544; background: #e6f0e1; }
.meal-cell { background: #fafbf5; border-color: #edf0e7; }
.record-cell { background: #fffefa; border-color: #edf0e7; }
.record-cell.today { background: #f5f9ef; }
.add-mark { color: #9bb69d; }
.bar-track { background: #e9eee3; }
.bar-value { background: linear-gradient(180deg, #94b977, #3b8653); }
.todayText, .detail-score { color: #317949; }
.detail-sheet { background: #fffefa; }
.edit-button { background: #317949; }

/* Report concept: compact weekly overview that fits a phone without horizontal scrolling. */
.report-page { padding: 0 24rpx calc(160rpx + env(safe-area-inset-bottom)); }
.week-nav { height: 94rpx; margin-top: 5rpx; }
.nav-button { width: 58rpx; height: 58rpx; border-radius: 50%; font-size: 39rpx; }
.week-picker { min-width: 310rpx; height: 76rpx; box-sizing: border-box; padding: 0 16rpx; border: 1rpx solid #e7ecdf; border-radius: 22rpx; background: #fffefa; box-shadow: 0 6rpx 20rpx rgba(47, 73, 47, 0.06); display: flex; align-items: center; gap: 12rpx; text-align: left; }
.week-calendar-icon { width: 43rpx; height: 43rpx; flex: none; border-radius: 13rpx; background: #eaf3e6; color: #57915e; font-size: 30rpx; line-height: 40rpx; text-align: center; }
.week-picker-copy { flex: 1; min-width: 0; }
.week-title { font-size: 20rpx; font-weight: 750; }
.week-range { margin-top: 2rpx; color: #64866c; font-size: 21rpx; font-weight: 700; white-space: nowrap; }
.week-chevron { color: #87a18a; font-size: 23rpx; }
.summary-row { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 14rpx; padding: 18rpx; border-radius: 30rpx; background: #fffefa; }
.summary-main { min-height: 178rpx; box-sizing: border-box; padding: 23rpx 16rpx; border: 0; border-radius: 23rpx; background: linear-gradient(135deg, #f0f5e9, #fbf8ed); }
.summary-eyebrow { color: #5b7963; font-size: 20rpx; }
.summary-score { color: #185339; font-size: 63rpx; line-height: 1.15; }
.summary-unit { color: #77927a; font-size: 24rpx; }
.summary-stars { display: flex; gap: 4rpx; color: #d7ded2; font-size: 22rpx; }
.summary-stars .filled { color: #6d9c5b; }
.summary-side { display: flex; flex-direction: column; gap: 12rpx; }
.summary-stat { flex: 1; display: flex; align-items: center; gap: 11rpx; padding: 12rpx; border-radius: 21rpx; background: #f7f9f3; text-align: left; }
.stat-icon { width: 45rpx; height: 45rpx; flex: none; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 26rpx; }
.meals-icon { color: #397b4c; background: #e5f0e2; }
.rated-icon { color: #e69a60; background: #fff0e3; }
.summary-row .stat-label { font-size: 17rpx; white-space: nowrap; }
.summary-row .stat-value { margin-top: 2rpx; font-size: 30rpx; line-height: 1; }
.section-card { margin-top: 22rpx; }
.section-heading { padding: 25rpx 21rpx 15rpx; font-size: 27rpx; }
.section-heading-title { display: flex; align-items: center; gap: 8rpx; }
.section-leaf { color: #78a873; font-size: 31rpx; line-height: 1; }
.section-hint { font-size: 17rpx; }
.calendar-grid { box-sizing: border-box; width: 100%; padding: 0 11rpx 18rpx; grid-template-columns: 78rpx repeat(7, minmax(0, 1fr)); gap: 3rpx; }
.grid-header { height: 62rpx; border-radius: 9rpx; background: #f6f8f2; font-size: 17rpx; }
.day-number { margin-top: 2rpx; font-size: 18rpx; }
.meal-cell { height: 81rpx; box-sizing: border-box; border: 0; border-radius: 10rpx; font-size: 16rpx; }
.meal-icon { margin-bottom: 0; font-size: 22rpx; }
.record-cell { height: 81rpx; border: 0; border-radius: 10rpx; background: #f4f6f1; }
.record-marquee-viewport { width: 100%; height: 100%; overflow: hidden; }
.record-marquee-track { height: 100%; display: flex; animation: record-marquee linear infinite; will-change: transform; }
.record-marquee-viewport:hover .record-marquee-track, .record-marquee-viewport:active .record-marquee-track { animation-play-state: paused; }
.record-slide { position: relative; flex: none; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
@keyframes record-marquee { to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .record-marquee-track { animation: none; } }
.cell-image { opacity: 1; }
.cell-score { position: absolute; bottom: 3rpx; right: 3rpx; padding: 1rpx 4rpx; border-radius: 7rpx; background: rgba(255, 255, 255, 0.9); color: #1c6b3e; font-size: 15rpx; line-height: 1.2; }
.cell-food { width: 90%; margin: 0; font-size: 15rpx; }
.record-count { top: 2rpx; right: 2rpx; font-size: 13rpx; }
.add-mark { font-size: 29rpx; }
.calendar-empty { padding: 0 20rpx 20rpx; color: #8a9c8c; font-size: 18rpx; text-align: center; }
.trend-chart { height: 223rpx; padding: 4rpx 19rpx 25rpx; gap: 10rpx; }
.bar-track { width: 38rpx; height: 140rpx; border-radius: 11rpx 11rpx 4rpx 4rpx; }
.bar-value { border-radius: 11rpx 11rpx 4rpx 4rpx; }
.trend-score { color: #39654a; font-size: 17rpx; }

/* Meal detail sheet, aligned with the record detail concept in design/. */
.modal-overlay { background: rgba(22, 43, 30, 0.48); }
.detail-sheet { display: flex; flex-direction: column; height: min(100%, 1120rpx); max-height: 100%; padding: 11rpx 28rpx calc(20rpx + env(safe-area-inset-bottom)); overflow: hidden; border-radius: 36rpx 36rpx 0 0; background: #fffefa; }
.sheet-handle { flex: none; margin-bottom: 15rpx; background: #d7e3d7; }
.sheet-header { flex: none; padding-bottom: 19rpx; }
.detail-header-copy { min-width: 0; }
.detail-eyebrow { display: block; color: #7da481; font-size: 17rpx; font-weight: 750; letter-spacing: 2rpx; }
.sheet-title { margin-top: 5rpx; color: #193e2b; font-size: 35rpx; font-weight: 820; }
.sheet-subtitle { margin-top: 5rpx; color: #728775; font-size: 20rpx; }
.close-button { width: 52rpx; height: 52rpx; flex: none; border-radius: 50%; background: #f0f5ee; color: #68876e; }
.detail-scroll { flex: 1; width: 100%; height: 0; min-height: 0; }
.detail-hero { position: relative; height: 385rpx; overflow: hidden; border-radius: 28rpx; background: #eef2e8; }
.detail-photo-swiper, .detail-hero-image { width: 100%; height: 100%; }
.detail-photo-counter { position: absolute; right: 15rpx; bottom: 15rpx; padding: 6rpx 15rpx; border-radius: 999rpx; color: #fff; background: rgba(25, 49, 34, 0.66); font-size: 20rpx; font-weight: 700; }
.detail-photo-empty { height: 230rpx; border-radius: 28rpx; background: radial-gradient(circle at 50% 35%, #f8f5e7, #e9f1e5); color: #8aa08a; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8rpx; font-size: 20rpx; }
.detail-empty-icon { font-size: 58rpx; }
.detail-name-row { display: flex; align-items: center; gap: 10rpx; margin-top: 24rpx; }
.detail-meal-name { min-width: 0; flex: 1; color: #173e2b; font-size: 34rpx; font-weight: 820; line-height: 1.3; overflow-wrap: anywhere; }
.detail-leaf { color: #a8c6a0; font-size: 35rpx; }
.detail-meta-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12rpx; margin-top: 17rpx; }
.detail-rating-chip, .detail-price-chip { min-height: 62rpx; box-sizing: border-box; padding: 0 19rpx; border-radius: 18rpx; display: flex; align-items: center; justify-content: center; gap: 9rpx; font-size: 23rpx; font-weight: 730; }
.detail-rating-chip { color: #bc802b; background: #fff5e4; }
.rating-stars { color: #ed9b22; font-size: 27rpx; letter-spacing: 1rpx; }
.detail-price-chip { color: #245638; background: #e9f2e5; font-size: 28rpx; }
.detail-story { margin-top: 26rpx; padding: 23rpx 25rpx; border-radius: 25rpx; background: linear-gradient(120deg, #f1f6e9, #f8f8ef); }
.detail-card-title { color: #1e4630; font-size: 25rpx; font-weight: 780; display: flex; align-items: center; gap: 9rpx; }
.detail-card-icon { color: #5e9463; font-size: 30rpx; line-height: 1; }
.detail-story-icon { width: 38rpx; height: 38rpx; border-radius: 12rpx; color: #427e51; background: #dfeddf; display: inline-flex; align-items: center; justify-content: center; font-size: 27rpx; font-weight: 700; transform: rotate(-7deg); }
.detail-story-text { display: block; margin-top: 14rpx; color: #5d7262; font-size: 22rpx; line-height: 1.58; overflow-wrap: anywhere; }
.detail-tag-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14rpx; margin-top: 20rpx; }
.detail-tag-card { min-width: 0; padding: 20rpx; border: 1rpx solid #edf0e6; border-radius: 22rpx; background: #fffefa; }
.detail-tag-card:only-child { grid-column: 1 / -1; }
.detail-tag-card .detail-card-title { font-size: 21rpx; }
.detail-tag-card .tag-row { margin-top: 16rpx; }
.detail-tag-card .tag { padding: 7rpx 14rpx; font-size: 19rpx; }
.tag.positive { color: #34734a; background: #eaf3e5; }
.tag.warning { color: #a17030; background: #fff0dc; }
.record-nav { align-items: center; margin: 22rpx 0 12rpx; padding: 8rpx; border-radius: 20rpx; background: #f4f7f1; }
.record-nav button { height: 58rpx; color: #42734e; background: #fffefa; font-size: 20rpx; }
.record-nav button[disabled] { opacity: 0.4; }
.record-nav > text { color: #78937c; font-size: 20rpx; white-space: nowrap; }
.sheet-actions { flex: none; margin-top: 14rpx; padding-top: 14rpx; border-top: 1rpx solid #eef0e8; background: #fffefa; }
.sheet-actions button { height: 78rpx; border-radius: 999rpx; font-size: 24rpx; font-weight: 750; }
.sheet-actions .danger-button { border: 2rpx solid #35644a; color: #315b42; background: #fffefa; }
.sheet-actions .edit-button { color: #fff; background: linear-gradient(110deg, #286144, #36764c); }
.edit-field { background: #f5f8f1; }

/* 放大视图以屏幕长边作为宽度；设备转为横屏后恢复正常方向。 */
.calendar-heading-actions { display: flex; align-items: center; gap: 12rpx; }
.expand-button { display: flex; align-items: center; gap: 4rpx; margin: 0; padding: 0 13rpx; height: 45rpx; line-height: 45rpx; border-radius: 12rpx; background: #edf4e8; color: #396d48; font-size: 20rpx; font-weight: 600; }
.expand-button::after, .collapse-button::after { border: 0; }
.report-page.report-page-expanded { position: fixed; z-index: 2000; inset: 0; display: flex; flex-direction: column; width: 100vw; height: 100vh; height: 100dvh; min-height: 0; padding: 10px max(12px, env(safe-area-inset-right)) 10px max(12px, env(safe-area-inset-left)); overflow: hidden; background: #f7f8f0; }
.expanded-header { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 12px; }
.expanded-header > view { display: flex; align-items: baseline; gap: 12px; }
.expanded-title { color: #204d34; font-size: 20px; font-weight: 800; }
.expanded-subtitle { color: #7a8c7b; font-size: 11px; }
.collapse-button { margin: 0; padding: 0 14px; height: 32px; line-height: 32px; border-radius: 16px; background: #e9f1e4; color: #386c45; font-size: 12px; }
.report-page-expanded .week-nav { flex: none; height: 49px; margin: 0; }
.report-page-expanded .nav-button { width: 30px; height: 30px; font-size: 28px; }
.report-page-expanded .week-picker { min-width: 220px; height: 40px; border-radius: 13px; padding: 0 12px; gap: 8px; }
.report-page-expanded .week-calendar-icon { width: 27px; height: 27px; border-radius: 8px; line-height: 26px; font-size: 20px; }
.report-page-expanded .week-title { font-size: 11px; }
.report-page-expanded .week-range { margin-top: 0; font-size: 13px; }
.report-page-expanded .week-chevron { font-size: 16px; }
.report-page-expanded .calendar-card { display: flex; flex: 1; min-height: 0; flex-direction: column; margin: 0; border-radius: 16px; overflow: hidden; }
.report-page-expanded .section-heading { flex: none; padding: 10px 12px 8px; font-size: 15px; }
.report-page-expanded .section-leaf { font-size: 19px; }
.report-page-expanded .section-hint { font-size: 11px; }
.report-page-expanded .calendar-scroll { flex: 1; min-height: 0; height: 0; }
.report-page-expanded .calendar-grid { width: 100%; height: 100%; padding: 0 8px 8px; gap: 3px; grid-template-columns: 56px repeat(7, minmax(0, 1fr)); grid-template-rows: 40px repeat(4, minmax(0, 1fr)); }
.report-page-expanded .grid-header, .report-page-expanded .meal-cell, .report-page-expanded .record-cell { height: 100%; min-height: 0; border-radius: 7px; font-size: 11px; }
.report-page-expanded .day-header { flex-direction: column; gap: 2px; }
.report-page-expanded .day-number { margin: 0; font-size: 14px; }
.report-page-expanded .meal-icon { font-size: 20px; }
.report-page-expanded .add-mark { font-size: 30px; }
.report-page-expanded .cell-score { right: 3px; bottom: 3px; padding: 1px 4px; border-radius: 6px; font-size: 12px; }
.report-page-expanded .cell-food { font-size: 12px; }
.report-page-expanded .record-count { top: 2px; right: 2px; padding: 1px 5px; border-radius: 7px; font-size: 10px; }
.report-page-expanded .calendar-empty { flex: none; padding: 3px 12px 6px; font-size: 10px; }
.report-page-expanded .modal-overlay { bottom: 0; align-items: center; justify-content: center; }
.report-page-expanded .detail-sheet { max-width: 680px; height: 100%; border-radius: 18px; }
@media (orientation: portrait) {
  .report-page.report-page-expanded { inset: auto; top: 50%; left: 50%; width: 100vh; width: 100dvh; height: 100vw; min-height: 0; transform: translate(-50%, -50%) rotate(90deg); }
}

</style>
