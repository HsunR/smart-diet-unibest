<script setup lang="ts">
import type { SmartDietUser } from '@/api/types/smartdiet'
import { absoluteAssetUrl, getRecordHistory, updateCurrentUser, uploadFoodImage } from '@/api/smartdiet'
import { useChatStore, useTokenStore, useUserStore } from '@/store'
import { chooseImage, formatDate } from '@/utils/smartdiet'

definePage({
  style: {
    navigationBarTitleText: '我的',
    navigationBarBackgroundColor: '#faf8f1',
  },
})

const tokenStore = useTokenStore()
const userStore = useUserStore()
const chatStore = useChatStore()
const editing = ref(false)
const saving = ref(false)
const editForm = ref<SmartDietUser>({ ...userStore.userInfo })
const stats = reactive({ days: 0, meals: 0, averageScore: 0 })

async function loadProfile() {
  if (!tokenStore.updateNowTime().hasLogin) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  try {
    await userStore.fetchUserInfo()
    editForm.value = JSON.parse(JSON.stringify(userStore.userInfo))
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 29)
    const records = await getRecordHistory(formatDate(start), formatDate(end))
    stats.meals = records.length
    stats.days = new Set(records.map(item => item.date)).size
    stats.averageScore = records.length
      ? Math.round(records.reduce((sum, item) => sum + (item.rating || 0), 0) / records.length * 10) / 10
      : 0
  }
  catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '加载资料失败', icon: 'none' })
  }
}

onShow(loadProfile)

function beginEdit() {
  editForm.value = JSON.parse(JSON.stringify(userStore.userInfo))
  editing.value = true
}

async function saveProfile() {
  saving.value = true
  try {
    const updated = await updateCurrentUser({
      nickname: editForm.value.nickname,
      avatar: editForm.value.avatar,
      gender: editForm.value.gender,
      age: Number(editForm.value.age),
      height: Number(editForm.value.height),
      weight: Number(editForm.value.weight),
    })
    userStore.setUserInfo(updated)
    editing.value = false
    uni.showToast({ title: '资料已更新', icon: 'success' })
  }
  catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' })
  }
  finally {
    saving.value = false
  }
}

async function changeAvatar() {
  if (!editing.value)
    return
  try {
    const path = await chooseImage(['album', 'camera'])
    if (!path)
      return
    const uploaded = await uploadFoodImage(path)
    editForm.value.avatar = uploaded.url
  }
  catch (error) {
    if (error instanceof Error && !error.message.includes('cancel'))
      uni.showToast({ title: '头像上传失败', icon: 'none' })
  }
}

function logout() {
  uni.showModal({
    title: '退出登录',
    content: '退出后，本机登录状态将被清除。',
    success(res) {
      if (!res.confirm)
        return
      tokenStore.setTokenInfo({ token: '', expiresIn: 0 })
      uni.removeStorageSync('accessTokenExpireTime')
      userStore.clearUserInfo()
      chatStore.clear()
      uni.reLaunch({ url: '/pages/login/index' })
    },
  })
}
</script>

<template>
  <view class="profile-page">
    <view class="profile-intro"><text class="profile-kicker">个人空间 · 饮食日记</text><text class="profile-title">把每一天，好好收藏。</text></view>
    <view class="profile-hero">
      <view class="hero-orb" />
      <view class="avatar-wrap" @click="changeAvatar">
        <image class="avatar" :src="absoluteAssetUrl((editing ? editForm.avatar : userStore.userInfo.avatar) || '/static/images/default-avatar.png')" mode="aspectFill" />
        <view v-if="editing" class="avatar-edit">
          📷
        </view>
      </view>
      <view class="identity">
        <input v-if="editing" v-model="editForm.nickname" class="nickname-input" placeholder="输入昵称">
        <text v-else class="nickname">{{ userStore.userInfo.nickname || 'SmartDiet 用户' }}</text>
        <text class="goal-badge">已记录 {{ stats.days }} 天</text>
      </view>
      <view class="edit-trigger" @click="editing ? saveProfile() : beginEdit()">
        {{ editing ? '保存' : '编辑' }}
      </view>
    </view>

    <view class="stats-card">
      <view><text class="stat-value">{{ stats.days }}</text><text class="stat-label">记录天数</text></view>
      <view class="stat-divider" />
      <view><text class="stat-value">{{ stats.meals }}</text><text class="stat-label">记录餐次</text></view>
      <view class="stat-divider" />
      <view><text class="stat-value green">{{ stats.averageScore || '--' }}</text><text class="stat-label">平均星级</text></view>
    </view>

    <view class="section-title">
      <text>身体资料</text><text v-if="editing" class="section-note">编辑后点击顶部保存</text>
    </view>
    <view class="info-card">
      <view class="info-row">
        <text class="info-icon">⚧</text><text class="info-label">性别</text><view v-if="editing" class="gender-buttons">
          <text :class="{ active: editForm.gender === 1 }" @click="editForm.gender = 1">男</text><text :class="{ active: editForm.gender === 2 }" @click="editForm.gender = 2">女</text>
        </view><text v-else class="info-value">{{ userStore.userInfo.gender === 2 ? '女' : '男' }}</text>
      </view>
      <view class="info-row">
        <text class="info-icon">🎂</text><text class="info-label">年龄</text><view class="number-value">
          <input v-if="editing" v-model.number="editForm.age" type="number"><text>{{ editing ? '岁' : `${userStore.userInfo.age} 岁` }}</text>
        </view>
      </view>
      <view class="info-row">
        <text class="info-icon">📏</text><text class="info-label">身高</text><view class="number-value">
          <input v-if="editing" v-model.number="editForm.height" type="digit"><text>{{ editing ? 'cm' : `${userStore.userInfo.height} cm` }}</text>
        </view>
      </view>
      <view class="info-row">
        <text class="info-icon">⚖️</text><text class="info-label">体重</text><view class="number-value">
          <input v-if="editing" v-model.number="editForm.weight" type="digit"><text>{{ editing ? 'kg' : `${userStore.userInfo.weight} kg` }}</text>
        </view>
      </view>
    </view>

    <view v-if="editing" class="edit-actions">
      <button class="cancel-button" @click="editing = false">
        取消
      </button><button class="save-button" :loading="saving" @click="saveProfile">
        保存资料
      </button>
    </view>
    <button class="logout-button" @click="logout">
      退出登录
    </button>
  </view>
