// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DemoBanner from '../DemoBanner'

describe('DemoBanner', () => {
  it('hasApiKey=true renders "Your API key active — unlimited runs"', () => {
    render(<DemoBanner runsUsed={0} runLimit={3} hasApiKey={true} onOpenApiKeyInput={() => {}} />)
    expect(screen.getByText(/Your API key active — unlimited runs/)).toBeInTheDocument()
  })

  it('hasApiKey=true does NOT render run counts', () => {
    render(<DemoBanner runsUsed={2} runLimit={3} hasApiKey={true} onOpenApiKeyInput={() => {}} />)
    expect(screen.queryByText(/of 3 free runs used/)).not.toBeInTheDocument()
  })

  it('hasApiKey=false, runsUsed=1, runLimit=3 renders "1 of 3 free runs used · No account required"', () => {
    render(<DemoBanner runsUsed={1} runLimit={3} hasApiKey={false} onOpenApiKeyInput={() => {}} />)
    expect(screen.getByText('1 of 3 free runs used · No account required')).toBeInTheDocument()
  })

  it('hasApiKey=false, runsUsed=0, runLimit=3 renders "Add your own API key →" button', () => {
    render(<DemoBanner runsUsed={0} runLimit={3} hasApiKey={false} onOpenApiKeyInput={() => {}} />)
    expect(screen.getByRole('button', { name: /Add your own API key →/ })).toBeInTheDocument()
  })

  it('hasApiKey=false, runsUsed=3, runLimit=3 renders "Free runs used up"', () => {
    render(<DemoBanner runsUsed={3} runLimit={3} hasApiKey={false} onOpenApiKeyInput={() => {}} />)
    expect(screen.getByText('Free runs used up')).toBeInTheDocument()
  })

  it('hasApiKey=false, runsUsed=3, runLimit=3 renders "Add your API key to continue" button', () => {
    render(<DemoBanner runsUsed={3} runLimit={3} hasApiKey={false} onOpenApiKeyInput={() => {}} />)
    expect(screen.getByRole('button', { name: /Add your API key to continue/ })).toBeInTheDocument()
  })

  it('clicking "Add your own API key →" calls onOpenApiKeyInput', async () => {
    const handler = vi.fn()
    render(<DemoBanner runsUsed={1} runLimit={3} hasApiKey={false} onOpenApiKeyInput={handler} />)
    await userEvent.click(screen.getByRole('button', { name: /Add your own API key →/ }))
    expect(handler).toHaveBeenCalledOnce()
  })

  it('clicking "Add your API key to continue" calls onOpenApiKeyInput', async () => {
    const handler = vi.fn()
    render(<DemoBanner runsUsed={3} runLimit={3} hasApiKey={false} onOpenApiKeyInput={handler} />)
    await userEvent.click(screen.getByRole('button', { name: /Add your API key to continue/ }))
    expect(handler).toHaveBeenCalledOnce()
  })

  it('isSignedIn=true, hasApiKey=true renders "Signed in · API key active — unlimited runs"', () => {
    render(<DemoBanner runsUsed={0} runLimit={3} hasApiKey={true} isSignedIn={true} onOpenApiKeyInput={() => {}} />)
    expect(screen.getByText(/Signed in · API key active — unlimited runs/)).toBeInTheDocument()
  })

  it('isSignedIn=true, hasApiKey=false, free tier, runs remaining shows run counter and CTA', () => {
    render(<DemoBanner runsUsed={1} runLimit={3} hasApiKey={false} isSignedIn={true} canRun={true} tier="free" onOpenApiKeyInput={() => {}} />)
    expect(screen.getByText(/Signed in · 1 of 3 free runs used/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add your own API key →/ })).toBeInTheDocument()
  })

  it('isSignedIn=true, hasApiKey=false, free tier, limit reached shows exhausted message', () => {
    render(<DemoBanner runsUsed={3} runLimit={3} hasApiKey={false} isSignedIn={true} canRun={false} tier="free" onOpenApiKeyInput={() => {}} />)
    expect(screen.getByText(/Free runs exhausted/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add your API key to continue →/ })).toBeInTheDocument()
  })

  it('isSignedIn=true, hasApiKey=false, pro tier shows unlimited runs', () => {
    render(<DemoBanner runsUsed={0} runLimit={undefined} hasApiKey={false} isSignedIn={true} canRun={true} tier="pro" onOpenApiKeyInput={() => {}} />)
    expect(screen.getByText(/Signed in · Pro account — unlimited runs/)).toBeInTheDocument()
  })

  it('isSignedIn=false falls through to existing unauthenticated behavior', () => {
    render(<DemoBanner runsUsed={1} runLimit={3} hasApiKey={false} isSignedIn={false} onOpenApiKeyInput={() => {}} />)
    expect(screen.getByText('1 of 3 free runs used · No account required')).toBeInTheDocument()
  })
})
