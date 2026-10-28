<script setup lang="ts">
import type { MealType } from '@/api/types/smartdiet'
import { absoluteAssetUrl, createRecord, getRecords, previewFoodImages, uploadFoodImage } from '@/api/smartdiet'
import DateCalendar from '@/components/DateCalendar.vue'
import PrivateImage from '@/components/PrivateImage.vue'
import SmartDietHeader from '@/components/SmartDietHeader.vue'
import { useMealSuggestions } from '@/hooks/useMealSuggestions'
import { usePageHeader } from '@/hooks/usePageHeader'
import { useRecordStore, useTokenStore } from '@/store'
import { chooseImages, formatDate, getCurrentMealType, mealOptions, parseLocalDate, relativeDateLabel, shortDateLabel } from '@/utils/smartdiet'

definePage({
  type: 'home',
  style: { navigationStyle: 'custom', enablePullDownRefresh: false },
})

const recordStore = useRecordStore()
const { pageHeaderStyle } = usePageHeader()
const tokenStore = useTokenStore()
const dailyScore = ref(0)
const todayRecordCount = ref(0)
const positiveTagOptions = ['好吃', '新鲜', '营养均衡', '高蛋白', '蔬菜丰富', '饱腹感强']
const negativeTagOptions = ['太油', '太咸', '太甜', '不新鲜', '分量不足', '价格偏高']
const moodOptions = [
  { icon: '😄', label: '很满意' },
  { icon: '🙂', label: '还不错' },
  { icon: '😐', label: '一般' },
  { icon: '🙁', label: '不太好' },
  { icon: '😟', label: '不喜欢' },
]
const maxPhotos = 6
const uploadingPhotos = ref(false)
const showDateCalendar = ref(false)
const showDescription = ref(false)
const showTagDetails = ref(true)
const draft = computed(() => recordStore.draft)
const { names: suggestedNames, descriptions: suggestedDescriptions, loading: recognizing, errors: recognitionErrors, hasStarted: recognitionStarted, start: startRecognition } = useMealSuggestions(draft, uploadingPhotos)
const customTags = reactive({ positive: '', negative: '' })
const visiblePositiveTags = computed(() => Array.from(new Set([...positiveTagOptions, ...(draft.value?.positiveTags || [])])))
const visibleNegativeTags = computed(() => Array.from(new Set([...negativeTagOptions, ...(draft.value?.negativeTags || [])])))

/** 校验并添加自定义感受标签，去重后清空输入框。 */
function addCustomTag(kind: 'positive' | 'negative') {
  if (!draft.value || draft.value.saving)
    return
  const tag = customTags[kind].trim()
  if (!tag)
    return
  const tags = kind === 'positive' ? draft.value.positiveTags : draft.value.negativeTags
  if (tag.length > 20 || (!tags.includes(tag) && tags.length >= 12)) {
    uni.showToast({ title: '每类最多 12 个标签，每个最多 20 字', icon: 'none' })
    return
  }
  if (!tags.includes(tag))
    tags.push(tag)
  customTags[kind] = ''
}

watch(() => draft.value, () => {
  customTags.positive = ''
  customTags.negative = ''
})

/** 将用户点击的 AI 候选填入对应字段，描述选中后展开编辑区。 */
function selectSuggestion(field: 'name' | 'description', value: string) {
  if (!draft.value || draft.value.saving)
    return
  draft.value[field] = value
  if (field === 'description')
    showDescription.value = true
}

/** 校验当前登录状态，未登录时跳转登录页。 */
function ensureLogin() {
  if (!tokenStore.updateNowTime().hasLogin) {
    uni.reLaunch({ url: '/pages/login/index' })
    return false
  }
  return true
}

/** 清理已保存的草稿。 */
function normalizeDraft() {
  const current = recordStore.draft
  if (!current)
    return
  if (current.saved) {
    recordStore.draft = null
    return
  }

}

/** 读取今日餐食记录，更新记录数量和平均星级。 */
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

