import type { MealType } from '@/api/types/smartdiet'

export const mealOptions: Array<{ value: MealType, label: string, icon: string }> = [
  { value: 'breakfast', label: '早餐', icon: '🌅' },
  { value: 'lunch', label: '午餐', icon: '☀️' },
  { value: 'dinner', label: '晚餐', icon: '🌙' },
  { value: 'other', label: '其他', icon: '🍎' },
]

export function formatDate(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function startOfWeek(date: Date) {
  const result = new Date(date)
  const day = result.getDay()
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1))
  result.setHours(0, 0, 0, 0)
  return result
}

export function getCurrentMealType(): MealType {
  const hour = new Date().getHours()
  if (hour < 10)
    return 'breakfast'
  if (hour < 15)
    return 'lunch'
  if (hour < 21)
    return 'dinner'
  return 'other'
}

export function mealLabel(value: MealType) {
  return mealOptions.find(item => item.value === value)?.label || '其他'
}

export function chooseImage(sourceType: Array<'camera' | 'album'> = ['camera', 'album']) {
  return new Promise<string>((resolve, reject) => {
    // `chooseMedia` is not implemented by the H5 runtime used by this project.
    // `chooseImage` provides the same single-image flow on H5 and mini programs.
    uni.chooseImage({
      count: 1,
      sourceType,
      sizeType: ['compressed'],
      success(result) {
        const path = result.tempFilePaths?.[0]
        path ? resolve(path) : reject(new Error('没有选择图片'))
      },
      fail(error) {
        reject(new Error(error.errMsg || '选择图片失败'))
      },
    })
  })
}

export function chooseImages(count: number) {
  return new Promise<string[]>((resolve, reject) => {
    uni.chooseImage({
      count,
      sourceType: ['camera', 'album'],
      sizeType: ['compressed'],
      success(result) {
        const paths = Array.isArray(result.tempFilePaths) ? result.tempFilePaths : (result.tempFilePaths ? [result.tempFilePaths] : [])
        paths.length ? resolve(paths) : reject(new Error('没有选择图片'))
      },
      fail(error) {
        reject(new Error(error.errMsg || '选择图片失败'))
      },
    })
  })
}
