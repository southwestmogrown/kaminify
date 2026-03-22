import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DesignSystem, DiscoveredPage, PageContent } from '../types'

// Mock the Anthropic SDK before importing composer
const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => {
  function MockAnthropic() {
    return { messages: { create: mockCreate } }
  }
  return { default: MockAnthropic }
})

import { composePage } from '../composer'

const makeDesign = (rawCss = 'body { color: red; }'): DesignSystem => ({
  cssVariables: '',
  colorPalette: ['#ff0000'],
  fontStack: ['Arial'],
  spacing: ['8px'],
  borderRadius: ['4px'],
  componentPatterns: { nav: '<nav/>', hero: '', footer: '', card: '', button: '' },
  sections: [],
  interactivityPatterns: '',
  rawCss,
})

const makeContent = (): PageContent => ({
  url: 'https://example.com/about',
  title: 'About',
  slug: 'about',
  headings: ['About Us'],
  paragraphs: ['We build great things.'],
  listItems: [],
  ctaTexts: ['Learn more'],
  imageAlts: [],
  metaDescription: 'About page',
})

const makePages = (): DiscoveredPage[] => [
  { url: 'https://example.com/', title: 'Home', slug: 'index', navLabel: 'Home' },
  { url: 'https://example.com/about', title: 'About', slug: 'about', navLabel: 'About' },
]

const validHtml = '<!DOCTYPE html><html><head></head><body>Hello</body></html>'

function mockResponse(text: string) {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text }],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('composePage', () => {
  it('returns a string starting with <!DOCTYPE html>', async () => {
    mockResponse(validHtml)
    const result = await composePage(makeDesign(), makeContent(), makePages(), 'test-key')
    expect(result).toMatch(/^<!DOCTYPE html>/i)
  })

  it('throws when response does not start with <!DOCTYPE html>', async () => {
    mockResponse('Here is your HTML: <!DOCTYPE html><html></html>')
    await expect(
      composePage(makeDesign(), makeContent(), makePages(), 'test-key')
    ).rejects.toThrow('Claude did not return valid HTML')
  })

  it('throws when response is empty', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }] })
    await expect(
      composePage(makeDesign(), makeContent(), makePages(), 'test-key')
    ).rejects.toThrow('Claude did not return valid HTML')
  })

  it('truncates rawCss to 8000 characters', async () => {
    mockResponse(validHtml)
    const longCss = 'a'.repeat(12000)
    await composePage(makeDesign(longCss), makeContent(), makePages(), 'test-key')

    const callArg = mockCreate.mock.calls[0][0]
    const userContent = JSON.parse(callArg.messages[0].content)
    expect(userContent.designSystem.rawCss.length).toBeLessThanOrEqual(8000)
  })

  it('includes all page slugs in the navigation array', async () => {
    mockResponse(validHtml)
    const pages = makePages()
    await composePage(makeDesign(), makeContent(), pages, 'test-key')

    const callArg = mockCreate.mock.calls[0][0]
    const userContent = JSON.parse(callArg.messages[0].content)
    const navSlugs = userContent.navigation.map((n: { slug: string }) => n.slug)
    for (const page of pages) {
      expect(navSlugs).toContain(page.slug)
    }
  })

  it('sets currentSlug to content.slug', async () => {
    mockResponse(validHtml)
    const content = makeContent()
    await composePage(makeDesign(), content, makePages(), 'test-key')

    const callArg = mockCreate.mock.calls[0][0]
    const userContent = JSON.parse(callArg.messages[0].content)
    expect(userContent.currentSlug).toBe(content.slug)
  })

  it('accepts <!doctype html> (lowercase) as valid', async () => {
    mockResponse('<!doctype html><html></html>')
    const result = await composePage(makeDesign(), makeContent(), makePages(), 'test-key')
    expect(result).toMatch(/^<!doctype html>/i)
  })
})