/** 初始化新的餐食草稿和表单展开状态。 */
function startRecord(target?: { date: string, mealType: MealType }) {
  if (!ensureLogin())
    return
  recordStore.draft = {
    imageUrls: [],
    date: target?.date || formatDate(new Date()),
    mealType: target?.mealType || getCurrentMealType(),
    name: '',
    description: '',
    positiveTags: [],
    negativeTags: [],
    price: null,
    rating: 0,
    saving: false,
    saved: false,
  }
  showDescription.value = false
  showTagDetails.value = true
  showDateCalendar.value = false
}

/** 判断草稿中是否有需要在切换日期前保留的用户输入。 */
function hasDraftContent() {
  const current = recordStore.draft
  return !!current && !!(current.name.trim() || current.description.trim() || current.imageUrls.length
    || current.positiveTags.length || current.negativeTags.length || current.price !== null || current.rating
    || customTags.positive.trim() || customTags.negative.trim())
}

/** 消费报告格子的一次性跳转参数；缓存页面每次显示时都需要检查。 */
function openPendingRecord() {
  const target = uni.getStorageSync('pendingRecord')
  if (!target)
    return
  uni.removeStorageSync('pendingRecord')
  if (typeof target.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(target.date)
    || formatDate(parseLocalDate(target.date)) !== target.date
    || !mealOptions.some(meal => meal.value === target.mealType)) {
    uni.showToast({ title: '记录日期或餐次无效，请重新选择', icon: 'none' })
    return
  }
  const current = recordStore.draft
  if (current?.saving || uploadingPhotos.value) {
    uni.showToast({ title: '请等待当前上传或保存完成后再选择', icon: 'none' })
    return
  }
  // 同一日期、餐次继续编辑原草稿，不清空已填写的内容。
  if (current?.date === target.date && current.mealType === target.mealType)
    return
  if (hasDraftContent()) {
    uni.showModal({
      title: '已有未保存的记录',
      content: `是否放弃当前草稿，改为记录 ${target.date} 的${mealOptions.find(meal => meal.value === target.mealType)?.label}？`,
      confirmText: '新建记录',
      cancelText: '保留草稿',
      success: (res) => {
        if (res.confirm && recordStore.draft === current && !current?.saving && !uploadingPhotos.value)
          startRecord(target)
      },
    })
    return
  }
  startRecord(target)
}

/** 更新就餐日期并关闭日期选择面板。 */
function selectRecordDate(value: string) {
  if (draft.value)
    draft.value.date = value
  showDateCalendar.value = false
}

/** 关闭当前草稿；已有内容时先询问是否放弃。 */
function closeRecord() {
  const current = recordStore.draft
  if (!current || current.saving)
    return
  if (hasDraftContent() && !current.saved) {
    uni.showModal({
      title: '放弃当前记录？',
      content: '已填写的内容将不会保存。',
      confirmText: '放弃',
      confirmColor: '#b85b48',
      success: (res) => {
        if (res.confirm)
          recordStore.draft = null
      },
    })
    return
  }
  recordStore.draft = null
}

