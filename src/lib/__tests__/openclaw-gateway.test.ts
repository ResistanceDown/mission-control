import { describe, expect, it } from 'vitest'
import { parseGatewayJsonOutput } from '@/lib/openclaw-gateway'

describe('parseGatewayJsonOutput', () => {
  it('parses embedded JSON objects', () => {
    expect(parseGatewayJsonOutput('prefix {"ok":true,"sessionId":"abc"} suffix')).toEqual({
      ok: true,
      sessionId: 'abc',
    })
  })

  it('parses embedded JSON arrays', () => {
    expect(parseGatewayJsonOutput('noise [1,2,3] tail')).toEqual([1, 2, 3])
  })

  it('returns null when no JSON is present', () => {
    expect(parseGatewayJsonOutput('no json here')).toBeNull()
  })
})
