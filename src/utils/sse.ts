/** 创建增量 UTF-8 解码器：保留分块末尾的残缺字节，避免中文和表情被拆坏；final 表示最终刷新。 */
export function createUtf8Decoder() {
  let pending: number[] = []
  return (chunk: ArrayBuffer = new ArrayBuffer(0), final = false) => {
    const bytes = pending.concat(Array.from(new Uint8Array(chunk)))
    let end = bytes.length
    if (!final) {
      let start = end - 1
      while (start >= 0 && (bytes[start] & 0xC0) === 0x80) start--
      if (start >= 0) {
        const lead = bytes[start]
        const length = lead < 0x80 ? 1 : lead < 0xE0 ? 2 : lead < 0xF0 ? 3 : 4
        if (end - start < length)
          end = start
      }
    }
    pending = bytes.slice(end)
    try {
      return decodeURIComponent(bytes.slice(0, end).map(byte => `%${byte.toString(16).padStart(2, '0')}`).join(''))
    }
    catch {
      throw new Error('识别响应编码异常，请重试')
    }
  }
}

/** 创建 SSE 解析器：按空行拆分事件，合并多行 data；final 时处理末尾未带空行的事件。 */
export function createSseParser<T>(onEvent: (event: T) => void) {
  let buffer = ''
  return (text: string, final = false) => {
    buffer += text.replace(/\r/g, '')
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() || ''
    if (final && buffer.trim()) {
      blocks.push(buffer)
      buffer = ''
    }
    for (const block of blocks) {
      const payload = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
      if (!payload || payload === '[DONE]')
        continue
      let event: T
      try {
        event = JSON.parse(payload) as T
      }
      catch { throw new Error('识别响应格式异常，请重试') }
      onEvent(event)
    }
  }
}
