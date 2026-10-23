import { describe, expect, it } from 'vitest'
import { createSseParser, createUtf8Decoder } from './sse'

describe('incremental SSE', () => {
  it('decodes Chinese and emoji across every byte boundary and emits before EOF', () => {
    const events: unknown[] = []
    const consume = createSseParser(event => events.push(event))
    const decode = createUtf8Decoder()
    const event = { type: 'suggestion', data: { field: 'name', value: '番茄鸡蛋面🍜' } }
    const bytes = new TextEncoder().encode(`data: ${JSON.stringify(event)}\r\n\r\n`)
    for (const byte of Array.from(bytes)) consume(decode(new Uint8Array([byte]).buffer))
    expect(events).toEqual([event])
    consume('data: {"type":"do')
    expect(events).toHaveLength(1)
    consume('ne"}', true)
    expect(events).toHaveLength(2)
  })

  it('handles multiple events, comments and multiline data', () => {
    const events: unknown[] = []
    const consume = createSseParser(event => events.push(event))
    consume(': heartbeat\n\ndata: {"type":\ndata: "done"}\n\ndata: {"type":"error"}\n\n')
    expect(events).toEqual([{ type: 'done' }, { type: 'error' }])
  })

  it('reports malformed events instead of silently completing', () => {
    expect(() => createSseParser(() => {})('data: broken\n\n')).toThrow('格式异常')
  })
})
