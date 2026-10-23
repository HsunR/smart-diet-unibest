import type { FoodDraft } from '@/store/chat'
import type { MealSuggestionEvent, StreamControl } from '@/api/smartdiet'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, reactive, ref, watch } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import RecordPage from './index.vue'

const mocks = vi.hoisted(() => ({
  store: { draft: null as FoodDraft | null },
  create: vi.fn(),
  upload: vi.fn(),
  stream: vi.fn(),
}))
vi.mock('@/store', () => ({
  useChatStore: () => mocks.store,
  useTokenStore: () => ({ updateNowTime: () => ({ hasLogin: true }) }),
}))
vi.mock('@/api/smartdiet', () => ({
  absoluteAssetUrl: (url: string) => url,
  createRecord: mocks.create,
  getRecords: async () => [],
  uploadFoodImage: mocks.upload,
  streamMealSuggestions: mocks.stream,
}))
vi.mock('@/components/DateCalendar.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/utils/smartdiet', () => ({
  chooseImages: async () => ['local-a', 'local-b'],
  formatDate: () => '2026-10-22',
  getCurrentMealType: () => 'lunch',
  mealOptions: [],
  relativeDateLabel: () => '今天',
  shortDateLabel: () => '10月22日',
}))

beforeEach(() => {
  for (const [name, value] of Object.entries({ ref, computed, reactive, watch, definePage: () => {}, onLoad: (fn: () => void) => fn(), onShow: () => {} }))
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
