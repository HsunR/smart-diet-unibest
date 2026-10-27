import { getResponseMessage, ShowMessage } from './enum'

type ResponseHeaders = Record<string, unknown> | { get: (name: string) => string | null }

/** 普通请求、上传与 SSE 使用同一套 HTTP 错误提示，不自动重放请求。 */
export function getRequestErrorMessage(status: number, body?: unknown, headers?: ResponseHeaders): string {
  let parsed = body
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    }
    catch { parsed = undefined }
  }
  const message = parsed && typeof parsed === 'object'
    ? getResponseMessage(parsed, '')
    : ''
  if (message)
    return message
  if (status === 429) {
    const value = typeof headers?.get === 'function'
      ? headers.get('Retry-After')
      : Object.entries(headers || {}).find(([key]) => key.toLowerCase() === 'retry-after')?.[1]
    const seconds = Number(value)
    return Number.isFinite(seconds) && seconds > 0
      ? `操作过于频繁，请在 ${Math.ceil(seconds)} 秒后重试`
      : '操作过于频繁，请稍后重试'
  }
  return ShowMessage(status)
}
