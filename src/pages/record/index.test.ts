import type { FoodDraft } from '@/store/record'
import type { MealSuggestionEvent, StreamControl } from '@/api/smartdiet'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, reactive, ref, watch } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { formatDate, startOfWeek } from '@/utils/smartdiet'
import ReportPage from '../report/index.vue'
import RecordPage from './index.vue'

const mocks = vi.hoisted(() => ({
  store: { draft: null as FoodDraft | null },
  create: vi.fn(),
  upload: vi.fn(),
  stream: vi.fn(),
  showHooks: [] as (() => void)[],
  history: vi.fn(),
}))
vi.mock('@/store', () => ({
  useRecordStore: () => mocks.store,
  useTokenStore: () => ({ updateNowTime: () => ({ hasLogin: true }) }),
}))
vi.mock('@/api/smartdiet', () => ({
  absoluteAssetUrl: (url: string) => url,
  createRecord: mocks.create,
  getRecords: async () => [],
  uploadFoodImage: mocks.upload,
  streamMealSuggestions: mocks.stream,
  getRecordHistory: mocks.history,
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
}))
vi.mock('@/components/DateCalendar.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/SmartDietHeader.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/hooks/usePageHeader', () => ({ usePageHeader: () => ({ pageHeaderStyle: {} }) }))
vi.mock('@/utils/smartdiet', async importOriginal => ({
  ...await importOriginal<typeof import('@/utils/smartdiet')>(),
  chooseImages: async () => ['local-a', 'local-b'],
  getCurrentMealType: () => 'lunch',
}))

beforeEach(() => {
  uni.stopPullDownRefresh = vi.fn()
  mocks.showHooks = []
  mocks.history.mockResolvedValue([])
  const storage = new Map<string, unknown>()
  vi.mocked(uni.getStorageSync).mockImplementation(key => storage.get(key))
  vi.mocked(uni.setStorageSync).mockImplementation((key, value) => {
    storage.set(key, value)
  })
  vi.mocked(uni.removeStorageSync).mockImplementation((key) => {
    storage.delete(key)
  })
  for (const [name, value] of Object.entries({ ref, computed, reactive, watch, definePage: () => {}, onLoad: (fn: () => void) => fn(), onShow: (fn: () => void) => mocks.showHooks.push(fn), onPullDownRefresh: () => {} }))
    vi.stubGlobal(name, value)
  mocks.store = reactive({ draft: {
    imageUrls: [],
    date: '2026-10-22',
    mealType: 'lunch',
    name: '',
    description: '',
    positiveTags: [],
    negativeTags: [],
    price: null,
    rating: 0,
    saving: false,
    saved: false,
  } })
  mocks.create.mockResolvedValue({})
})
afterEach(() => vi.unstubAllGlobals())

it('waits for uploads and an explicit click, sends all photos once, and saves partial suggestions with custom tags', async () => {
  const uploads: ((value: { url: string }) => void)[] = []
  mocks.upload.mockImplementation(() => new Promise(resolve => uploads.push(resolve)))
  const streams: { emit: (event: MealSuggestionEvent) => void, cancel: ReturnType<typeof vi.fn> }[] = []
  mocks.stream.mockImplementation((_urls: string[], emit: (event: MealSuggestionEvent) => void, control: StreamControl) => new Promise<void>((resolve) => {
    control.cancel = vi.fn(resolve)
    streams.push({ emit, cancel: control.cancel as ReturnType<typeof vi.fn> })
  }))
  const wrapper = mount(RecordPage, {
    global: { stubs: { 'scroll-view': { template: '<div><slot /></div>' } } },
  })
  await wrapper.find('.photo-add').trigger('click')
  await flushPromises()
  uploads[1]({ url: 'photo-b' })
  await flushPromises()
  expect(streams).toHaveLength(0)
  expect(wrapper.find('.recognize-button').attributes('disabled')).toBeDefined()
  await wrapper.find('.recognize-button').trigger('click')
  expect(streams).toHaveLength(0)
  uploads[0]({ url: 'photo-a' })
  await flushPromises()
  expect(streams).toHaveLength(0)
  expect(wrapper.find('.photo-help').text()).toContain('点击开始识别')
  await wrapper.find('.recognize-button').trigger('click')
  expect(streams).toHaveLength(1)
  expect(mocks.stream).toHaveBeenCalledWith(['photo-a', 'photo-b'], expect.any(Function), expect.any(Object))
  await wrapper.find('.recognize-button').trigger('click')
  expect(streams).toHaveLength(1)
  streams[0].emit({ type: 'suggestion', data: { field: 'name', value: '鸡蛋面' } })
  streams[0].emit({ type: 'suggestion', data: { field: 'description', value: '面条配鸡蛋' } })
  await flushPromises()
  expect(wrapper.find('.ai-status-title').text()).toContain('正在综合识别')
  await wrapper.find('.suggestion-chip').trigger('click')
  await wrapper.find('.suggestion-description').trigger('click')
  expect(mocks.store.draft?.name).toBe('鸡蛋面')
  expect(mocks.store.draft?.description).toBe('面条配鸡蛋')
  const inputs = wrapper.findAll('.custom-tag-input')
  await inputs[0].setValue('面条很筋道')
  await wrapper.find('.custom-tag-row button').trigger('click')
  expect(wrapper.find('.tag-details').text()).toContain('面条很筋道')
  await inputs[1].setValue('汤可以再热一点')
  await wrapper.find('.record-button').trigger('click')
  await flushPromises()
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
    name: '鸡蛋面',
    description: '面条配鸡蛋',
    imageUrls: ['photo-a', 'photo-b'],
    positiveTags: ['面条很筋道'],
    negativeTags: ['汤可以再热一点'],
  }))
  expect(mocks.store.draft).toBeNull()
  expect(streams.every(stream => stream.cancel.mock.calls.length > 0)).toBe(true)
  wrapper.unmount()
})

