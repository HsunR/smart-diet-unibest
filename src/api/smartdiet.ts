import type {
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
import { createSseParser, createUtf8Decoder } from '@/utils/sse'

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

export function absoluteAssetUrl(path: string) {
  if (!path || path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:') || path.startsWith('/static/'))
    return path
  return `${getEnvBaseUrl().replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

/** 旧签名过期后，凭当前登录状态重新校验所有权并换取新地址。 */
export function refreshFoodImages(imageUrls: string[]) {
  return http.post<string[]>('/api/v1/upload/access', { imageUrls })
}

/** 预览前刷新整组照片，避免持久化草稿中的临时地址过期。 */
export async function previewFoodImages(url: string, urls: string[]) {
  try {
    const fresh = await refreshFoodImages(urls)
    uni.previewImage({ urls: fresh, current: fresh[Math.max(0, urls.indexOf(url))] })
  }
  catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '照片暂时无法访问，请重新上传', icon: 'none' })
  }
}

/** 上传单张本地照片并返回存储地址；AI 识别由用户另行触发。 */
export function uploadFoodImage(filePath: string) {
  return new Promise<{ url: string, filename: string }>((resolve, reject) => {
    const token = useTokenStore().updateNowTime().validToken
    uni.uploadFile({
      // 部分 H5 环境的上传接口不经过普通请求拦截器，需要显式设置 API 地址。
      url: `${getEnvBaseUrl().replace(/\/$/, '')}/api/v1/upload`,
      filePath,
      name: 'file',
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success(res) {
        let body: { code?: number, message?: string, data?: { url: string, filename: string } }
        try {
          body = JSON.parse(res.data)
        }
        catch {
          reject(new Error('图片上传响应格式错误'))
          return
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(body.message || '图片上传失败'))
          return
        }
        if (body.code !== 0 || !body.data) {
          reject(new Error(body.message || '图片上传失败'))
          return
        }
        resolve(body.data)
      },
      fail: err => reject(new Error(err.errMsg || '图片上传失败')),
    })
  })
}

/** 接收并处理一条已解析的流式事件。 */
export type StreamEventHandler<T> = (event: T) => void

/** 请求启动后提供取消函数，供页面关闭或照片变化时中断连接。 */
export interface StreamControl { cancel?: () => void }

/** 餐食候选、错误提示和结束通知对应的事件类型。 */
export type MealSuggestionEvent
  = | { type: 'suggestion', data: { field: 'name' | 'description', value: string } }
    | { type: 'error', data: { message: string } }
    | { type: 'done', data: unknown }

/** 将全部照片地址提交为一次识别请求，后端统一转换 Base64 并流式返回整餐建议。 */
export function streamMealSuggestions(imageUrls: string[], onEvent: StreamEventHandler<MealSuggestionEvent>, control: StreamControl) {
  return requestSse('/api/v1/records/recognize/stream', { imageUrls }, onEvent, control)
}

/** 发起可取消、带超时的 SSE 请求；H5 使用 Fetch 流，小程序使用分块请求，均增量解码 UTF-8。 */
export function requestSse<T>(
  path: string,
  data: Record<string, unknown>,
  onEvent: StreamEventHandler<T>,
  control: StreamControl = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    let stopped = false
    let abort = () => {}
    const consume = createSseParser(onEvent)
    const decode = createUtf8Decoder()
    const token = useTokenStore().updateNowTime().validToken
    const timer = setTimeout(() => fail(new Error('识别超时，请重试或手动填写')), 90000)
    /** 只结算一次请求并清理超时计时器。 */
    function finish() {
      if (stopped)
        return
      stopped = true
      clearTimeout(timer)
      resolve()
    }
    /** 终止网络请求并传递错误，忽略已结束请求的后续异常。 */
    function fail(error: Error) {
      if (stopped)
        return
      stopped = true
      clearTimeout(timer)
      abort()
      reject(error)
    }
    // 主动取消按正常结束处理，避免关闭草稿时弹出网络错误。
    control.cancel = () => {
      finish()
      abort()
    }
    /** 仅在请求有效时消费文本；final 用于刷新流末尾的剩余事件。 */
    const receive = (text: string, final = false) => {
      if (!stopped)
        consume(text, final)
    }

    // #ifdef H5
    const controller = new AbortController()
    abort = () => controller.abort()
    fetch(`${getEnvBaseUrl().replace(/\/$/, '')}${path}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    }).then(async (response) => {
      if (!response.ok) {
        const retry = Number(response.headers.get('Retry-After'))
        throw new Error(response.status === 429
          ? `请求过于频繁，请${retry > 0 ? `${retry} 秒后` : '稍后'}再试`
          : `请求失败（${response.status}）`)
      }
      const reader = response.body?.getReader()
      if (!reader)
        throw new Error('当前环境不支持流式响应')
      try {
        while (true) {
          if (stopped)
            break
          const { done, value } = await reader.read()
          if (done)
            break
          receive(decode(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer))
        }
        receive(decode(undefined, true), true)
        finish()
      }
      finally { reader.releaseLock() }
    }).catch(fail)
    return
    // #endif

    let receivedChunks = false
    const task = uni.request({
      url: `${getEnvBaseUrl().replace(/\/$/, '')}${path}`,
      method: 'POST',
      data,
      enableChunked: true,
      responseType: 'arraybuffer',
      timeout: 90000,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      success(res) {
        if (stopped)
          return
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const headers = res.header || {}
          const retry = Number(headers['Retry-After'] || headers['retry-after'])
          fail(new Error(res.statusCode === 429
            ? `请求过于频繁，请${retry > 0 ? `${retry} 秒后` : '稍后'}再试`
            : `请求失败（${res.statusCode}）`))
          return
        }
        try {
          if (!receivedChunks) {
            if (typeof res.data === 'string')
              receive(res.data)
            else if (res.data instanceof ArrayBuffer)
              receive(decode(res.data))
          }
          receive(decode(undefined, true), true)
          finish()
        }
        catch (error) { fail(error as Error) }
      },
      fail: err => fail(new Error(err.errMsg || '网络异常')),
    })
    abort = () => task.abort()
    const chunkedTask = task as UniApp.RequestTask & {
      onChunkReceived?: (callback: (response: { data: ArrayBuffer }) => void) => void
    }
    chunkedTask.onChunkReceived?.((response) => {
      if (stopped)
        return
      receivedChunks = true
      try {
        receive(decode(response.data))
      }
      catch (error) { fail(error as Error) }
    })
  })
}
