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
    const expected = { '--sd-status-bar-height': '54px', '--sd-nav-height': '44px', '--sd-nav-right': '106px' }
    expect(getNavigationStyle(window)).toEqual(expected)
    expect(getNavigationStyle(window, { top: 0, bottom: 0, left: 0, right: 0, height: 0, width: 0 })).toEqual(expected)
    expect(getNavigationStyle(window, { top: 20, bottom: 52, left: 290, right: 380, height: 32, width: 90 })).toEqual(expected)
  })
})
