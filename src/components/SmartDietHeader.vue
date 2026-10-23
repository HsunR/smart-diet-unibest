<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  fixed?: boolean
  back?: boolean
  dot?: boolean
}>()

defineEmits<{
  back: []
}>()
</script>

<template>
  <view class="sd-header" :class="{ 'sd-header-fixed': fixed }">
    <view class="sd-header-nav">
      <view v-if="back" class="sd-header-back" role="button" aria-label="返回" @click="$emit('back')">
        ‹
      </view>
      <text class="sd-header-title">{{ title }}</text>
    </view>
    <view v-if="subtitle" class="sd-header-meta">
      <view class="sd-header-subtitle">
        <view v-if="dot" class="sd-header-dot" />
        <text>{{ subtitle }}</text>
      </view>
      <view v-if="$slots.action" class="sd-header-action">
        <slot name="action" />
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.sd-header {
  position: relative;
  box-sizing: border-box;
  padding-top: var(--sd-status-bar-height, env(safe-area-inset-top));
  color: #153d2b;
  background: #faf8f1;
}

.sd-header-fixed {
  position: fixed;
  z-index: 2;
  top: 0;
  right: 0;
  left: 0;
  border-bottom: 1rpx solid #f0eee4;
}

.sd-header-nav {
  display: flex;
  align-items: center;
  height: var(--sd-nav-height, 44px);
  box-sizing: border-box;
  padding: 0 var(--sd-nav-right, 30rpx) 0 30rpx;
}

.sd-header-title {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: #153d2b;
  font-size: 40rpx;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 1rpx;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sd-header-back {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 100%;
  margin-left: -16rpx;
  margin-right: 6rpx;
  font-size: 54rpx;
  line-height: 1;
}

.sd-header-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  height: var(--sd-header-meta-height, 60rpx);
  box-sizing: border-box;
  padding: 0 30rpx 16rpx;
}

.sd-header-subtitle {
  display: flex;
  align-items: center;
  gap: 9rpx;
  min-width: 0;
  color: #7b907d;
  font-size: 20rpx;
  line-height: 28rpx;
}

.sd-header-dot {
  flex: none;
  width: 9rpx;
  height: 9rpx;
  border-radius: 50%;
  background: #42b977;
}

.sd-header-action {
  flex: none;
}
</style>
