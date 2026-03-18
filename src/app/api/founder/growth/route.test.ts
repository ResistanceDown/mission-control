import { describe, expect, it } from 'vitest'
import { buildPromptDrivenRewrite } from './route'

describe('growth rewrite fallback', () => {
  it('rewrites reply drafts even when the prompt does not match a canned phrase', () => {
    const original = 'What gets missed here is the recovery bill.'
    const rewritten = buildPromptDrivenRewrite(
      original,
      'Make it more direct, sharper, and specific about the recovery cost.',
      '',
      'I work the best if I can focus on a single thing. Context switching really tanks my productivity.',
      'reply',
    )

    expect(rewritten).not.toBe(original)
    expect(rewritten).not.toContain('The sharper version is this:')
    expect(rewritten).toContain('The interruption is the visible part.')
  })

  it('rewrites quote drafts in a way that reflects the selected prompt', () => {
    const original = 'What gets missed here is the recovery bill.'
    const rewritten = buildPromptDrivenRewrite(
      original,
      'Make this feel more direct and specific.',
      '',
      'The thing I enjoy most about running work in parallel these days is that I can multitask without context switching.',
      'quote',
    )

    expect(rewritten).not.toBe(original)
    expect(rewritten).not.toContain('The direct version is this:')
    expect(rewritten).toContain('The visible point is only half the story.')
  })
})