const mountOptions = { global: { stubs: { 'scroll-view': { template: '<div><slot /></div>' }, 'swiper': true, 'swiper-item': true, 'picker': true } } }

it.each(['breakfast', 'lunch', 'dinner', 'other'] as const)('opens an empty report cell directly at its date and %s meal', async (mealType) => {
  mocks.store.draft = null
  const form = mount(RecordPage, mountOptions)
  const onFormShow = mocks.showHooks[0]
  const report = mount(ReportPage, mountOptions)
  const mealIndex = ['breakfast', 'lunch', 'dinner', 'other'].indexOf(mealType)
  const selectedDate = startOfWeek(new Date())
  selectedDate.setDate(selectedDate.getDate() + 2)
  await report.findAll('.record-cell')[mealIndex * 7 + 2].trigger('click')
  expect(uni.showModal).not.toHaveBeenCalled()
  expect(uni.switchTab).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/record/index' }))
  expect(uni.getStorageSync('pendingRecord')).toEqual({ date: formatDate(selectedDate), mealType })
  onFormShow()
  await flushPromises()
  expect(form.find('.form-layout').exists()).toBe(true)
  expect(mocks.store.draft).toEqual(expect.objectContaining({ date: formatDate(selectedDate), mealType }))
  expect(uni.getStorageSync('pendingRecord')).toBeUndefined()
  // 缓存页面再次显示时，不重复初始化或覆盖用户输入。
  mocks.store.draft!.name = '目标日期的餐食'
  onFormShow()
  await flushPromises()
  expect(mocks.store.draft!.name).toBe('目标日期的餐食')
  await form.find('.record-button').trigger('click')
  await flushPromises()
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ date: formatDate(selectedDate), mealType }))
  report.unmount()
  form.unmount()
})

it('keeps an unsaved draft on cancel and starts at the requested date after confirmation', async () => {
  mocks.store.draft!.name = '尚未保存的午餐'
  const form = mount(RecordPage, mountOptions)
  const target = { date: '2025-12-31', mealType: 'dinner' }
  uni.setStorageSync('pendingRecord', target)
  mocks.showHooks[0]()
  const firstModal = vi.mocked(uni.showModal).mock.calls.at(-1)![0]!
  firstModal.success!({ confirm: false, cancel: true, errMsg: 'showModal:ok' })
  expect(mocks.store.draft!.name).toBe('尚未保存的午餐')
  expect(mocks.store.draft!.date).toBe('2026-10-22')
  expect(uni.getStorageSync('pendingRecord')).toBeUndefined()
  uni.setStorageSync('pendingRecord', target)
  mocks.showHooks[0]()
  const secondModal = vi.mocked(uni.showModal).mock.calls.at(-1)![0]!
  secondModal.success!({ confirm: true, cancel: false, errMsg: 'showModal:ok' })
  await flushPromises()
  expect(mocks.store.draft).toEqual(expect.objectContaining({ ...target, name: '' }))
  form.unmount()
})

