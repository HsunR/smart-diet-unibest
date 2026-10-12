import type { SmartDietUser } from '@/api/types/smartdiet'
import { getCurrentUser } from '@/api/smartdiet'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUserStore } from './user'

vi.mock('@/api/smartdiet', () => ({ getCurrentUser: vi.fn() }))

const mockUser: SmartDietUser = {
  id: 'user-1',
  openid: 'mock-openid',
  nickname: '测试用户',
  avatar: 'https://example.com/avatar.png',
  gender: 1,
  age: 28,
  height: 175,
  weight: 68,
  activityLevel: 3,
  goal: 'maintain',
  preferences: [],
  allergies: [],
  createdAt: '2026-08-18T00:00:00Z',
}

describe('useUserStore', () => {
  beforeEach(() => {
    useUserStore().clearUserInfo()
    vi.clearAllMocks()
  })

  it('使用 SmartDiet 的默认用户资料', () => {
    const store = useUserStore()
    expect(store.userInfo.id).toBe('')
    expect(store.userInfo.age).toBe(25)
    expect(store.userInfo.avatar).toBe('/static/images/default-avatar.png')
  })

  it('写入资料并在空头像时使用默认头像', () => {
    const store = useUserStore()
    store.setUserInfo({ ...mockUser, avatar: '' })
    expect(store.userInfo.id).toBe('user-1')
    expect(store.userInfo.avatar).toBe('/static/images/default-avatar.png')
  })

  it('更新头像', () => {
    const store = useUserStore()
    store.setUserInfo(mockUser)
    store.setUserAvatar('https://example.com/new-avatar.png')
    expect(store.userInfo.avatar).toBe('https://example.com/new-avatar.png')
  })

  it('清空用户资料', () => {
    const store = useUserStore()
    store.setUserInfo(mockUser)
    store.clearUserInfo()
    expect(store.userInfo.id).toBe('')
    expect(uni.removeStorageSync).toHaveBeenCalledWith('user')
  })

  it('从 SmartDiet API 获取当前用户', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser)
    const store = useUserStore()
    await store.fetchUserInfo()
    expect(store.userInfo.id).toBe('user-1')
    expect(store.userInfo.activityLevel).toBe(3)
  })
})
