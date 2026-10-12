import type { FoodItem, MealOverview, MealType } from '@/api/types/smartdiet'
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
  localImageUrl: string
  imageUrl: string
  date: string
  mealType: MealType
  name: string
  description: string
  positiveTags: string[]
  negativeTags: string[]
  price: number | null
  rating: number
  foods: FoodItem[]
  mealOverview: MealOverview
  dietaryAdvice: string
  recognizing: boolean
  saving: boolean
  saved: boolean
}

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const welcome = '您好！我是您的饮食记录助手 🥗\n\n上传一张餐食照片后，填写名称、描述、标签、价格、日期和星级，即可保存这餐记录。'

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
