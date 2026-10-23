import type { MealType } from '@/api/types/smartdiet'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  type: 'text' | 'image'
  content: string
  imageUrl?: string
  streaming?: boolean
}

export interface FoodDraft {
  /** 餐食图片；用户点击识别后，整组图片一起生成名称和描述候选。 */
  imageUrls: string[]
  /** 兼容升级前保存在本地的草稿。 */
  localImageUrl?: string
  imageUrl?: string
  date: string
  mealType: MealType
  name: string
  description: string
  positiveTags: string[]
  negativeTags: string[]
  price: number | null
  rating: number
  saving: boolean
  saved: boolean
}

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const welcome = '欢迎使用饮食记录。填写每一餐的名称、感受、标签和星级，建立自己的饮食记录。'

export const useChatStore = defineStore('smartdiet-chat', () => {
  const messages = ref<UiMessage[]>([])
  const draft = ref<FoodDraft | null>(null)
  const conversationId = ref('')

  function ensureWelcome() {
    if (!messages.value.length)
      messages.value = [{ id: id(), role: 'assistant', type: 'text', content: welcome }]
  }

  function addMessage(message: Omit<UiMessage, 'id'>) {
    const item = { id: id(), ...message }
    messages.value.push(item)
    return item
  }

  function clear() {
    messages.value = []
    draft.value = null
    conversationId.value = ''
    ensureWelcome()
  }

  return { messages, draft, conversationId, ensureWelcome, addMessage, clear }
}, { persist: true })
