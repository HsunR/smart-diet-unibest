<script setup lang="ts">
import { updateCurrentUser } from '@/api/smartdiet'
import { useUserStore } from '@/store'
import { goalOptions } from '@/utils/smartdiet'

definePage({
  style: { navigationBarTitleText: '完善个人资料', navigationBarBackgroundColor: '#f6fbf7' },
})

const userStore = useUserStore()
const step = ref(0)
const saving = ref(false)
const steps = ['性别', '年龄', '身高', '体重', '活动量', '目标']
const activityOptions = [
  { value: 1, label: '久坐少动', desc: '日常以坐姿为主' },
  { value: 2, label: '轻度活动', desc: '每周运动 1–2 次' },
  { value: 3, label: '中度活动', desc: '每周运动 3–5 次' },
  { value: 4, label: '高度活动', desc: '每周运动 6–7 次' },
  { value: 5, label: '专业训练', desc: '高强度训练或体力劳动' },
]
const form = reactive({
  gender: userStore.userInfo.gender || 1,
  age: Number(userStore.userInfo.age || 25),
  height: Number(userStore.userInfo.height || 170),
  weight: Number(userStore.userInfo.weight || 65),
  activityLevel: Number(userStore.userInfo.activityLevel || 3),
  goal: userStore.userInfo.goal || 'maintain',
})

