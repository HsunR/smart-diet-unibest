import type { MealType } from '@/api/types/smartdiet'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface FoodDraft {
  /** 餐食图片；用户点击识别后，整组图片一起生成名称和描述候选。 */
  imageUrls: string[]
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

const storageKey = 'smartdiet-record'

export const useRecordStore = defineStore(storageKey, () => {
  const draft = ref<FoodDraft | null>(null)

  function clear() {
    draft.value = null
  }

  return { draft, clear }
}, { persist: true })
