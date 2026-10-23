import type { Ref } from 'vue'
import type { StreamControl } from '@/api/smartdiet'
import type { FoodDraft } from '@/store/chat'
import { onScopeDispose, ref, watch } from 'vue'
import { streamMealSuggestions } from '@/api/smartdiet'

/** 管理整组照片的手动识别、流式候选和请求生命周期。 */
export function useMealSuggestions(draft: Ref<FoodDraft | null>, uploading = ref(false)) {
  const names = ref<string[]>([])
  const descriptions = ref<string[]>([])
  const loading = ref(false)
  const errors = ref<string[]>([])
  const hasStarted = ref(false)
  let activeRequest: StreamControl | undefined

  /** 先使旧请求失效，再取消连接并清空候选；保留用户已填写的表单。 */
  function reset() {
    const previous = activeRequest
    activeRequest = undefined
    previous?.cancel?.()
    names.value = []
    descriptions.value = []
    errors.value = []
    loading.value = false
    hasStarted.value = false
  }

  /** 在上传结束且无识别请求进行时，将当前照片快照一次性提交给后端。 */
  async function start() {
    const currentDraft = draft.value
    if (!currentDraft || currentDraft.saving || uploading.value || loading.value || !currentDraft.imageUrls.length)
      return
    reset()
    const control: StreamControl = {}
    activeRequest = control
    const imageUrls = currentDraft.imageUrls.slice()
    // 请求身份用于拦截增删照片、重新识别或关闭草稿后的迟到回复。
    const current = () => activeRequest === control
    loading.value = true
    hasStarted.value = true
    let terminal = false
    try {
      await streamMealSuggestions(imageUrls, (event) => {
        if (!current() || terminal)
          return
        if (event.type === 'suggestion') {
          const { field, value } = event.data
          if ((field !== 'name' && field !== 'description') || typeof value !== 'string')
            return
          const text = value.trim()
          const limit = field === 'name' ? 120 : 1000
          const options = field === 'name' ? names.value : descriptions.value
          if (text && text.length <= limit && !options.includes(text) && options.length < 6)
            options.push(text)
        }
        else if (event.type === 'error' || event.type === 'done') {
          terminal = true
          if (event.type === 'error')
            errors.value = [event.data.message || '识别失败，请重试']
          else if (!names.value.length && !descriptions.value.length)
            errors.value = ['没有识别到可用建议，请重试或手动填写']
          loading.value = false
          control.cancel?.()
        }
      }, control)
      if (current() && !terminal)
        errors.value = ['识别连接已中断，可重试；已有建议仍可选择']
    }
    catch (error) {
      if (current())
        errors.value = [error instanceof Error ? error.message : '识别失败，请重试或手动填写']
    }
    finally {
      if (current())
        loading.value = false
    }
  }

  // 候选属于整组照片；草稿或图片列表改变后全部失效，等待用户重新点击识别。
  watch(() => draft.value, reset, { flush: 'sync' })
  watch(() => JSON.stringify(draft.value?.imageUrls || []), reset, { flush: 'sync' })
  onScopeDispose(reset)

  return { names, descriptions, loading, errors, hasStarted, start }
}
