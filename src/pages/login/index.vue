<script setup lang="ts">
import { loginWithWechat, loginWithWebAccount, registerWebAccount } from '@/api/smartdiet'
import type { LoginResult } from '@/api/types/smartdiet'
import { useTokenStore, useUserStore } from '@/store'

definePage({
  style: {
    navigationStyle: 'custom',
  },
})

const loading = ref(false)
const tokenStore = useTokenStore()
const userStore = useUserStore()
const webMode = ref<'login' | 'register'>('login')
const webForm = reactive({ account: '', password: '', nickname: '' })

async function completeLogin(result: LoginResult) {
  tokenStore.setTokenInfo({ token: result.token, expiresIn: 24 * 60 * 60 })
  userStore.setUserInfo(result.user)
  uni.showToast({ title: '登录成功', icon: 'success' })
  if (result.isNew)
    uni.redirectTo({ url: '/pages/onboarding/index' })
  else
    uni.switchTab({ url: '/pages/chat/index' })
}

async function handleWebLogin() {
  if (loading.value)
    return
  if (!webForm.account || !webForm.password) {
    uni.showToast({ title: '请输入账号和密码', icon: 'none' })
    return
  }
  loading.value = true
  try {
    // #ifdef H5
    const result = webMode.value === 'login'
      ? await loginWithWebAccount({ account: webForm.account, password: webForm.password })
      : await registerWebAccount({ account: webForm.account, password: webForm.password, nickname: webForm.nickname })
    await completeLogin(result)
    // #endif
  }
  catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : webMode.value === 'login' ? '登录失败' : '注册失败', icon: 'none' })
  }
  finally {
    loading.value = false
  }
}

async function handleWechatLogin() {
  if (loading.value)
    return
  loading.value = true
  try {
    // #ifndef H5
    const loginRes = await uni.login({ provider: 'weixin' })
    const result = await loginWithWechat(loginRes.code)
    await completeLogin(result)
    // #endif
  }
  catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '微信登录失败', icon: 'none' })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <view class="login-page">
    <view class="hero-glow hero-glow-one" />
    <view class="hero-glow hero-glow-two" />
    <view class="brand">
      <view class="logo-ring">
        <text class="logo">🥗</text>
      </view>
      <text class="title">SmartDiet</text>
      <text class="subtitle">你的饮食记录助手</text>
      <text class="description">拍照记录每一餐，让健康饮食变得简单</text>
    </view>

    <view class="feature-card">
      <view class="feature">
        <text class="feature-icon">📷</text><view><text class="feature-title">拍照记录</text><text class="feature-desc">上传图片，填写专属饮食记录</text></view>
      </view>
      <view class="feature">
        <text class="feature-icon">📊</text><view><text class="feature-title">饮食报告</text><text class="feature-desc">清晰回顾每周饮食趋势</text></view>
      </view>
      <view class="feature">
        <text class="feature-icon">⭐</text><view><text class="feature-title">真实评价</text><text class="feature-desc">记录喜好、价格与星级评分</text></view>
      </view>
    </view>

    <!-- #ifdef H5 -->
    <view class="web-login-card">
      <view class="mode-tabs">
        <text :class="{ active: webMode === 'login' }" @click="webMode = 'login'">账号登录</text>
        <text :class="{ active: webMode === 'register' }" @click="webMode = 'register'">注册账号</text>
      </view>
      <input v-model.trim="webForm.account" class="web-input" placeholder="账号（3–32 位）" :maxlength="32">
      <input v-if="webMode === 'register'" v-model.trim="webForm.nickname" class="web-input" placeholder="昵称（可选）" :maxlength="64">
      <input v-model="webForm.password" class="web-input" password placeholder="密码（至少 8 位）" :maxlength="72">
      <button class="login-button web-login-button" :loading="loading" @click="handleWebLogin">
        {{ webMode === 'login' ? '登录' : '注册并开始使用' }}
      </button>
    </view>
    <!-- #endif -->

    <!-- #ifndef H5 -->
    <button class="login-button" :loading="loading" @click="handleWechatLogin">
      <text class="wechat-icon">●</text>
      微信一键登录
    </button>
    <!-- #endif -->
    <text class="agreement">登录即表示同意《用户协议》和《隐私政策》</text>
  </view>
