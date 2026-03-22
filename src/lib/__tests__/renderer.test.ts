// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockContent = vi.fn()
const mockGoto = vi.fn()
const mockSetUserAgent = vi.fn()
const mockNewPage = vi.fn()
const mockClose = vi.fn()

vi.mock('puppeteer-core', () => {
  return {
    default: {
      launch: vi.fn(),
    },
  }
})

vi.mock('@sparticuz/chromium-min', () => {
  return {
    default: {
      args: ['--no-sandbox'],
      defaultViewport: { width: 1280, height: 720 },
      executablePath: vi.fn().mockResolvedValue('/fake/chromium'),
    },
  }
})

import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium-min'
import { renderSite } from '../renderer'

const mockLaunch = puppeteer.launch as ReturnType<typeof vi.fn>
const mockExecutablePath = chromium.executablePath as ReturnType<typeof vi.fn>

function setupBrowser({
  gotoImpl,
}: {
  gotoImpl?: () => Promise<unknown>
} = {}) {
  mockContent.mockResolvedValue('<html>rendered</html>')
  mockGoto.mockImplementation(gotoImpl ?? (() => Promise.resolve(null)))
  mockSetUserAgent.mockResolvedValue(undefined)
  mockNewPage.mockResolvedValue({
    setUserAgent: mockSetUserAgent,
    goto: mockGoto,
    content: mockContent,
  })
  mockClose.mockResolvedValue(undefined)
  mockLaunch.mockResolvedValue({
    newPage: mockNewPage,
    close: mockClose,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockExecutablePath.mockResolvedValue('/fake/chromium')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('renderSite', () => {
  it('happy path — returns string from page.content()', async () => {
    setupBrowser()
    const result = await renderSite('https://example.com')
    expect(result).toBe('<html>rendered</html>')
  })

  it('browser.close() is called even when page.goto throws', async () => {
    setupBrowser({ gotoImpl: () => Promise.reject(new Error('network error')) })
    await expect(renderSite('https://example.com')).rejects.toThrow('network error')
    expect(mockClose).toHaveBeenCalledOnce()
  })

  it('uses CHROMIUM_EXECUTABLE_PATH when set', async () => {
    vi.stubEnv('CHROMIUM_EXECUTABLE_PATH', '/fake/path')
    setupBrowser()
    await renderSite('https://example.com')
    expect(mockExecutablePath).not.toHaveBeenCalled()
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: '/fake/path' })
    )
  })

  it('falls back to chromium.executablePath() when CHROMIUM_EXECUTABLE_PATH is not set', async () => {
    vi.stubEnv('CHROMIUM_EXECUTABLE_PATH', '')
    setupBrowser()
    // Force env var to be absent by deleting it after stub
    delete process.env.CHROMIUM_EXECUTABLE_PATH
    await renderSite('https://example.com')
    expect(mockExecutablePath).toHaveBeenCalledOnce()
  })

  it('propagates error from page.goto', async () => {
    setupBrowser({ gotoImpl: () => Promise.reject(new Error('timeout')) })
    await expect(renderSite('https://example.com')).rejects.toThrow('timeout')
  })
})
