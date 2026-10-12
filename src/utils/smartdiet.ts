import type { MealType, SmartDietUser } from '@/api/types/smartdiet'

export const mealOptions: Array<{ value: MealType, label: string, icon: string }> = [
  { value: 'breakfast', label: '早餐', icon: '🌅' },
  { value: 'lunch', label: '午餐', icon: '☀️' },
  { value: 'dinner', label: '晚餐', icon: '🌙' },
  { value: 'other', label: '其他', icon: '🍎' },
]

export const goalOptions = [
  { value: 'lose_weight' as const, label: '减脂', icon: '🔥' },
  { value: 'maintain' as const, label: '保持', icon: '⚖️' },
  { value: 'gain_muscle' as const, label: '增肌', icon: '💪' },
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

export function calculateNutritionTarget(user: SmartDietUser) {
  const sexOffset = user.gender === 2 ? -161 : 5
  const bmr = 10 * user.weight + 6.25 * user.height - 5 * user.age + sexOffset
  const activityFactors = [1.2, 1.375, 1.55, 1.725, 1.9]
  const tdee = bmr * (activityFactors[user.activityLevel - 1] || 1.55)
  const calorieFactor = user.goal === 'lose_weight' ? 0.82 : user.goal === 'gain_muscle' ? 1.12 : 1
  const calories = Math.max(1200, Math.round(tdee * calorieFactor))
  return {
    calories,
    protein: Math.round(user.weight * (user.goal === 'gain_muscle' ? 1.8 : 1.4)),
    carbs: Math.round(calories * 0.5 / 4),
    fat: Math.round(calories * 0.25 / 9),
  }
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