</template>

<style scoped lang="scss">
.login-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: calc(var(--status-bar-height) + 80rpx) 48rpx 48rpx;
  overflow: hidden;
  position: relative;
  background: linear-gradient(155deg, #f4fff7 0%, #f8fbf8 55%, #eef8f2 100%);
  display: flex;
  flex-direction: column;
}
.hero-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(3px);
  opacity: 0.7;
}
.hero-glow-one {
  width: 420rpx;
  height: 420rpx;
  right: -180rpx;
  top: -100rpx;
  background: #c9f4d8;
}
.hero-glow-two {
  width: 300rpx;
  height: 300rpx;
  left: -160rpx;
  top: 400rpx;
  background: #e2f6b9;
}
.brand {
  position: relative;
  display: flex;
  align-items: center;
  flex-direction: column;
}
.logo-ring {
  width: 164rpx;
  height: 164rpx;
  border-radius: 48rpx;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 20rpx 60rpx rgba(33, 112, 66, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(-4deg);
}
.logo {
  font-size: 86rpx;
  transform: rotate(4deg);
}
.title {
  margin-top: 38rpx;
  color: #153e28;
  font-size: 64rpx;
  font-weight: 800;
  letter-spacing: 2rpx;
}
.subtitle {
  margin-top: 8rpx;
  color: #2e9b5d;
  font-size: 30rpx;
  font-weight: 600;
  letter-spacing: 6rpx;
}
.description {
  margin-top: 22rpx;
  color: #718079;
  font-size: 26rpx;
}
.feature-card {
  position: relative;
  margin-top: 70rpx;
  padding: 22rpx 28rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.9);
  border-radius: 32rpx;
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 18rpx 70rpx rgba(36, 91, 58, 0.08);
  backdrop-filter: blur(16px);
}
.feature {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 22rpx 8rpx;
}
.feature-icon {
  width: 70rpx;
  height: 70rpx;
  border-radius: 22rpx;
  background: #edf9f1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34rpx;
}
.feature-title,
.feature-desc {
  display: block;
}
.feature-title {
  color: #274837;
  font-size: 28rpx;
  font-weight: 650;
}
.feature-desc {
  color: #849087;
  font-size: 23rpx;
  margin-top: 5rpx;
}
.login-button {
  position: relative;
  margin-top: auto;
  height: 96rpx;
  border: 0;
  border-radius: 28rpx;
  color: #fff;
  background: linear-gradient(135deg, #35b86c, #228f53);
  box-shadow: 0 18rpx 38rpx rgba(38, 151, 84, 0.25);
  font-size: 30rpx;
  font-weight: 650;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
}
.web-login-card {
  position: relative;
  margin-top: auto;
  padding: 26rpx;
  border-radius: 30rpx;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 18rpx 52rpx rgba(36, 91, 58, 0.1);
}
.mode-tabs {
  display: flex;
  gap: 48rpx;
  margin-bottom: 24rpx;
  color: #88968d;
  font-size: 28rpx;
}
.mode-tabs text.active {
  color: #218c50;
  font-weight: 700;
}
.web-input {
  display: block;
  width: 100%;
  height: 84rpx;
  box-sizing: border-box;
  margin-top: 16rpx;
  padding: 0 24rpx;
  border: 2rpx solid #e0eae3;
  border-radius: 20rpx;
  background: #fff;
  color: #274837;
  font-size: 27rpx;
}
.web-login-button {
  width: 100%;
  margin-top: 28rpx;
}
.login-button::after {
  border: 0;
}
.wechat-icon {
  font-size: 22rpx;
  color: #fff;
}
.agreement {
  text-align: center;
  color: #a0aaa4;
  font-size: 20rpx;
  margin-top: 24rpx;
}
</style>
