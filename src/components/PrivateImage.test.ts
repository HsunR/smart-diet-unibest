import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import { refreshFoodImages } from '@/api/smartdiet'
import PrivateImage from './PrivateImage.vue'

vi.mock('@/api/smartdiet', () => ({
  absoluteAssetUrl: (url: string) => url,
  refreshFoodImages: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

it('refreshes an expired private URL once and retains image attributes', async () => {
  vi.mocked(refreshFoodImages).mockResolvedValue(['https://images.test/fresh'])
  const wrapper = mount(PrivateImage, { props: { src: 'https://images.test/expired' }, attrs: { class: 'photo', mode: 'aspectFill' } })
  await wrapper.find('image').trigger('error')
  await flushPromises()
  expect(refreshFoodImages).toHaveBeenCalledWith(['https://images.test/expired'])
  expect(wrapper.find('image').attributes('src')).toBe('https://images.test/fresh')
  expect(wrapper.find('image').classes()).toContain('photo')
  await wrapper.find('image').trigger('error')
  expect(refreshFoodImages).toHaveBeenCalledTimes(1)
})

it('ignores a late refresh after switching photos', async () => {
  let finish!: (urls: string[]) => void
  vi.mocked(refreshFoodImages).mockImplementation(() => new Promise((resolve) => {
    finish = resolve
  }))
  const wrapper = mount(PrivateImage, { props: { src: 'https://images.test/first' } })
  await wrapper.find('image').trigger('error')
  await wrapper.setProps({ src: 'https://images.test/second' })
  finish(['https://images.test/late-first'])
  await flushPromises()
  expect(wrapper.find('image').attributes('src')).toBe('https://images.test/second')
})

it('does not loop on a denied image or request access for bundled assets', async () => {
  vi.mocked(refreshFoodImages).mockRejectedValue(new Error('denied'))
  const wrapper = mount(PrivateImage, { props: { src: 'https://images.test/denied' } })
  await wrapper.find('image').trigger('error')
  await flushPromises()
  await wrapper.find('image').trigger('error')
  expect(refreshFoodImages).toHaveBeenCalledTimes(1)
  await wrapper.setProps({ src: '/static/images/default-avatar.png' })
  await wrapper.find('image').trigger('error')
  expect(refreshFoodImages).toHaveBeenCalledTimes(1)
})

it('converts an HTTP draft to a freshly signed HTTPS URL before displaying it', async () => {
  vi.mocked(refreshFoodImages).mockResolvedValue(['https://images.hsunr.xyz/smartdiet/users/photo.png?fresh=1'])
  const old = 'http://previous-host:9002/smartdiet/users/photo.png?expired=1'
  const wrapper = mount(PrivateImage, { props: { src: old } })
  expect(wrapper.find('image').attributes('src')).toBe('')
  await flushPromises()
  expect(refreshFoodImages).toHaveBeenCalledWith([old])
  expect(wrapper.find('image').attributes('src')).toBe('https://images.hsunr.xyz/smartdiet/users/photo.png?fresh=1')
})
