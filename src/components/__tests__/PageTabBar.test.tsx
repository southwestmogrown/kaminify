// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PageTabBar from '../PageTabBar'
import type { ClonedPage } from '@/lib/types'

const makePages = (count: number): ClonedPage[] =>
  Array.from({ length: count }, (_, i) => ({
    slug: i === 0 ? 'index' : `page-${i}`,
    title: i === 0 ? 'Home' : `Page ${i}`,
    navLabel: i === 0 ? 'Home' : `Page ${i}`,
    html: '<!DOCTYPE html><html></html>',
    generatedAt: '2026-01-01T00:00:00.000Z',
  }))

describe('PageTabBar', () => {
  it('renders null when pages is empty', () => {
    const { container } = render(
      <PageTabBar pages={[]} activeSlug={null} onSelect={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders one tab per page', () => {
    const pages = makePages(3)
    render(<PageTabBar pages={pages} activeSlug="index" onSelect={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('each tab shows navLabel', () => {
    const pages = makePages(2)
    render(<PageTabBar pages={pages} activeSlug="index" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument()
  })

  it('active tab has accent border class', () => {
    const pages = makePages(2)
    render(<PageTabBar pages={pages} activeSlug="index" onSelect={vi.fn()} />)
    const activeTab = screen.getByRole('button', { name: 'Home' })
    expect(activeTab.className).toContain('border-[var(--color-accent)]')
  })

  it('inactive tab does not have accent border class', () => {
    const pages = makePages(2)
    render(<PageTabBar pages={pages} activeSlug="index" onSelect={vi.fn()} />)
    const inactiveTab = screen.getByRole('button', { name: 'Page 1' })
    expect(inactiveTab.className).not.toContain('border-[var(--color-accent)]')
  })

  it('calls onSelect with slug when tab is clicked', async () => {
    const onSelect = vi.fn()
    const pages = makePages(2)
    render(<PageTabBar pages={pages} activeSlug="index" onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: 'Page 1' }))
    expect(onSelect).toHaveBeenCalledWith('page-1')
  })

  it('renders tabs in array order', () => {
    const pages = makePages(3)
    render(<PageTabBar pages={pages} activeSlug="index" onSelect={vi.fn()} />)
    const tabs = screen.getAllByRole('button')
    expect(tabs[0].textContent).toBe('Home')
    expect(tabs[1].textContent).toBe('Page 1')
    expect(tabs[2].textContent).toBe('Page 2')
  })
})