/** 并发上传所选照片，按选图顺序插入草稿；上传完成后由用户手动开始识别。 */
async function chooseRecordImages() {
  const current = draft.value
  if (!current || current.saving || uploadingPhotos.value || current.imageUrls.length >= maxPhotos)
    return
  try {
    uploadingPhotos.value = true
    const paths = await chooseImages(maxPhotos - current.imageUrls.length)
    if (recordStore.draft !== current)
      return
    // 即使上传完成顺序不同，也按用户选图顺序排列照片。
    const existingPhotoCount = current.imageUrls.length
    const uploadedIndexes: number[] = []
    const results = await Promise.allSettled(paths.map(async (path, index) => {
      const result = await uploadFoodImage(path)
      if (recordStore.draft === current) {
        const offset = uploadedIndexes.filter(uploadedIndex => uploadedIndex < index).length
        current.imageUrls.splice(existingPhotoCount + offset, 0, result.url)
        uploadedIndexes.push(index)
      }
      return result
    }))
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

/** 移除指定照片，由图片列表监听器取消旧识别并清空候选。 */
function removeRecordImage(index: number) {
  if (!draft.value || uploadingPhotos.value || draft.value.saving)
    return
  draft.value.imageUrls.splice(index, 1)
}

/** 切换感受标签选中状态，并限制每类最多选择十二个。 */
function toggleTag(kind: 'positive' | 'negative', tag: string) {
  const current = recordStore.draft
  if (!current)
    return
  const tags = kind === 'positive' ? current.positiveTags : current.negativeTags
  const index = tags.indexOf(tag)
  if (index >= 0)
    tags.splice(index, 1)
  else if (tags.length < 12)
    tags.push(tag)
  else
    uni.showToast({ title: '每类最多选择 12 个标签', icon: 'none' })
}

/** 将价格输入转换为有限数值，空值或非法数值记为未填写。 */
function onPriceInput(event: { detail: { value: string } }) {
  if (!recordStore.draft)
    return
  const value = event.detail.value.trim()
  const price = Number(value)
  recordStore.draft.price = value && Number.isFinite(price) ? price : null
}

/** 校验名称、收集待添加标签并保存餐食；无需等待 AI 回复结束。 */
async function saveDraft() {
  const current = recordStore.draft
  if (!current || current.saving || uploadingPhotos.value)
    return
  const name = current.name.trim()
  if (!name) {
    uni.showToast({ title: '请填写饮食名称', icon: 'none' })
    return
  }
  // 保存时一并提交尚未点击“添加”的自定义标签。
  addCustomTag('positive')
  addCustomTag('negative')
  if (customTags.positive.trim() || customTags.negative.trim())
    return
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
      imageUrls: current.imageUrls,
      rating: current.rating,
    })
    current.saved = true
    recordStore.draft = null
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

/** 根据是否存在草稿，执行开始记录或保存记录。 */
function handlePrimaryAction() {
  if (!draft.value)
    startRecord()
  else
    saveDraft()
}

/** 将图片地址转换为可访问地址后打开照片预览。 */
function preview(url: string, urls: string[]) {
  if (url)
    previewFoodImages(url, urls)
}

onLoad(normalizeDraft)
onShow(() => {
  if (!ensureLogin())
    return
  normalizeDraft()
  openPendingRecord()
  refreshTodayRecords()
})
</script>

<template>
  <view class="record-page" :class="{ 'record-page-form': !!draft }" :style="pageHeaderStyle">
    <SmartDietHeader title="饮食记录" :subtitle="draft ? undefined : '拍照识别，轻松记录每一餐'" fixed :back="!!draft" dot @back="closeRecord">
      <template #action>
        <view class="header-score"><text>今日星级</text><text class="header-score-value">{{ dailyScore || '--' }}</text></view>
      </template>
    </SmartDietHeader>

    <scroll-view class="record-scroll" scroll-y :show-scrollbar="false">
      <view class="record-content" :class="{ 'form-content': !!draft }">
        <template v-if="!draft">
          <view class="empty-hero">
            <view class="hero-kicker">
              <text class="kicker-dot" /> 今日饮食 · 用心记录
            </view>
            <text class="hero-title">好好吃饭，</text><text class="hero-title">也好好记录。</text>
            <text class="hero-copy">记下今天的味道，慢慢看见更好的自己。</text>
            <view class="hero-illustration">
              <view class="illustration-halo" />
              <image class="bowl-illustration" src="/static/images/meal-bowl-illustration.png" mode="aspectFit" />
            </view>
            <view class="today-summary">
              <view><text class="summary-number">{{ todayRecordCount }}</text><text class="summary-unit">餐</text></view><text class="summary-label">今日已记录</text>
            </view>
          </view>
          <view class="guide-card">
            <view class="guide-heading">
              <view><text class="guide-kicker">轻松开始</text><text class="guide-title">让每一餐都有迹可循</text></view><text class="guide-sparkle">✦</text>
            </view>
            <view class="guide-steps">
              <view class="guide-step">
                <view class="step-icon">
                  ✎
                </view><text class="step-number">01</text><text class="step-label">写下餐食</text>
              </view>
              <view class="step-connector" />
              <view class="guide-step">
                <view class="step-icon">
                  ♡
                </view><text class="step-number">02</text><text class="step-label">记下感受</text>
              </view>
              <view class="step-connector" />
              <view class="guide-step">
                <view class="step-icon">
                  ✓
                </view><text class="step-number">03</text><text class="step-label">完成记录</text>
              </view>
            </view>
          </view>
        </template>

        <view v-else class="form-layout">
          <view class="form-hero">
            <text class="form-title">这一餐，吃了什么？</text>
            <view class="form-title-underline" />
            <image class="form-art" src="/static/images/meal-form-avocado.png" mode="aspectFit" />
            <view class="record-fields">
              <view class="date-trigger" @click="showDateCalendar = true">
                <text class="date-icon">▦</text><view class="date-copy">
                  <text class="date-relative">{{ relativeDateLabel(draft.date) }}</text><text class="date-value">{{ shortDateLabel(draft.date) }}</text>
                </view><text class="pill-arrow">⌄</text>
              </view>
              <view v-for="meal in mealOptions" :key="meal.value" class="meal-choice" :class="{ active: draft.mealType === meal.value }" @click="draft.mealType = meal.value">
                <text class="meal-choice-icon">{{ meal.icon }}</text><text class="meal-choice-label">{{ meal.label }}</text>
              </view>
            </view>
          </view>

          <view class="form-section">
            <view class="section-heading">
              <view class="section-heading-main">
                <text class="section-index">🍴</text><text class="section-title">餐食信息</text>
              </view>
            </view>
            <view class="form-field">
              <view class="photo-label-row">
                <text class="field-label">餐食照片 <text class="optional">可选</text></text><text class="photo-count">{{ draft.imageUrls.length }}/{{ maxPhotos }}</text>
              </view>
              <view class="photo-grid">
                <view v-for="(url, index) in draft.imageUrls" :key="`${url}-${index}`" class="photo-tile">
                  <PrivateImage class="photo-image" :src="absoluteAssetUrl(url)" mode="aspectFit" @click="preview(url, draft.imageUrls)" /><view class="photo-remove" @click.stop="removeRecordImage(index)">
                    ×
                  </view>
                </view>
                <view v-if="draft.imageUrls.length < maxPhotos" class="photo-add" @click="chooseRecordImages">
                  <text class="photo-add-icon">{{ uploadingPhotos ? '◌' : '＋' }}</text><text>{{ uploadingPhotos ? '上传中' : '添加照片' }}</text>
                </view>
              </view>
              <text class="photo-help">上传完成后点击开始识别，AI 将结合全部照片推荐填写内容</text>
            </view>
            <view v-if="draft.imageUrls.length" class="ai-status" role="status" aria-live="polite">
              <text class="ai-status-title">✦ {{ recognizing ? 'AI 正在综合识别，建议会陆续出现…' : 'AI 餐食建议' }}</text>
              <text class="ai-status-hint">{{ recognitionStarted ? '点击建议填入，可随时修改或直接保存。' : '将当前全部照片作为一餐一起分析，增删照片后需重新识别。' }}</text>
              <button class="recognize-button" :disabled="uploadingPhotos || recognizing || draft.saving" :loading="recognizing" @click="startRecognition">
                {{ uploadingPhotos ? '照片上传中…' : recognizing ? '正在识别…' : recognitionErrors.length ? '重试识别' : recognitionStarted ? '重新识别' : '开始识别' }}
              </button>
              <view v-if="recognitionErrors.length" class="ai-error">
                <text>{{ recognitionErrors.join('；') }}</text>
              </view>
            </view>
            <view class="form-field">
              <text class="field-label required">饮食名称</text><input v-model="draft.name" class="form-input" placeholder="例如：番茄鸡蛋面" :maxlength="120">
              <view v-if="suggestedNames.length" class="ai-suggestions">
                <text class="suggestion-label">AI 名称建议 · 点击填入</text><view class="tag-picker">
                  <button v-for="name in suggestedNames" :key="name" class="suggestion-chip" :class="{ active: draft.name === name }" :disabled="draft.saving" @click="selectSuggestion('name', name)">
                    {{ name }}
                  </button>
                </view>
              </view>
            </view>
            <view class="form-field">
              <text class="field-label">饮食价格 <text class="optional">可选</text></text><view class="price-input-wrap">
                <text>¥</text><input :value="draft.price === null ? '' : String(draft.price)" type="digit" class="price-input" placeholder="0.00" @input="onPriceInput">
              </view>
            </view>
            <view class="optional-toggle" @click="showDescription = !showDescription">
              <text>{{ showDescription || draft.description ? '饮食描述（可选）' : '＋ 添加饮食描述（可选）' }}</text><text>{{ showDescription ? '⌃' : '⌄' }}</text>
            </view>
            <view v-if="showDescription || draft.description || suggestedDescriptions.length" class="description-field">
              <textarea v-model="draft.description" class="form-textarea" auto-height placeholder="记录口味、食材或这一餐的故事…" :maxlength="1000" />
            </view>
            <view v-if="suggestedDescriptions.length" class="ai-suggestions">
              <text class="suggestion-label">AI 描述建议 · 点击填入</text><view class="description-options">
                <button v-for="description in suggestedDescriptions" :key="description" class="suggestion-description" :class="{ active: draft.description === description }" :disabled="draft.saving" @click="selectSuggestion('description', description)">
                  {{ description }}
                </button>
              </view>
            </view>
          </view>

          <view class="form-section">
            <view class="section-heading">
              <view class="section-heading-main">
                <text class="section-index">♥</text><text class="section-title">这一餐的感受</text>
              </view>
            </view>
            <view class="mood-picker">
              <view v-for="(mood, index) in moodOptions" :key="mood.label" class="mood-choice" :class="[`mood-${index}`, { selected: draft.rating === 5 - index }]" @click="draft.rating = 5 - index">
                <text class="mood-icon">{{ mood.icon }}</text><text class="mood-label">{{ mood.label }}</text>
              </view>
            </view>
            <view class="optional-toggle tag-toggle" @click="showTagDetails = !showTagDetails">
              <text>{{ showTagDetails ? '具体感受（可选）' : `＋ 添加具体感受（可选）${draft.positiveTags.length + draft.negativeTags.length ? ` · 已选 ${draft.positiveTags.length + draft.negativeTags.length}` : ''}` }}</text><text>{{ showTagDetails ? '⌃' : '⌄' }}</text>
            </view>
            <view v-if="showTagDetails" class="tag-details">
              <view class="form-field">
                <text class="field-label">喜欢的地方 <text class="label-emoji">♡</text></text><view class="tag-picker">
                  <text v-for="tag in visiblePositiveTags" :key="tag" class="selectable-tag positive" :class="{ selected: draft.positiveTags.includes(tag) }" @click="toggleTag('positive', tag)">{{ tag }}</text>
                </view><view class="custom-tag-row">
                  <input v-model="customTags.positive" class="custom-tag-input" placeholder="自定义喜欢的地方" :maxlength="20" confirm-type="done" :disabled="draft.saving" @confirm="addCustomTag('positive')"><button size="mini" :disabled="!customTags.positive.trim() || draft.saving" @click="addCustomTag('positive')">
                    ＋ 添加
                  </button>
                </view>
              </view>
              <view class="form-field">
                <text class="field-label">可以更好的地方 <text class="label-emoji">✳</text></text><view class="tag-picker">
                  <text v-for="tag in visibleNegativeTags" :key="tag" class="selectable-tag negative" :class="{ selected: draft.negativeTags.includes(tag) }" @click="toggleTag('negative', tag)">{{ tag }}</text>
                </view><view class="custom-tag-row">
                  <input v-model="customTags.negative" class="custom-tag-input" placeholder="自定义可以更好的地方" :maxlength="20" confirm-type="done" :disabled="draft.saving" @confirm="addCustomTag('negative')"><button size="mini" :disabled="!customTags.negative.trim() || draft.saving" @click="addCustomTag('negative')">
                    ＋ 添加
                  </button>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>
    </scroll-view>

    <view class="action-bar pb-safe" :class="{ 'form-action': !!draft }">
      <button class="record-button" :disabled="!!draft && (!draft.name.trim() || draft.saving || uploadingPhotos)" :loading="draft?.saving" @click="handlePrimaryAction">
        <text>{{ !draft ? '开始记录这一餐' : '保存这一餐' }}</text><text v-if="!draft" class="action-arrow">→</text>
      </button>
    </view>
    <DateCalendar :visible="showDateCalendar && !!draft" :selected-date="draft?.date || formatDate(new Date())" mode="day" @close="showDateCalendar = false" @select="selectRecordDate" />
  </view>
</template>

<style scoped lang="scss">
.recognize-button { margin: 18rpx 0 0; padding: 0 26rpx; width: fit-content; border-radius: 18rpx; background: #4a8555; color: #fff; font-size: 24rpx; }
.recognize-button[disabled] { background: #e2e8dd; color: #8b9a87; }
.ai-status {
  padding: 22rpx;
  margin: 18rpx 0;
  border-radius: 20rpx;
  background: #eff6ed;
}
.ai-status-title,
.ai-status-hint,
.suggestion-label {
  display: block;
}
.ai-status-title {
  color: #39794c;
  font-size: 24rpx;
  font-weight: 600;
}
.ai-status-hint,
.suggestion-label {
  color: #748779;
  font-size: 22rpx;
  margin-top: 10rpx;
  line-height: 1.6;
}
.ai-error {
  color: #a65c41;
  font-size: 22rpx;
  margin-top: 14rpx;
  line-height: 1.6;
}
.ai-error button {
  display: block;
  margin: 12rpx 0 0;
  width: fit-content;
}
.ai-suggestions {
  margin-top: 12rpx;
}
.ai-suggestions .tag-picker {
  margin-top: 10rpx;
}
.suggestion-chip,
.suggestion-description {
  margin: 0;
  background: #f3f7f0;
  border: 1rpx solid #dce8d7;
  color: #4e6e51;
  font-size: 23rpx;
  font-weight: 400;
  text-align: left;
  line-height: 1.6;
}
.suggestion-chip {
  padding: 10rpx 18rpx;
  border-radius: 24rpx;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.suggestion-description {
  padding: 16rpx 20rpx;
  border-radius: 16rpx;
  width: 100%;
  overflow-wrap: anywhere;
}
.suggestion-chip::after,
.suggestion-description::after {
  border: 0;
}
.suggestion-chip.active,
.suggestion-description.active {
  border-color: #65a570;
  background: #e0efdd;
  color: #27683a;
}
.description-options {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-top: 10rpx;
}
.custom-tag-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 18rpx;
}
.custom-tag-input {
  flex: 1;
  min-width: 0;
  height: 66rpx;
  padding: 0 18rpx;
  border: 1rpx solid #e3e9de;
  border-radius: 14rpx;
  background: #fbfcf8;
  font-size: 23rpx;
}
.custom-tag-row button {
  flex-shrink: 0;
  margin: 0;
  background: #edf4e8;
  color: #4a7748;
}

.record-page { --sd-header-meta-height: 60rpx; --header-height: calc(var(--sd-status-bar-height, env(safe-area-inset-top)) + var(--sd-nav-height, 44px) + var(--sd-header-meta-height)); --action-height: 126rpx; --tabbar-height: 100rpx; height: 100%; min-height: 0; background: #f7f8f3; color: #244532; }
.header-score { display: flex; align-items: center; gap: 9rpx; color: #7b907d; font-size: 19rpx; line-height: 28rpx; }
.header-score-value { color: #2f7b4b; font-size: 24rpx; font-weight: 750; }
.record-scroll { position: fixed; top: var(--header-height); right: 0; bottom: calc(var(--action-height) + var(--tabbar-height) + env(safe-area-inset-bottom)); left: 0; }
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
.action-bar { box-sizing: border-box; position: fixed; z-index: 2; right: 0; bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom)); left: 0; height: calc(var(--action-height) + env(safe-area-inset-bottom)); padding: 15rpx 22rpx calc(16rpx + env(safe-area-inset-bottom)); background: rgba(255, 255, 255, 0.98); border-top: 1rpx solid #e9eee7; }
.record-button { width: 100%; height: 94rpx; border: 0; border-radius: 21rpx; color: #fff; background: #269b58; box-shadow: 0 8rpx 21rpx rgba(38, 155, 88, 0.19); font-size: 26rpx; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 13rpx; }
.record-button[disabled] { color: #93aa9a; background: #e5eee6; box-shadow: none; }
.record-button::after { border: 0; }
.action-icon { font-size: 29rpx; }
.action-arrow { margin-left: 4rpx; font-size: 29rpx; }

/* SmartDiet editorial theme shared with the concept preview. */
.record-page { background: #faf8f1; color: var(--sd-forest); }
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
.action-bar { background: rgba(255, 254, 251, 0.98); border-top-color: #f0eee5; }
.record-button { border-radius: 999rpx; background: linear-gradient(120deg, #438d58, #276e45); box-shadow: 0 12rpx 24rpx rgba(45, 111, 68, 0.2); }
.record-button { position: relative; }
.action-arrow { position: absolute; right: 28rpx; margin-left: 0; }
.photo-label-row { display: flex; align-items: center; justify-content: space-between; }
.photo-count { color: #7c927e; font-size: 20rpx; }
.photo-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 13rpx; }
.photo-tile, .photo-add { position: relative; height: 166rpx; border-radius: 20rpx; overflow: hidden; }
.photo-tile {
  background: #f4f6f1;
}
.photo-image {
  display: block;
  width: 100%;
  height: 100%;
}
.photo-remove { position: absolute; top: 7rpx; right: 7rpx; width: 35rpx; height: 35rpx; border-radius: 50%; color: #fff; background: rgba(31, 50, 37, 0.74); font-size: 29rpx; line-height: 33rpx; text-align: center; }
.photo-add { border: 2rpx dashed #b9cfb2; background: #f6f9ef; color: #68866a; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5rpx; font-size: 19rpx; }
.photo-add-icon { color: #4b8752; font-size: 49rpx; line-height: 1; font-weight: 300; }
.photo-help { display: block; margin-top: 11rpx; color: #9ba99b; font-size: 18rpx; }

/* The entry form follows the warm botanical meal-journal preview. */
.record-page-form { --sd-header-meta-height: 0rpx; background: #faf8f1; }
.form-content { padding: 0 11rpx 26rpx; }
.form-layout { gap: 13rpx; }
.form-hero { min-height: 166rpx; padding: 11rpx 7rpx 0; overflow: visible; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.form-title { z-index: 1; max-width: 76%; margin-top: 4rpx; color: #14382b; font-size: 37rpx; font-weight: 850; line-height: 1.25; }
.form-title-underline { width: 55rpx; height: 6rpx; margin-top: 13rpx; border-radius: 999rpx; background: #75a268; }
.form-art { top: -24rpx; right: -5rpx; width: 174rpx; height: 129rpx; filter: drop-shadow(0 7rpx 8rpx rgba(62, 66, 33, 0.15)); }
.record-fields { flex-wrap: nowrap; align-items: stretch; gap: 8rpx; margin-top: 19rpx; }
.date-trigger { box-sizing: border-box; flex: 1.95; min-width: 0; height: 65rpx; padding: 0 8rpx; border: 1rpx solid #efede5; border-radius: 16rpx; background: #fff; box-shadow: 0 5rpx 13rpx rgba(47, 58, 42, 0.05); display: flex; align-items: center; justify-content: center; gap: 7rpx; }
.date-icon { color: #839888; font-size: 26rpx; }
.date-copy { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; }
.date-relative { color: #315c3c; font-size: 20rpx; font-weight: 800; line-height: 1.2; }
.date-value { color: #829085; font-size: 16rpx; line-height: 1.2; white-space: nowrap; }
.pill-arrow { margin-left: 0; color: #9ba69b; font-size: 19rpx; }
.meal-choice { flex: 1; min-width: 0; height: 65rpx; border: 1rpx solid #efece5; border-radius: 16rpx; background: #fff; box-shadow: 0 5rpx 13rpx rgba(47, 58, 42, 0.05); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rpx; }
.meal-choice.active { border-color: #7ca773; background: linear-gradient(135deg, #8bae7b, #56875d); box-shadow: 0 5rpx 13rpx rgba(67, 110, 68, 0.18); }
.meal-choice-icon { font-size: 25rpx; line-height: 1; }
.meal-choice-label { color: #8b9487; font-size: 15rpx; font-weight: 650; line-height: 1; }
.meal-choice.active .meal-choice-label { color: #fff; }
.form-section { padding: 12rpx 13rpx 15rpx; border: 0; border-radius: 19rpx; background: #fff; box-shadow: 0 5rpx 17rpx rgba(65, 73, 50, 0.045); }
.section-heading { box-sizing: border-box; min-height: 47rpx; padding: 0 10rpx; border-radius: 12rpx; background: linear-gradient(90deg, #eaf2e9, #f5f8f3); }
.section-heading-main { gap: 9rpx; }
.section-index { width: 30rpx; height: 30rpx; border-radius: 9rpx; color: #579159; background: transparent; font-size: 25rpx; font-weight: 800; }
.section-title { color: #183c2d; font-size: 21rpx; font-weight: 780; }
.form-field { margin-top: 15rpx; }
.field-label { margin-bottom: 7rpx; color: #344b3b; font-size: 19rpx; font-weight: 700; }
.optional { color: #9aa99a; font-size: 17rpx; }
.form-input, .form-textarea, .price-input-wrap { border-color: #e8eae4; border-radius: 14rpx; background: #fafbf9; }
.form-input { height: 60rpx; padding: 0 15rpx; font-size: 20rpx; }
.form-textarea { min-height: 82rpx; padding: 12rpx 15rpx; font-size: 19rpx; }
.photo-label-row .field-label { margin-bottom: 7rpx; }
.photo-count { font-size: 16rpx; }
.photo-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8rpx; }
.photo-tile, .photo-add { height: 93rpx; border-radius: 13rpx; }
.photo-add { border: 1rpx dashed #cbd8c8; background: #f9fbf8; gap: 0; font-size: 14rpx; }
.photo-add-icon { color: #899c8d; font-size: 38rpx; }
.photo-remove { top: 3rpx; right: 3rpx; width: 26rpx; height: 26rpx; font-size: 21rpx; line-height: 24rpx; }
.photo-help { margin-top: 6rpx; font-size: 15rpx; }
.optional-toggle { display: flex; align-items: center; justify-content: space-between; min-height: 38rpx; margin-top: 10rpx; padding: 0 4rpx; border-top: 1rpx solid #f0f2ed; color: #5b8265; font-size: 17rpx; font-weight: 650; }
.description-field { margin-top: 4rpx; }
.mood-picker { display: flex; gap: 7rpx; margin-top: 12rpx; }
.mood-choice { flex: 1; min-width: 0; height: 59rpx; border: 1rpx solid transparent; border-radius: 999rpx; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rpx; }
.mood-0 { background: #e1f0e0; }.mood-1 { background: #fff1d5; }.mood-2 { background: #fff0e4; }.mood-3 { background: #ffe4e0; }.mood-4 { background: #e9e5f7; }
.mood-choice.selected { border-color: #70a16b; box-shadow: inset 0 0 0 2rpx #acd3a7, 0 3rpx 8rpx rgba(78, 118, 78, 0.12); }
.mood-icon { font-size: 29rpx; line-height: 1; }
.mood-label { color: #748375; font-size: 12rpx; line-height: 1; }
.tag-toggle { margin-top: 10rpx; }
.tag-details .form-field { margin-top: 13rpx; }
.selectable-tag { padding: 8rpx 13rpx; font-size: 17rpx; }
.price-input-wrap { height: 57rpx; padding: 0 14rpx; font-size: 22rpx; }
.price-input { font-size: 20rpx; }
.form-action { height: 89rpx; padding: 6rpx 11rpx 8rpx; border-top: 0; background: linear-gradient(180deg, rgba(250, 248, 241, 0), #faf8f1 25%); }
.form-action .record-button { height: 71rpx; border-radius: 999rpx; font-size: 24rpx; background: linear-gradient(110deg, #4b9061, #287049); box-shadow: 0 7rpx 15rpx rgba(30, 96, 56, 0.16); }
.form-action .record-button[disabled] { color: #fff; background: linear-gradient(110deg, #a4bcaa, #8cab96); box-shadow: none; }
</style>
