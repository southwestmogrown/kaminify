// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import PagePreview from '../PagePreview'
import type { ClonedPage } from '@/lib/types'

const fakePage: ClonedPage = {
  slug: 'index',
  title: 'Home',
  navLabel: 'Home',
  html: '<!DOCTYPE html><html><body>Hello</body></html>',
  generatedAt: '2026-01-01T00:00:00.000Z',
}

const anotherPage: ClonedPage = {
  slug: 'about',
  title: 'About',
  navLabel: 'About',
  html: '<!DOCTYPE html><html><body>About</body></html>',
  generatedAt: '2026-01-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url')
  vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PagePreview', () => {
  it('renders placeholder when page is null', () => {
    render(<PagePreview page={null} />)
    expect(screen.getByText("Pages will appear here as they're generated")).toBeInTheDocument()
  })

  it('calls createObjectURL when page is provided', async () => {
    await act(async () => { render(<PagePreview page={fakePage} />) })
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
  })

  it('sets iframe src to the blob URL', async () => {
    await act(async () => { render(<PagePreview page={fakePage} />) })
    const iframe = screen.getByTitle('Home')
    expect(iframe).toHaveAttribute('src', 'blob:test-url')
  })

  it('calls revokeObjectURL when page changes', async () => {
    const { rerender } = render(<PagePreview page={fakePage} />)
    await act(async () => { rerender(<PagePreview page={anotherPage} />) })
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url')
  })

  it('calls revokeObjectURL on unmount', async () => {
    const { unmount } = render(<PagePreview page={fakePage} />)
    await act(async () => { unmount() })
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url')
  })

  it('iframe has correct sandbox attribute', async () => {
    await act(async () => { render(<PagePreview page={fakePage} />) })
    const iframe = screen.getByTitle('Home')
    expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin')
  })
})
