import { describe, expect, it, vi } from 'vitest'
import { http } from './http'

vi.mock('@/store/token', () => ({ useTokenStore: vi.fn() }))
vi.mock('@/utils', () => ({ isDoubleTokenMode: false }))
vi.mock('@/utils/toLoginPage', () => ({ toLoginPage: vi.fn() }))

describe('common HTTP rate limit responses', () => {
  it('preserves a server retry message and does not replay the request', async () => {
    vi.mocked(uni.request).mockImplementationOnce((options) => {
      options.success!({ statusCode: 429, data: { code: 429, message: '请在 10 秒后重试', data: null }, header: {}, cookies: [] } as UniApp.RequestSuccessCallbackResult)
      return { abort: vi.fn() } as unknown as UniApp.RequestTask
    })
    await expect(http.get('/limited')).rejects.toMatchObject({ statusCode: 429, message: '请在 10 秒后重试' })
    expect(uni.request).toHaveBeenCalledOnce()
    expect(uni.showToast).toHaveBeenCalledWith({ icon: 'none', title: '请在 10 秒后重试' })
  })

  it('uses a retry header when an upstream has no JSON message', async () => {
    vi.mocked(uni.request).mockImplementationOnce((options) => {
      options.success!({ statusCode: 429, data: {}, header: { 'Retry-After': '9' }, cookies: [] } as UniApp.RequestSuccessCallbackResult)
      return { abort: vi.fn() } as unknown as UniApp.RequestTask
    })
    await expect(http.get('/limited', undefined, undefined, { hideErrorToast: true })).rejects.toMatchObject({ statusCode: 429, message: '操作过于频繁，请在 9 秒后重试' })
    expect(uni.showToast).not.toHaveBeenCalled()
  })
})
