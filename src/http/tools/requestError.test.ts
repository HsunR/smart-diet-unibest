import { describe, expect, it } from 'vitest'
import { getRequestErrorMessage } from './requestError'

describe('http rate limit errors', () => {
  it('preserves the server explanation for both rate limits and unavailable storage', () => {
    expect(getRequestErrorMessage(429, { message: '请在 12 秒后重试' })).toBe('请在 12 秒后重试')
    expect(getRequestErrorMessage(503, JSON.stringify({ message: '限流服务暂不可用' }))).toBe('限流服务暂不可用')
  })

  it('uses Retry-After from browser or mini program headers when the body is absent', () => {
    expect(getRequestErrorMessage(429, undefined, { 'retry-after': '10' })).toContain('10 秒')
    expect(getRequestErrorMessage(429, 'invalid json', { get: () => '7' })).toContain('7 秒')
  })

  it('falls back to a rate limit hint instead of a network failure', () => {
    expect(getRequestErrorMessage(429)).toBe('操作过于频繁，请稍后重试')
    expect(getRequestErrorMessage(429, null, { 'Retry-After': 'invalid' })).toBe('操作过于频繁，请稍后重试')
  })
})
