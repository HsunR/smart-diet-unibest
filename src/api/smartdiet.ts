import type {
  ChatMessageResult,
  FoodRecord,
  FoodRecordInput,
  LoginResult,
  RecognitionResult,
  SmartDietUser,
  UserUpdate,
  WebAccountCredentials,
  WeeklyReport,
} from './types/smartdiet'
import { http } from '@/http/http'
import { useTokenStore } from '@/store/token'
import { getEnvBaseUrl } from '@/utils'

export function loginWithWechat(code: string) {
  return http.post<LoginResult>('/api/v1/users/login', { code })
}

export function loginWithWebAccount(data: WebAccountCredentials) {
  return http.post<LoginResult>('/api/v1/users/web/login', data)
}

export function registerWebAccount(data: WebAccountCredentials & { nickname?: string }) {
  return http.post<LoginResult>('/api/v1/users/web/register', data)
}

export function getCurrentUser() {
  return http.get<SmartDietUser>('/api/v1/users/me')
}

export function updateCurrentUser(data: UserUpdate) {
  return http.patch<SmartDietUser>('/api/v1/users/me', data)
}

export function getRecords(date: string) {
  return http.get<FoodRecord[]>('/api/v1/records', { date })
}

export function getRecordHistory(start: string, end: string) {
  return http.get<FoodRecord[]>('/api/v1/records/history', { start, end })
}

export function createRecord(data: FoodRecordInput) {
  return http.post<FoodRecord>('/api/v1/records', data)
}

export function updateRecord(id: string, data: Partial<FoodRecordInput>) {
  return http.patch<FoodRecord>(`/api/v1/records/${id}`, data)
}

export function deleteRecord(id: string) {
  return http.delete<void>(`/api/v1/records/${id}`)
}

export function recognizeFood(imageUrl: string, userFeedback = '') {
  return http.post<RecognitionResult>('/api/v1/records/recognize', { imageUrl, userFeedback })
}

export function getWeeklyReport() {
  return http.get<WeeklyReport>('/api/v1/records/report/weekly')
}

export function sendChatMessage(content: string, conversationId?: string) {
  return http.post<ChatMessageResult>('/api/v1/chat/messages', { content, conversationId })
}

export function absoluteAssetUrl(path: string) {
  if (!path || path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:') || path.startsWith('/static/'))
    return path
  return `${getEnvBaseUrl().replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

export function uploadFoodImage(filePath: string) {
  return new Promise<{ url: string, filename: string }>((resolve, reject) => {
    const token = useTokenStore().updateNowTime().validToken
    uni.uploadFile({
      // Unlike normal API calls, uploadFile does not consistently apply the
      // request interceptor in every H5 runtime. Use the configured API host.
      url: `${getEnvBaseUrl().replace(/\/$/, '')}/api/v1/upload`,
      filePath,
      name: 'file',
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success(res) {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          try {
            const body = JSON.parse(res.data) as { detail?: string }
            reject(new Error(body.detail || '图片上传失败'))
          }
          catch {
            reject(new Error('图片上传失败'))
          }
          return
        }
        try {
          resolve(JSON.parse(res.data))
        }
        catch {
          reject(new Error('图片上传响应格式错误'))
        }
      },
      fail: err => reject(new Error(err.errMsg || '图片上传失败')),
    })
  })
}

export type StreamEventHandler<T> = (event: T) => void

/** 微信小程序使用分块请求；H5/其他平台会在请求完成后解析完整 SSE 文本。 */
export function requestSse<T>(
  path: string,
  data: Record<string, unknown>,
  onEvent: StreamEventHandler<T>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    let settled = false
    const token = useTokenStore().updateNowTime().validToken

    const consume = (text: string) => {
      buffer += text.replace(/\r/g, '')
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() || ''
      for (const block of blocks) {
        const payload = block.split('\n').find(line => line.startsWith('data:'))?.slice(5).trim()
        if (payload) {
          try {
            onEvent(JSON.parse(payload) as T)
          }
          catch (error) {
            console.warn('忽略无法解析的 SSE 事件', error)
          }
        }
      }
    }

    // #ifdef H5
    fetch(`${getEnvBaseUrl().replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    }).then(async (response) => {
      if (!response.ok)
        throw new Error(`请求失败（${response.status}）`)
      const reader = response.body?.getReader()
      if (!reader)
        throw new Error('当前环境不支持流式响应')
      const decoder = new TextDecoder('utf-8')
      while (true) {
        const { done, value } = await reader.read()
        if (done)
          break
        consume(decoder.decode(value, { stream: true }))
      }
      resolve()
    }).catch(reject)
    return
    // #endif

    const task = uni.request({
      url: `${getEnvBaseUrl().replace(/\/$/, '')}${path}`,
      method: 'POST',
      data,
      enableChunked: true,
      responseType: 'arraybuffer',
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      success(res) {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`请求失败（${res.statusCode}）`))
          return
        }
        if (typeof res.data === 'string')
          consume(res.data)
        if (!settled) {
          settled = true
          resolve()
        }
      },
      fail: err => reject(new Error(err.errMsg || '网络异常')),
    })

    ;(task as any).onChunkReceived?.((response: { data: ArrayBuffer }) => {
      const text = new TextDecoder('utf-8').decode(response.data)
      consume(text)
    })
  })
}
