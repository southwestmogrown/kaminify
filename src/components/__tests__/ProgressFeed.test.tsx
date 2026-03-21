// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ProgressFeed from '../ProgressFeed'
import type { CloneEvent, ClonedPage } from '@/lib/types'

const fakePage: ClonedPage = {
  slug: 'index',
  title: 'Home',
  navLabel: 'Home',
  html: '<!DOCTYPE html><html></html>',
  generatedAt: '2026-01-01T00:00:00.000Z',
}

describe('ProgressFeed', () => {
  it('renders nothing meaningful for empty events', () => {
    const { container } = render(<ProgressFeed events={[]} isRunning={false} />)
    // no event rows — only the outer container
    expect(container.querySelectorAll('[class*="py-1"]').length).toBe(0)
  })

  it('renders status event message', () => {
    const events: CloneEvent[] = [{ type: 'status', message: 'Scraping design site...' }]
    render(<ProgressFeed events={events} isRunning={false} />)
    expect(screen.getByText('Scraping design site...')).toBeInTheDocument()
  })

  it('shows spinner on last status event when isRunning', () => {
    const events: CloneEvent[] = [{ type: 'status', message: 'Working...' }]
    render(<ProgressFeed events={events} isRunning={true} />)
    expect(screen.getByLabelText('loading')).toBeInTheDocument()
  })

  it('does not show spinner when isRunning is false', () => {
    const events: CloneEvent[] = [{ type: 'status', message: 'Working...' }]
    render(<ProgressFeed events={events} isRunning={false} />)
    expect(screen.queryByLabelText('loading')).not.toBeInTheDocument()
  })

  it('only shows spinner on last status, not earlier ones', () => {
    const events: CloneEvent[] = [
      { type: 'status', message: 'First step' },
      { type: 'status', message: 'Second step' },
    ]
    render(<ProgressFeed events={events} isRunning={true} />)
    // Only one spinner total
    expect(screen.getAllByLabelText('loading')).toHaveLength(1)
  })

  it('renders page_complete event with navLabel', () => {
    const events: CloneEvent[] = [{ type: 'page_complete', page: fakePage }]
    render(<ProgressFeed events={events} isRunning={false} />)
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('renders page_complete event without spinner', () => {
    const events: CloneEvent[] = [{ type: 'page_complete', page: fakePage }]
    render(<ProgressFeed events={events} isRunning={true} />)
    expect(screen.queryByLabelText('loading')).not.toBeInTheDocument()
  })

  it('renders error event with error text', () => {
    const events: CloneEvent[] = [{ type: 'error', error: 'Network failure' }]
    render(<ProgressFeed events={events} isRunning={false} />)
    expect(screen.getByText('Network failure')).toBeInTheDocument()
  })

  it('renders done event with "All pages complete"', () => {
    const events: CloneEvent[] = [{ type: 'done' }]
    render(<ProgressFeed events={events} isRunning={false} />)
    expect(screen.getByText('All pages complete')).toBeInTheDocument()
  })

  it('renders all events when multiple are present', () => {
    const events: CloneEvent[] = [
      { type: 'status', message: 'Step 1' },
      { type: 'page_complete', page: fakePage },
      { type: 'done' },
    ]
    render(<ProgressFeed events={events} isRunning={false} />)
    expect(screen.getByText('Step 1')).toBeInTheDocument()
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('All pages complete')).toBeInTheDocument()
  })
})