</template>

<style scoped lang="scss">
.profile-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 22rpx 24rpx 150rpx;
  background: #f3f6f3;
  color: #284536;
}
.profile-hero {
  min-height: 190rpx;
  padding: 30rpx;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
  border-radius: 34rpx;
  color: #fff;
  background: linear-gradient(135deg, #2eaa61, #217e4a);
  box-shadow: 0 16rpx 38rpx rgba(36, 133, 75, 0.2);
  display: flex;
  align-items: center;
  gap: 24rpx;
}
.hero-orb {
  position: absolute;
  width: 250rpx;
  height: 250rpx;
  right: -80rpx;
  top: -120rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
}
.avatar-wrap {
  position: relative;
  flex: none;
}
.avatar {
  width: 116rpx;
  height: 116rpx;
  border: 5rpx solid rgba(255, 255, 255, 0.6);
  border-radius: 38rpx;
  background: #eef5f0;
}
.avatar-edit {
  position: absolute;
  right: -4rpx;
  bottom: -4rpx;
  width: 42rpx;
  height: 42rpx;
  border-radius: 15rpx;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20rpx;
}
.identity {
  flex: 1;
  min-width: 0;
}
.nickname,
.goal-badge {
  display: block;
}
.nickname,
.nickname-input {
  color: #fff;
  font-size: 34rpx;
  font-weight: 750;
}
.nickname-input {
  height: 58rpx;
  border-bottom: 1rpx solid rgba(255, 255, 255, 0.5);
}
.goal-badge {
  margin-top: 12rpx;
  color: rgba(255, 255, 255, 0.75);
  font-size: 21rpx;
}
.edit-trigger {
  position: relative;
  padding: 12rpx 18rpx;
  border-radius: 18rpx;
  background: rgba(255, 255, 255, 0.16);
  font-size: 21rpx;
}
.stats-card {
  margin: 24rpx 0;
  padding: 26rpx 10rpx;
  border-radius: 28rpx;
  background: #fff;
  box-shadow: 0 9rpx 32rpx rgba(31, 67, 45, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-around;
  text-align: center;
}
.stat-value,
.stat-label {
  display: block;
}
.stat-value {
  color: #294c39;
  font-size: 36rpx;
  font-weight: 750;
}
.stat-value.green {
  color: #269554;
}
.stat-label {
  margin-top: 5rpx;
  color: #93a097;
  font-size: 19rpx;
}
.stat-divider {
  width: 1rpx;
  height: 48rpx;
  background: #e8ede9;
}
.section-title {
  margin: 28rpx 8rpx 14rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 27rpx;
  font-weight: 680;
}
.section-note {
  color: #99a59d;
  font-size: 19rpx;
  font-weight: 400;
}
.nutrition-card {
  padding: 28rpx 36rpx;
  border-radius: 28rpx;
  background: #fff;
  box-shadow: 0 9rpx 32rpx rgba(31, 67, 45, 0.06);
  display: flex;
  align-items: center;
  gap: 50rpx;
}
.calorie-ring {
  width: 170rpx;
  height: 170rpx;
  flex: none;
  border-radius: 50%;
  background: conic-gradient(#31aa61 0 78%, #e8f0ea 78%);
  display: flex;
  align-items: center;
  justify-content: center;
}
.calorie-inner {
  width: 132rpx;
  height: 132rpx;
  border-radius: 50%;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.calorie-value {
  color: #21864d;
  font-size: 36rpx;
  font-weight: 760;
}
.calorie-label {
  color: #8a998f;
  font-size: 18rpx;
}
.macro-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.macro {
  color: #66786d;
  font-size: 23rpx;
  display: flex;
  align-items: center;
}
.macro-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 6rpx;
  margin-right: 12rpx;
}
.macro-dot.protein {
  background: #58ad7a;
}
.macro-dot.carbs {
  background: #e7b755;
}
.macro-dot.fat {
  background: #e78b75;
}
.macro-value {
  margin-left: auto;
  color: #365443;
  font-weight: 680;
}
.info-card {
  padding: 0 26rpx;
  border-radius: 28rpx;
  background: #fff;
  box-shadow: 0 9rpx 32rpx rgba(31, 67, 45, 0.06);
}
.info-row {
  min-height: 94rpx;
  border-bottom: 1rpx solid #edf1ee;
  display: flex;
  align-items: center;
}
.info-row:last-child {
  border-bottom: 0;
}
.info-icon {
  width: 52rpx;
  font-size: 28rpx;
}
.info-label {
  color: #536a5d;
  font-size: 24rpx;
}
.info-value {
  margin-left: auto;
  color: #7f8e85;
  font-size: 23rpx;
}
.gender-buttons,
.goal-options {
  margin-left: auto;
  display: flex;
  gap: 9rpx;
}
.gender-buttons text,
.goal-options text {
  padding: 9rpx 18rpx;
  border-radius: 15rpx;
  color: #849289;
  background: #f0f4f1;
  font-size: 21rpx;
}
.gender-buttons text.active,
.goal-options text.active {
  color: #1f8750;
  background: #e5f6eb;
}
.number-value {
  margin-left: auto;
  color: #7f8e85;
  font-size: 22rpx;
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.number-value input {
  width: 115rpx;
  height: 52rpx;
  border-radius: 14rpx;
  background: #f1f5f2;
  text-align: right;
  padding: 0 10rpx;
  color: #3e594a;
}
.goal-row {
  align-items: center;
}
.edit-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 24rpx;
}
.edit-actions button,
.logout-button {
  height: 82rpx;
  border: 0;
  border-radius: 22rpx;
  font-size: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.edit-actions button::after,
.logout-button::after {
  border: 0;
}
.cancel-button {
  width: 180rpx;
  color: #65776d;
  background: #e9efeb;
}
.save-button {
  flex: 1;
  color: #fff;
  background: #2ca45e;
}
.logout-button {
  width: 100%;
  margin-top: 24rpx;
  color: #c0524c;
  background: #fff;
}
.profile-page { background: #faf8f1; color: var(--sd-forest); }
.profile-intro { padding: 12rpx 7rpx 22rpx; }
.profile-kicker, .profile-title { display: block; }
.profile-kicker { color: #69a071; font-size: 20rpx; font-weight: 700; letter-spacing: 1rpx; }
.profile-title { margin-top: 9rpx; color: #173d2b; font-size: 35rpx; font-weight: 800; }
.profile-hero { border: 1rpx solid #e6eddc; color: #214430; background: radial-gradient(circle at 90% 10%, #fffdf8 0%, #f1f3e5 55%, #e4eedf 100%); box-shadow: var(--sd-card-shadow); }
.hero-orb { background: rgba(112, 165, 100, 0.11); }
.avatar { border-color: #fffefa; background: #e4efe1; box-shadow: 0 8rpx 20rpx rgba(45, 80, 47, 0.09); }
.avatar-edit { color: #367a4c; }
.nickname, .nickname-input { color: #214430; }
.nickname-input { border-bottom-color: #a5c5a1; }
.goal-badge { color: #5e8864; }
.edit-trigger { border: 1rpx solid #cddfc8; color: #3c7950; background: rgba(255, 255, 255, 0.75); font-weight: 700; }
.stats-card, .info-card { border: 1rpx solid #eeece3; background: #fffefa; box-shadow: var(--sd-card-shadow); }
.stat-value, .stat-value.green { color: #2e7546; }
.stat-label { color: #7d907e; }
.section-title { color: #264a35; }
.info-row { border-bottom-color: #eff0e8; }
.info-icon { width: 52rpx; height: 52rpx; margin-right: 12rpx; border-radius: 16rpx; background: #edf3e8; font-size: 26rpx; display: flex; align-items: center; justify-content: center; }
.info-label { color: #4e6f58; }
.info-value, .number-value { color: #536f5c; }
.gender-buttons text.active { color: #2e7546; background: #e6f2e2; }
.save-button { border-radius: 999rpx; background: #317949; }
.cancel-button { border-radius: 999rpx; background: #edf0e8; }
.logout-button { border: 1rpx solid #f1e5dc; border-radius: 999rpx; background: #fffefa; }
</style>
