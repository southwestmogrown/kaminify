// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DemoBanner from '../DemoBanner'

describe('DemoBanner', () => {
  it('hasApiKey=true renders "Using your API key — unlimited runs"', () => {
    render(<DemoBanner runsUsed={0} runLimit={3} hasApiKey={true} onOpenApiKeyInput={() => {}} />)
    expect(screen.getByText(/Using your API key — unlimited runs/)).toBeInTheDocument()
  })

  it('hasApiKey=true does NOT render run counts', () => {
    render(<DemoBanner runsUsed={2} runLimit={3} hasApiKey={true} onOpenApiKeyInput={() => {}} />)
    expect(screen.queryByText(/of 3 demo runs used/)).not.toBeInTheDocument()
  })

  it('hasApiKey=false, runsUsed=1, runLimit=3 renders "1 of 3 demo runs used"', () => {
    render(<DemoBanner runsUsed={1} runLimit={3} hasApiKey={false} onOpenApiKeyInput={() => {}} />)
    expect(screen.getByText('1 of 3 demo runs used')).toBeInTheDocument()
  })

  it('hasApiKey=false, runsUsed=0, runLimit=3 renders "Use your own API key →" button', () => {
    render(<DemoBanner runsUsed={0} runLimit={3} hasApiKey={false} onOpenApiKeyInput={() => {}} />)
    expect(screen.getByRole('button', { name: /Use your own API key →/ })).toBeInTheDocument()
  })

  it('hasApiKey=false, runsUsed=3, runLimit=3 renders "Demo limit reached"', () => {
    render(<DemoBanner runsUsed={3} runLimit={3} hasApiKey={false} onOpenApiKeyInput={() => {}} />)
    expect(screen.getByText('Demo limit reached')).toBeInTheDocument()
  })

  it('hasApiKey=false, runsUsed=3, runLimit=3 renders "Add your API key to continue" button', () => {
    render(<DemoBanner runsUsed={3} runLimit={3} hasApiKey={false} onOpenApiKeyInput={() => {}} />)
    expect(screen.getByRole('button', { name: /Add your API key to continue/ })).toBeInTheDocument()
  })

  it('clicking "Use your own API key →" calls onOpenApiKeyInput', async () => {
    const handler = vi.fn()
    render(<DemoBanner runsUsed={1} runLimit={3} hasApiKey={false} onOpenApiKeyInput={handler} />)
    await userEvent.click(screen.getByRole('button', { name: /Use your own API key →/ }))
    expect(handler).toHaveBeenCalledOnce()
  })

  it('clicking "Add your API key to continue" calls onOpenApiKeyInput', async () => {
    const handler = vi.fn()
    render(<DemoBanner runsUsed={3} runLimit={3} hasApiKey={false} onOpenApiKeyInput={handler} />)
    await userEvent.click(screen.getByRole('button', { name: /Add your API key to continue/ }))
    expect(handler).toHaveBeenCalledOnce()
  })
})
