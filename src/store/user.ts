import type { SmartDietUser } from '@/api/types/smartdiet'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getCurrentUser } from '@/api/smartdiet'

// 初始化状态
const userInfoState: SmartDietUser = {
  id: '',
  openid: '',
  nickname: '',
  avatar: '/static/images/default-avatar.png',
  gender: 0,
  age: 25,
  height: 170,
  weight: 65,
  createdAt: '',
}

export const useUserStore = defineStore(
  'user',
  () => {
    // 定义用户信息
    const userInfo = ref<SmartDietUser>({ ...userInfoState })
    // 设置用户信息
    const setUserInfo = (val: SmartDietUser) => {
      // 若头像为空 则使用默认头像
      if (!val.avatar) {
        val = { ...val, avatar: userInfoState.avatar }
      }
      userInfo.value = val
    }
    const setUserAvatar = (avatar: string) => {
      userInfo.value.avatar = avatar
    }
    // 删除用户信息
    const clearUserInfo = () => {
      userInfo.value = { ...userInfoState }
      uni.removeStorageSync('user')
    }

    /**
     * 获取用户信息
     */
    const fetchUserInfo = async () => {
      const res = await getCurrentUser()
      setUserInfo(res)
      return res
    }

    return {
      userInfo,
      clearUserInfo,
      fetchUserInfo,
      setUserInfo,
      setUserAvatar,
    }
  },
  {
    persist: true,
  },
)
