import { describe, expect, it } from 'vitest'
import { getNavigationStyle } from './navigation'

describe('微信自定义页头尺寸', () => {
  it.each([
    { status: 54, width: 393, top: 60, left: 296 },
    { status: 24, width: 360, top: 30, left: 263 },
    { status: 20, width: 320, top: 26, left: 223 },
  ])('避开状态栏并为胶囊留出间距（状态栏 $status px）', ({ status, width, top, left }) => {
    const menu = { top, bottom: top + 32, left, right: width - 10, height: 32, width: width - 10 - left }
    const style = getNavigationStyle({ statusBarHeight: status, windowWidth: width }, menu)
    const navHeight = Number.parseFloat(style['--sd-nav-height'])
    const rightInset = Number.parseFloat(style['--sd-nav-right'])

    expect(style['--sd-status-bar-height']).toBe(`${status}px`)
    expect(status + navHeight).toBeGreaterThanOrEqual(menu.bottom)
    expect(width - rightInset).toBeLessThanOrEqual(menu.left - 10)
  })

  it('根据较大的胶囊间距增加导航高度', () => {
    expect(getNavigationStyle({ statusBarHeight: 47, windowWidth: 390 }, {
      top: 57,
      bottom: 89,
      left: 293,
      right: 380,
      height: 32,
      width: 87,
    })['--sd-nav-height']).toBe('52px')
  })

  it('胶囊信息不可用时保留状态栏及默认胶囊位置', () => {
    const window = { statusBarHeight: 54, windowWidth: 393 }
    const expected = { '--sd-status-bar-height': '54px', '--sd-nav-height': '44px', '--sd-nav-right': '106px', '--sd-expanded-safe-top': '98px' }
    expect(getNavigationStyle(window)).toMatchObject(expected)
    expect(getNavigationStyle(window, { top: 0, bottom: 0, left: 0, right: 0, height: 0, width: 0 })).toMatchObject(expected)
    expect(getNavigationStyle(window, { top: 20, bottom: 52, left: 290, right: 380, height: 32, width: 90 })).toMatchObject(expected)
  })

  it('竖屏旋转时为顶部胶囊和底部手势条保留完整区域', () => {
    const style = getNavigationStyle({
      statusBarHeight: 54,
      windowWidth: 393,
      screenHeight: 852,
      safeAreaInsets: { left: 0, right: 0, bottom: 34 },
    }, { top: 60, bottom: 92, left: 296, right: 383, height: 32, width: 87 })

    expect(Number.parseFloat(style['--sd-expanded-safe-top'])).toBeGreaterThanOrEqual(92)
    expect(style['--sd-safe-bottom']).toBe('34px')
    expect(style['--sd-safe-left']).toBe('0px')
    expect(style['--sd-safe-right']).toBe('0px')
  })

  it('横屏时保留侧边刘海区域和底部手势区', () => {
    const style = getNavigationStyle({
      statusBarHeight: 0,
      windowWidth: 852,
      safeAreaInsets: { left: 59, right: 59, bottom: 21 },
    }, { top: 6, bottom: 38, left: 755, right: 842, height: 32, width: 87 })

    expect(style['--sd-expanded-safe-top']).toBe('42px')
    expect(style['--sd-safe-left']).toBe('59px')
    expect(style['--sd-safe-right']).toBe('59px')
    expect(style['--sd-safe-bottom']).toBe('21px')
  })

  it('缺少安全区边距时使用屏幕坐标，避免窗口高度扣减导致底部留白丢失', () => {
    const style = getNavigationStyle({
      statusBarHeight: 47,
      windowWidth: 390,
      screenHeight: 844,
      safeArea: { left: 0, right: 390, bottom: 810 },
    })

    expect(style['--sd-safe-bottom']).toBe('34px')
  })

  it.each([
    { windowWidth: 393, windowHeight: 852, statusBarHeight: 54, bottom: 34 },
    { windowWidth: 375, windowHeight: 812, statusBarHeight: 44, bottom: 34 },
    { windowWidth: 360, windowHeight: 800, statusBarHeight: 24, bottom: 0 },
  ])('竖屏放大使用完整可用长边，避免表格退回屏幕短边宽度（$windowWidth × $windowHeight）', (window) => {
    const style = getNavigationStyle({ ...window, safeAreaInsets: { bottom: window.bottom } })
    const stageWidth = Number.parseFloat(style['--sd-expanded-width'])
    const stageHeight = Number.parseFloat(style['--sd-expanded-height'])
    const centerY = Number.parseFloat(style['--sd-expanded-center-y'])
    const top = Number.parseFloat(style['--sd-expanded-safe-top'])

    expect(stageWidth).toBeGreaterThan(window.windowWidth)
    expect(stageWidth).toBe(window.windowHeight - top - window.bottom)
    expect(stageHeight).toBe(window.windowWidth)
    expect(centerY - stageWidth / 2).toBe(top)
    expect(centerY + stageWidth / 2).toBe(window.windowHeight - window.bottom)
    expect(style['--sd-expanded-rotation']).toBe('90deg')
    expect(style['--sd-window-height']).toBe(`${window.windowHeight}px`)
  })

  it('设备转成横屏后使用横屏窗口尺寸，避免再次旋转或沿用竖屏宽高', () => {
    const style = getNavigationStyle({
      windowWidth: 852,
      windowHeight: 393,
      statusBarHeight: 0,
      safeAreaInsets: { left: 59, right: 59, bottom: 21 },
    }, { top: 6, bottom: 38, left: 755, right: 842, height: 32, width: 87 })

    expect(style['--sd-expanded-width']).toBe('734px')
    expect(style['--sd-expanded-height']).toBe('330px')
    expect(style['--sd-expanded-center-x']).toBe('426px')
    expect(style['--sd-expanded-center-y']).toBe('207px')
    expect(style['--sd-expanded-rotation']).toBe('0deg')
  })
})
