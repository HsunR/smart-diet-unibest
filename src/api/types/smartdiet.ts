export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'other'

export interface SmartDietUser {
  id: string
  openid: string | null
  nickname: string
  avatar: string
  gender: number
  age: number
  height: number
  weight: number
  createdAt: string
}

export interface LoginResult {
  token: string
  user: SmartDietUser
  isNew: boolean
}

export interface WebAccountCredentials {
  account: string
  password: string
}

export type UserUpdate = Partial<Pick<SmartDietUser, 'nickname' | 'avatar' | 'gender' | 'age' | 'height' | 'weight'>>

export interface FoodTags {
  positive?: string[]
  warning?: string[]
}

export interface FoodItem {
  name: string
  category: string
  score: number
  weight: number
  confidence: number
  tags: FoodTags
  tagReasons: Record<string, string>
  advice: string
}

export interface MealOverview {
  overallHealthScore: number
  healthTags: FoodTags
  tagReasons: Record<string, string>
  summary: string
}

export interface FoodRecordInput {
  date: string
  mealType: MealType
  name: string
  description: string
  positiveTags: string[]
  negativeTags: string[]
  price: number | null
  imageUrls: string[]
  rating: number
}

export interface FoodRecord extends FoodRecordInput {
  id: string
  userId: string
  createdAt: string
}

export interface RecognitionResult {
  foods: FoodItem[]
  mealOverview: MealOverview
  dietaryAdvice: string
}

export interface WeeklyReport {
  weekStart: string
  weekEnd: string
  totalMeals: number
  avgScore: number
  scoreTrend: Array<{ date?: string, score?: number } | number>
  report: string
}