async function next() {
  if (step.value < steps.length - 1) {
    step.value++
    return
  }
  saving.value = true
  try {
    const user = await updateCurrentUser(form)
    userStore.setUserInfo(user)
    uni.setStorageSync('hasCompletedOnboarding', true)
    uni.showToast({ title: '资料已保存', icon: 'success' })
    setTimeout(() => uni.switchTab({ url: '/pages/chat/index' }), 350)
  }
  catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <view class="onboarding-page">
    <view class="progress-row">
      <view v-for="(_, index) in steps" :key="index" class="progress-dot" :class="{ active: index <= step }" />
    </view>
    <view class="step-copy">
      <text class="eyebrow">第 {{ step + 1 }} / {{ steps.length }} 步</text>
      <text class="step-title">{{ ['您的生理性别是？', '您的年龄是？', '您的身高是？', '您当前的体重是？', '您平时的活动量？', '您希望达成什么目标？'][step] }}</text>
      <text class="step-desc">这些信息只用于估算个性化饮食目标</text>
    </view>

    <view class="step-body">
      <view v-if="step === 0" class="two-column">
        <view class="choice-card" :class="{ selected: form.gender === 1 }" @click="form.gender = 1">
          <text class="choice-icon">👨</text><text>男</text>
        </view>
        <view class="choice-card" :class="{ selected: form.gender === 2 }" @click="form.gender = 2">
          <text class="choice-icon">👩</text><text>女</text>
        </view>
      </view>
      <view v-else-if="step === 1" class="number-card">
        <input v-model.number="form.age" type="number" class="number-input"><text class="unit">岁</text><slider :value="form.age" :min="12" :max="90" active-color="#2ca862" @changing="form.age = $event.detail.value" />
      </view>
      <view v-else-if="step === 2" class="number-card">
        <input v-model.number="form.height" type="digit" class="number-input"><text class="unit">cm</text><slider :value="form.height" :min="130" :max="220" active-color="#2ca862" @changing="form.height = $event.detail.value" />
      </view>
      <view v-else-if="step === 3" class="number-card">
        <input v-model.number="form.weight" type="digit" class="number-input"><text class="unit">kg</text><slider :value="form.weight" :min="35" :max="160" active-color="#2ca862" @changing="form.weight = $event.detail.value" />
      </view>
      <view v-else-if="step === 4" class="list-choices">
        <view v-for="item in activityOptions" :key="item.value" class="list-choice" :class="{ selected: form.activityLevel === item.value }" @click="form.activityLevel = item.value">
          <view><text class="list-title">{{ item.label }}</text><text class="list-desc">{{ item.desc }}</text></view><text class="check">{{ form.activityLevel === item.value ? '✓' : '' }}</text>
        </view>
      </view>
      <view v-else class="goal-grid">
        <view v-for="item in goalOptions" :key="item.value" class="choice-card goal-card" :class="{ selected: form.goal === item.value }" @click="form.goal = item.value">
          <text class="choice-icon">{{ item.icon }}</text><text>{{ item.label }}</text>
        </view>
      </view>
    </view>

    <view class="actions">
      <button v-if="step > 0" class="back-button" @click="step--">
        上一步
      </button>
      <button class="next-button" :loading="saving" @click="next">
        {{ step === steps.length - 1 ? '开启健康之旅' : '下一步' }}
      </button>
    </view>
  </view>
</template>

<style scoped lang="scss">
.onboarding-page {
  // uni-page-wrapper 已扣除原生导航栏高度；使用 100vh 会额外撑出导航栏高度并产生滚动条。
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  padding: 40rpx 40rpx calc(40rpx + env(safe-area-inset-bottom));
  overflow: hidden;
  background: linear-gradient(180deg, #f4fbf6, #fff 45%);
  display: flex;
  flex-direction: column;
}
.progress-row {
  display: flex;
  gap: 12rpx;
}
.progress-dot {
  height: 8rpx;
  flex: 1;
  background: #dfe9e2;
  border-radius: 10rpx;
  transition: 0.2s;
}
.progress-dot.active {
  background: #2aa45e;
}
.step-copy {
  margin-top: 54rpx;
}
.eyebrow,
.step-title,
.step-desc {
  display: block;
}
.eyebrow {
  color: #2ca862;
  font-size: 22rpx;
  font-weight: 650;
}
.step-title {
  margin-top: 16rpx;
  color: #173c29;
  font-size: 44rpx;
  font-weight: 750;
}
.step-desc {
  margin-top: 14rpx;
  color: #8a978f;
  font-size: 24rpx;
}
.step-body {
  flex: 1;
  padding-top: 70rpx;
}
.two-column,
.goal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24rpx;
}
.goal-grid {
  grid-template-columns: 1fr;
}
.choice-card {
  height: 240rpx;
  border: 2rpx solid #e4ebe6;
  border-radius: 32rpx;
  background: #fff;
  color: #496057;
  font-size: 30rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18rpx;
  box-shadow: 0 12rpx 34rpx rgba(27, 73, 44, 0.05);
}
.choice-card.selected,
.list-choice.selected {
  border-color: #31ad66;
  background: #effaf3;
  color: #197b44;
  box-shadow: 0 14rpx 38rpx rgba(42, 164, 94, 0.12);
}
.choice-icon {
  font-size: 66rpx;
}
.goal-card {
  height: 150rpx;
  flex-direction: row;
}
.number-card {
  padding: 46rpx 34rpx;
  border-radius: 34rpx;
  background: #fff;
  text-align: center;
  box-shadow: 0 16rpx 50rpx rgba(27, 73, 44, 0.08);
}
.number-input {
  display: inline-block;
  width: 220rpx;
  height: 120rpx;
  color: #17462c;
  font-size: 78rpx;
  font-weight: 750;
  text-align: right;
}
.unit {
  color: #718078;
  font-size: 28rpx;
  margin-left: 12rpx;
}
.list-choices {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}
.list-choice {
  min-height: 92rpx;
  padding: 18rpx 24rpx;
  border: 2rpx solid #e4ebe6;
  border-radius: 24rpx;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.list-title,
.list-desc {
  display: block;
}
.list-title {
  color: #294b39;
  font-size: 28rpx;
  font-weight: 650;
}
.list-desc {
  color: #91a097;
  font-size: 22rpx;
  margin-top: 5rpx;
}
.check {
  color: #269e59;
  font-size: 34rpx;
}
.actions {
  display: flex;
  gap: 18rpx;
  position: fixed;
  z-index: 1;
  right: 40rpx;
  bottom: calc(40rpx + env(safe-area-inset-bottom));
  left: 40rpx;
}
.back-button,
.next-button {
  height: 92rpx;
  border-radius: 26rpx;
  font-size: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.back-button::after,
.next-button::after {
  border: 0;
}
.back-button {
  width: 190rpx;
  color: #52705f;
  background: #edf3ef;
}
.next-button {
  flex: 1;
  color: #fff;
  background: linear-gradient(135deg, #35b86c, #238e53);
  box-shadow: 0 14rpx 30rpx rgba(38, 151, 84, 0.2);
}
</style>
