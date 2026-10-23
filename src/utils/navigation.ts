interface NavigationWindow {
  statusBarHeight?: number
  windowWidth: number
  windowHeight?: number
  screenHeight?: number
  safeArea?: { left: number, right: number, bottom: number }
  safeAreaInsets?: { left?: number, right?: number, bottom?: number }
}

interface MenuButtonRect {
  top: number
  bottom: number
  left: number
  right: number
  height: number
  width: number
}

/** 胶囊上下留白对称，标题右侧始终保留胶囊宽度及触摸间距。 */
export function getNavigationStyle(window: NavigationWindow, menu?: MenuButtonRect) {
  const statusBarHeight = Math.max(0, window.statusBarHeight ?? 20)
  const validMenu = menu && menu.height > 0 && menu.width > 0
    && menu.top >= statusBarHeight && menu.bottom > menu.top
    && menu.left > 0 && menu.right <= window.windowWidth
  const navHeight = validMenu
    ? Math.max(44, menu.height + (menu.top - statusBarHeight) * 2)
    : 44
  const rightInset = validMenu ? window.windowWidth - menu.left + 10 : 106
  const safeLeft = Math.max(0, window.safeAreaInsets?.left ?? window.safeArea?.left ?? 0)
  const safeRight = Math.max(0, window.safeAreaInsets?.right ?? (window.safeArea ? window.windowWidth - window.safeArea.right : 0))
  const safeBottom = Math.max(0, window.safeAreaInsets?.bottom ?? (window.safeArea && window.screenHeight ? window.screenHeight - window.safeArea.bottom : 0))
  const expandedTop = validMenu ? menu.bottom + 4 : statusBarHeight + navHeight
  const viewportStyle: Record<string, string> = {}
  if (window.windowHeight > 0 && window.windowWidth > 0) {
    const width = Math.max(0, window.windowWidth - safeLeft - safeRight)
    const height = Math.max(0, window.windowHeight - expandedTop - safeBottom)
    const portrait = window.windowHeight > window.windowWidth
    // 微信渲染器中旋转后的 vh/dvh 计算可能不同，直接给出设备像素尺寸。
    Object.assign(viewportStyle, {
      '--sd-window-width': `${window.windowWidth}px`,
      '--sd-window-height': `${window.windowHeight}px`,
      '--sd-expanded-width': `${portrait ? height : width}px`,
      '--sd-expanded-height': `${portrait ? width : height}px`,
      '--sd-expanded-center-x': `${safeLeft + width / 2}px`,
      '--sd-expanded-center-y': `${expandedTop + height / 2}px`,
      '--sd-expanded-rotation': portrait ? '90deg' : '0deg',
    })
  }

  return {
    '--sd-status-bar-height': `${statusBarHeight}px`,
    '--sd-nav-height': `${navHeight}px`,
    '--sd-nav-right': `${rightInset}px`,
    // 放大视图的边界使用设备原始坐标，先避开系统区域，再旋转内容。
    '--sd-expanded-safe-top': `${expandedTop}px`,
    '--sd-safe-left': `${safeLeft}px`,
    '--sd-safe-right': `${safeRight}px`,
    '--sd-safe-bottom': `${safeBottom}px`,
    ...viewportStyle,
  }
}
