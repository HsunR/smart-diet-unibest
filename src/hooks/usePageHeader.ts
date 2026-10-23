import { onResize, onShow } from '@dcloudio/uni-app'
import { ref } from 'vue'
import { getNavigationStyle } from '@/utils/navigation'

/** 页面和固定滚动容器共用同一套顶部尺寸，避免分别计算造成遮挡。 */
export function usePageHeader() {
  const pageHeaderStyle = ref<Record<string, string>>({})

  // #ifdef MP-WEIXIN
  function updateHeader() {
    const windowInfo = uni.getWindowInfo()
    let menu: ReturnType<typeof uni.getMenuButtonBoundingClientRect> | undefined
    try {
      menu = uni.getMenuButtonBoundingClientRect()
    }
    catch {
      // 部分开发者工具环境无法读取胶囊，使用标准导航栏尺寸。
    }
    pageHeaderStyle.value = getNavigationStyle(windowInfo, menu)
  }

  updateHeader()
  onShow(updateHeader)
  onResize(updateHeader)
  // #endif

  return { pageHeaderStyle }
}
