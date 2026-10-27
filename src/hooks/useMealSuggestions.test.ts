import type { FoodDraft } from '@/store/record'
import type { MealSuggestionEvent, StreamControl } from '@/api/smartdiet'
import { effectScope, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { streamMealSuggestions } from '@/api/smartdiet'
import { useMealSuggestions } from './useMealSuggestions'

vi.mock('@/api/smartdiet', () => ({ streamMealSuggestions: vi.fn() }))

function makeDraft(urls: string[]): FoodDraft {
  return { imageUrls: urls, date: '2026-10-22', mealType: 'lunch', name: '自己填写', description: '', positiveTags: [], negativeTags: [], price: null, rating: 0, saving: false, saved: false }
}

describe('meal suggestions lifecycle', () => {
  let calls: { urls: string[], emit: (event: MealSuggestionEvent) => void, cancel: ReturnType<typeof vi.fn>, finish: () => void }[]
  beforeEach(() => {
    calls = []
    vi.mocked(streamMealSuggestions).mockImplementation((urls, emit, control: StreamControl) => new Promise<void>((resolve) => {
      const cancel = vi.fn(resolve)
      control.cancel = cancel
      calls.push({ urls, emit, cancel, finish: resolve })
    }))
  })

  it('waits for a click and sends the entire batch once, exposing suggestions before completion', () => {
    const draft = ref<FoodDraft | null>(makeDraft([]))
    const uploading = ref(true)
    const scope = effectScope()
    const suggestions = scope.run(() => useMealSuggestions(draft, uploading))!
    draft.value!.imageUrls.push('photo-a', 'photo-b')
    expect(calls).toHaveLength(0)
    void suggestions.start()
    expect(calls).toHaveLength(0)
    uploading.value = false
    void suggestions.start()
    void suggestions.start()
    expect(calls).toHaveLength(1)
    expect(calls[0].urls).toEqual(['photo-a', 'photo-b'])
    calls[0].emit({ type: 'suggestion', data: { field: 'name', value: '牛肉配米饭' } })
    calls[0].emit({ type: 'suggestion', data: { field: 'name', value: '牛肉配米饭' } })
    expect(suggestions.names.value).toEqual(['牛肉配米饭'])
    expect(suggestions.loading.value).toBe(true)
    expect(draft.value!.name).toBe('自己填写')
    scope.stop()
    expect(calls[0].cancel).toHaveBeenCalledOnce()
  })

  it('invalidates the full batch when photos change and ignores late replies without auto restarting', () => {
    const draft = ref<FoodDraft | null>(makeDraft(['photo-a']))
    const scope = effectScope()
    const suggestions = scope.run(() => useMealSuggestions(draft))!
    void suggestions.start()
    calls[0].emit({ type: 'suggestion', data: { field: 'name', value: '旧结果' } })
    draft.value!.imageUrls.push('photo-b')
    expect(calls).toHaveLength(1)
    expect(calls[0].urls).toEqual(['photo-a'])
    expect(calls[0].cancel).toHaveBeenCalledOnce()
    expect(suggestions.names.value).toEqual([])
    expect(suggestions.hasStarted.value).toBe(false)
    void suggestions.start()
    calls[0].emit({ type: 'suggestion', data: { field: 'name', value: '已过期' } })
    calls[1].emit({ type: 'suggestion', data: { field: 'description', value: '米饭配蔬菜' } })
    expect(suggestions.names.value).toEqual([])
    expect(suggestions.descriptions.value).toEqual(['米饭配蔬菜'])
    draft.value!.imageUrls.splice(0, 1)
    expect(suggestions.descriptions.value).toEqual([])
    expect(calls[1].cancel).toHaveBeenCalledOnce()
    void suggestions.start()
    draft.value = makeDraft(['photo-b'])
    expect(calls[2].cancel).toHaveBeenCalledOnce()
    expect(calls).toHaveLength(3)
    scope.stop()
  })

  it('retains partial results on failure and retries the whole batch with a fresh request', async () => {
    const draft = ref<FoodDraft | null>(makeDraft(['photo-a', 'photo-b']))
    const scope = effectScope()
    const suggestions = scope.run(() => useMealSuggestions(draft))!
    void suggestions.start()
    calls[0].emit({ type: 'suggestion', data: { field: 'name', value: '鸡蛋面' } })
    calls[0].emit({ type: 'error', data: { message: '暂时失败' } })
    expect(suggestions.names.value).toEqual(['鸡蛋面'])
    expect(suggestions.errors.value).toEqual(['暂时失败'])
    void suggestions.start()
    expect(calls.map(call => call.urls)).toEqual([['photo-a', 'photo-b'], ['photo-a', 'photo-b']])
    calls[0].emit({ type: 'suggestion', data: { field: 'name', value: '已过期' } })
    expect(suggestions.names.value).toEqual([])
    calls[1].finish()
    await Promise.resolve()
    expect(suggestions.errors.value[0]).toContain('中断')
    scope.stop()
  })

  it('does not request without photos and allows a new recognition after completion', () => {
    const draft = ref<FoodDraft | null>(makeDraft([]))
    const scope = effectScope()
    const suggestions = scope.run(() => useMealSuggestions(draft))!
    void suggestions.start()
    expect(calls).toHaveLength(0)
    draft.value!.imageUrls.push('photo-a')
    void suggestions.start()
    calls[0].emit({ type: 'suggestion', data: { field: 'name', value: '米饭' } })
    calls[0].emit({ type: 'done', data: {} })
    expect(suggestions.loading.value).toBe(false)
    expect(suggestions.hasStarted.value).toBe(true)
    expect(suggestions.errors.value).toEqual([])
    void suggestions.start()
    expect(calls).toHaveLength(2)
    scope.stop()
  })
})
