<script setup lang="ts">
import { ref, watch } from 'vue'
import { absoluteAssetUrl, refreshFoodImages } from '@/api/smartdiet'

// #ifdef MP-WEIXIN
// 配合 mergeVirtualHostAttributes，将调用处的尺寸和圆角样式应用到图片。
defineOptions({
  options: {
    virtualHost: true,
  },
})
// #endif

const props = withDefaults(defineProps<{
  src: string
  mode?: 'aspectFill' | 'aspectFit' | 'widthFix' | 'scaleToFill'
}>(), { mode: 'aspectFill' })
const resolved = ref('')
let attempted = false

watch(() => props.src, (value) => {
  resolved.value = absoluteAssetUrl(value)
  attempted = false
}, { immediate: true })

/** 每个源地址只重试一次；刷新失败时保留图片的原生错误状态。 */
async function refresh() {
  if (attempted || !/^https?:\/\//.test(props.src))
    return
  attempted = true
  const original = props.src
  try {
    const [fresh] = await refreshFoodImages([original])
    if (props.src === original && fresh)
      resolved.value = fresh
  }
  catch { /* 无权访问的旧图需由用户重新上传。 */ }
}
</script>

<template>
  <image :src="resolved" :mode="mode" @error="refresh" />
</template>
