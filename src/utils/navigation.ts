interface NavigationWindow {
  statusBarHeight?: number
  windowWidth: number
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

  return {
    '--sd-status-bar-height': `${statusBarHeight}px`,
    '--sd-nav-height': `${navHeight}px`,
    '--sd-nav-right': `${rightInset}px`,
  }
}
