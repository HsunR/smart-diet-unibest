import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestSse, uploadFoodImage } from './smartdiet'

vi.mock('@/http/http', () => ({ http: {} }))
vi.mock('@/store/token', () => ({ useTokenStore: () => ({ updateNowTime: () => ({ validToken: 'token' }) }) }))
vi.mock('@/utils', () => ({ getEnvBaseUrl: () => 'https://api.example.com' }))

afterEach(() => vi.unstubAllGlobals())

describe('rate limit responses outside the common request wrapper', () => {
  it('shows the H5 SSE rejection before reading a stream and does not retry', async () => {
    const getReader = vi.fn()
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ message: '操作过于频繁，请在 10 秒后重试' }),
      body: { getReader },
    })
    vi.stubGlobal('fetch', fetch)
    const event = vi.fn()
    await expect(requestSse('/recognize', {}, event)).rejects.toThrow('10 秒后重试')
    expect(fetch).toHaveBeenCalledOnce()
    expect(getReader).not.toHaveBeenCalled()
    expect(event).not.toHaveBeenCalled()
  })

  it('uses SSE Retry-After when a proxy returns an empty error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => { throw new Error('empty') },
      headers: { get: () => '15' },
    }))
    await expect(requestSse('/recognize', {}, vi.fn())).rejects.toThrow('15 秒')
  })

  it('preserves a 503 explanation from SSE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ message: '限流服务暂不可用，请稍后重试' }),
    }))
    await expect(requestSse('/recognize', {}, vi.fn())).rejects.toThrow('限流服务暂不可用')
  })

  it('preserves an upload rejection and does not submit the file again', async () => {
    vi.mocked(uni.uploadFile).mockImplementationOnce((options) => {
      options.success!({ statusCode: 429, data: JSON.stringify({ message: '请在 8 秒后重试' }) } as UniApp.UploadFileSuccessCallbackResult)
      return { abort: vi.fn() } as unknown as UniApp.UploadTask
    })
    await expect(uploadFoodImage('local-photo')).rejects.toThrow('8 秒')
    expect(uni.uploadFile).toHaveBeenCalledOnce()
  })
})