it('continues a matching draft without confirmation and rejects invalid pending dates', () => {
  mocks.store.draft!.name = '继续编辑'
  const form = mount(RecordPage, mountOptions)
  uni.setStorageSync('pendingRecord', { date: '2026-10-22', mealType: 'lunch' })
  mocks.showHooks[0]()
  expect(uni.showModal).not.toHaveBeenCalled()
  expect(mocks.store.draft!.name).toBe('继续编辑')
  uni.setStorageSync('pendingRecord', { date: '2026-02-30', mealType: 'lunch' })
  mocks.showHooks[0]()
  expect(mocks.store.draft!.date).toBe('2026-10-22')
  expect(uni.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '记录日期或餐次无效，请重新选择' }))
  form.unmount()
})

it('clears the pending target when navigation fails', async () => {
  const report = mount(ReportPage, mountOptions)
  await report.findAll('.record-cell')[0].trigger('click')
  const navigation = vi.mocked(uni.switchTab).mock.calls.at(-1)![0]
  navigation.fail!({ errMsg: 'switchTab:fail' })
  expect(uni.getStorageSync('pendingRecord')).toBeUndefined()
  expect(uni.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '打开记录页失败，请重试', icon: 'none' }))
  report.unmount()
})

it('expands and collapses the weekly calendar without changing the selected week', async () => {
  const report = mount(ReportPage, mountOptions)
  const range = report.find('.week-range').text()
  await report.find('.expand-button').trigger('click')
  expect(report.classes()).toContain('report-page-expanded')
  expect(report.find('.expanded-header').text()).toContain('一周记录')
  expect(report.find('.summary-row').exists()).toBe(false)
  expect(report.find('.trend-card').exists()).toBe(false)
  expect(report.findAll('.record-cell')).toHaveLength(28)
  expect(report.find('.week-range').text()).toBe(range)
  await report.find('.collapse-button').trigger('click')
  expect(report.classes()).not.toContain('report-page-expanded')
  expect(report.find('.summary-row').exists()).toBe(true)
  expect(report.find('.week-range').text()).toBe(range)
  report.unmount()
})

it('preserves photo cells and carousel in expanded mode, opens the selected record, and switches weeks', async () => {
  const date = formatDate(startOfWeek(new Date()))
  const record = {
    id: 'first',
    userId: 'user',
    date,
    mealType: 'lunch',
    name: '第一份午餐',
    description: '米饭配蔬菜',
    rating: 4,
    price: 18,
    positiveTags: [],
    negativeTags: [],
    imageUrls: ['https://example.test/meal.jpg'],
    createdAt: '',
  }
  mocks.history.mockResolvedValue([record, { ...record, id: 'second', name: '第二份午餐', rating: 5 }])
  const report = mount(ReportPage, mountOptions)
  mocks.showHooks[0]()
  await flushPromises()
  await report.find('.expand-button').trigger('click')
  const cell = report.findAll('.record-cell')[7]
  expect(cell.findAll('.record-slide')).toHaveLength(4)
  expect(cell.find('.cell-image').attributes('src')).toBe('https://example.test/meal.jpg')
  expect(cell.find('.cell-score').text()).toBe('4★')
  expect(cell.find('.record-count').text()).toBe('1/2')
  await cell.findAll('.record-slide')[1].trigger('click')
  expect(report.find('.detail-meal-name').text()).toBe('第二份午餐')
  await report.find('.close-button').trigger('click')
  expect(report.classes()).toContain('report-page-expanded')
  const previousRange = report.find('.week-range').text()
  mocks.history.mockResolvedValue([])
  await report.findAll('.nav-button')[1].trigger('click')
  await flushPromises()
  expect(report.find('.week-range').text()).not.toBe(previousRange)
  expect(report.findAll('.record-slide')).toHaveLength(0)
  expect(report.classes()).toContain('report-page-expanded')
  report.unmount()
})

it('exits expanded mode and passes the exact selected cell to the add-record page', async () => {
  const report = mount(ReportPage, mountOptions)
  await report.find('.expand-button').trigger('click')
  await report.findAll('.record-cell')[23].trigger('click')
  const date = startOfWeek(new Date())
  date.setDate(date.getDate() + 2)
  expect(uni.getStorageSync('pendingRecord')).toEqual({ date: formatDate(date), mealType: 'other' })
  expect(uni.switchTab).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/record/index' }))
  expect(report.classes()).not.toContain('report-page-expanded')
  report.unmount()
})
