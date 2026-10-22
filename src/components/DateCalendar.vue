<script setup lang="ts">
import { formatDate, parseLocalDate, shortDateLabel, startOfWeek } from '@/utils/smartdiet'

const props = withDefaults(defineProps<{
  visible: boolean
  selectedDate: string
  mode?: 'day' | 'week'
}>(), { mode: 'day' })

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'select', value: string): void
}>()

const viewMonth = ref(new Date())
const weekdays = ['一', '二', '三', '四', '五', '六', '日']

watch(() => [props.visible, props.selectedDate] as const, ([visible, selectedDate]) => {
  if (visible) {
    const selected = parseLocalDate(selectedDate)
    viewMonth.value = new Date(selected.getFullYear(), selected.getMonth(), 1)
  }
}, { immediate: true })

const monthTitle = computed(() => `${viewMonth.value.getFullYear()}年${viewMonth.value.getMonth() + 1}月`)
const selectedWeekStart = computed(() => startOfWeek(parseLocalDate(props.selectedDate)))
const selectedWeekEnd = computed(() => {
  const end = new Date(selectedWeekStart.value)
  end.setDate(end.getDate() + 6)
  return end
})
const selectedWeekStartKey = computed(() => formatDate(selectedWeekStart.value))
const selectedWeekEndKey = computed(() => formatDate(selectedWeekEnd.value))
const selectionCaption = computed(() => props.mode === 'week'
  ? `${shortDateLabel(selectedWeekStartKey.value)} — ${shortDateLabel(selectedWeekEndKey.value)}`
  : `${props.selectedDate.slice(0, 4)}年${shortDateLabel(props.selectedDate)}`)

const calendarDays = computed(() => {
  const year = viewMonth.value.getFullYear()
  const month = viewMonth.value.getMonth()
  const todayKey = formatDate(new Date())
  const firstDay = new Date(year, month, 1)
  const mondayOffset = (firstDay.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, month, index - mondayOffset + 1)
    const key = formatDate(date)
    return {
      date,
      key,
      number: date.getDate(),
      outside: date.getMonth() !== month,
      today: key === todayKey,
      future: key > todayKey,
      selected: props.mode === 'day' && key === props.selectedDate,
      inWeek: props.mode === 'week' && key >= selectedWeekStartKey.value && key <= selectedWeekEndKey.value,
      weekStart: props.mode === 'week' && key === selectedWeekStartKey.value,
      weekEnd: props.mode === 'week' && key === selectedWeekEndKey.value,
    }
  })
})

const quickOptions = computed(() => props.mode === 'week'
  ? [
      { label: '上上周', offset: -14 },
      { label: '上周', offset: -7 },
      { label: '本周', offset: 0 },
    ]
  : [
      { label: '前天', offset: -2 },
      { label: '昨天', offset: -1 },
      { label: '今天', offset: 0 },
    ])

function shiftMonth(offset: number) {
  viewMonth.value = new Date(viewMonth.value.getFullYear(), viewMonth.value.getMonth() + offset, 1)
}

function selectDate(date: Date) {
  emit('select', formatDate(date))
}

function selectQuick(offset: number) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  selectDate(date)
}
</script>

<template>
  <view v-if="visible" class="date-calendar-overlay" @click="emit('close')">
    <view class="date-calendar-sheet" @click.stop>
      <view class="sheet-handle" />
      <view class="calendar-heading">
        <view><text class="heading-eyebrow">SMARTDIET · 日历</text><text class="heading-title">{{ mode === 'week' ? '选择报告周次' : '选择记录日期' }}</text></view>
        <view class="close-control" @click="emit('close')">×</view>
      </view>
      <text class="calendar-intro">{{ mode === 'week' ? '点击任意一天，查看它所在的一周' : '为这一餐选一个日期' }}</text>

      <view class="quick-row">
        <view v-for="option in quickOptions" :key="option.label" class="quick-option" @click="selectQuick(option.offset)">{{ option.label }}</view>
      </view>

      <view class="month-navigation">
        <view class="month-arrow" @click="shiftMonth(-1)">‹</view>
        <text class="month-title">{{ monthTitle }}</text>
        <view class="month-arrow" @click="shiftMonth(1)">›</view>
      </view>

      <view class="weekday-grid"><text v-for="weekday in weekdays" :key="weekday">{{ weekday }}</text></view>
      <view class="day-grid">
        <view v-for="day in calendarDays" :key="day.key" class="day-cell" :class="{ outside: day.outside, future: day.future, selected: day.selected, 'in-week': day.inWeek, 'week-start': day.weekStart, 'week-end': day.weekEnd }" @click="selectDate(day.date)">
          <text>{{ day.number }}</text><view v-if="day.today" class="today-dot" />
        </view>
      </view>
      <view class="selection-summary"><text class="summary-caption">{{ mode === 'week' ? '当前周次' : '当前日期' }}</text><text class="summary-value">{{ selectionCaption }}</text></view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.date-calendar-overlay { position: fixed; z-index: 10000; inset: 0; display: flex; align-items: flex-end; background: rgba(26, 47, 34, 0.38); }
.date-calendar-sheet { box-sizing: border-box; width: 100%; max-height: calc(100vh - 50rpx); overflow-y: auto; padding: 12rpx 30rpx calc(29rpx + env(safe-area-inset-bottom)); border-radius: 34rpx 34rpx 0 0; background: #fffefa; box-shadow: 0 -18rpx 48rpx rgba(24, 52, 32, 0.16); }
.sheet-handle { width: 72rpx; height: 7rpx; margin: 0 auto 23rpx; border-radius: 99rpx; background: #d9e4d9; }
.calendar-heading { display: flex; align-items: center; justify-content: space-between; }
.heading-eyebrow, .heading-title { display: block; }
.heading-eyebrow { color: #79a27a; font-size: 17rpx; font-weight: 750; letter-spacing: 2rpx; }
.heading-title { margin-top: 5rpx; color: #193e2b; font-size: 31rpx; font-weight: 800; }
.close-control { width: 53rpx; height: 53rpx; border-radius: 50%; background: #f3f6ef; color: #60806a; font-size: 37rpx; line-height: 49rpx; text-align: center; }
.calendar-intro { display: block; margin-top: 8rpx; color: #8ba08d; font-size: 19rpx; }
.quick-row { display: flex; gap: 12rpx; margin-top: 23rpx; }
.quick-option { flex: 1; height: 57rpx; border: 1rpx solid #e4ede0; border-radius: 17rpx; background: #f5f9f0; color: #4d8255; font-size: 21rpx; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.month-navigation { display: flex; align-items: center; justify-content: space-between; margin-top: 23rpx; }
.month-title { color: #254834; font-size: 25rpx; font-weight: 800; }
.month-arrow { width: 51rpx; height: 51rpx; border-radius: 14rpx; background: #f4f7f1; color: #638569; font-size: 39rpx; line-height: 46rpx; text-align: center; }
.weekday-grid, .day-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.weekday-grid { margin-top: 13rpx; }
.weekday-grid text { padding: 11rpx 0; color: #91a293; font-size: 19rpx; text-align: center; }
.day-grid { row-gap: 6rpx; }
.day-cell { position: relative; height: 64rpx; border-radius: 13rpx; color: #355441; font-size: 23rpx; font-weight: 650; display: flex; align-items: center; justify-content: center; }
.day-cell.outside { color: #bac7b9; }
.day-cell.in-week { border-radius: 0; background: #e8f2e5; color: #397849; }
.day-cell.future { color: #b9c3b9; }
.day-cell.in-week.future { background: #f1f3ef; color: #b9c3b9; }
.day-cell.week-start { border-radius: 16rpx 0 0 16rpx; }
.day-cell.week-end { border-radius: 0 16rpx 16rpx 0; }
.day-cell.selected { border-radius: 17rpx; color: #fff; background: linear-gradient(145deg, #75a76d, #397d4c); box-shadow: 0 7rpx 15rpx rgba(48, 112, 68, 0.21); }
.today-dot { position: absolute; bottom: 7rpx; width: 6rpx; height: 6rpx; border-radius: 50%; background: #69a665; }
.day-cell.selected .today-dot { background: #fff; }
.selection-summary { display: flex; align-items: center; justify-content: space-between; margin-top: 20rpx; padding: 17rpx 20rpx; border-radius: 18rpx; background: #f3f7ef; }
.summary-caption { color: #839b86; font-size: 18rpx; }
.summary-value { color: #347447; font-size: 21rpx; font-weight: 750; }
</style>
