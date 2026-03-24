// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DemoBanner from '../DemoBanner'

describe('DemoBanner', () => {
  // Signed-in + has API key → unlimited
  it('isSignedIn=true, hasApiKey=true renders "Signed in · API key active — unlimited runs"', () => {
    render(<DemoBanner runsUsed={0} runLimit={3} hasApiKey={true} isSignedIn={true} onOpenApiKeyInput={() => {}} />)
    expect(screen.getByText(/Signed in · API key active — unlimited runs/)).toBeInTheDocument()
  })

  it('isSignedIn=true, hasApiKey=true does NOT render run counts', () => {
    render(<DemoBanner runsUsed={2} runLimit={3} hasApiKey={true} isSignedIn={true} onOpenApiKeyInput={() => {}} />)
    expect(screen.queryByText(/of 3 free runs used/)).not.toBeInTheDocument()
  })

  // Signed-in + pro → unlimited
  it('isSignedIn=true, hasApiKey=false, pro tier shows unlimited runs', () => {
    render(<DemoBanner runsUsed={0} runLimit={undefined} hasApiKey={false} isSignedIn={true} canRun={true} tier="pro" onOpenApiKeyInput={() => {}} />)
    expect(screen.getByText(/Signed in · Pro account — unlimited runs/)).toBeInTheDocument()
  })

  // Signed-in + free tier — runs remaining
  it('isSignedIn=true, free tier, runs remaining shows run counter and "Add your own API key" CTA', () => {
    render(<DemoBanner runsUsed={1} runLimit={3} hasApiKey={false} isSignedIn={true} canRun={true} tier="free" onOpenApiKeyInput={() => {}} />)
    expect(screen.getByText(/Signed in · 1 of 3 free runs used/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add your own API key →/ })).toBeInTheDocument()
  })

  it('isSignedIn=true, free tier, last run shows "Add your API key →" CTA', () => {
    render(<DemoBanner runsUsed={2} runLimit={3} hasApiKey={false} isSignedIn={true} canRun={true} tier="free" onOpenApiKeyInput={() => {}} />)
    expect(screen.getByRole('button', { name: /Add your API key →/ })).toBeInTheDocument()
  })

  // Signed-in + free tier — exhausted
  it('isSignedIn=true, free tier, limit reached shows exhausted message and API key CTA', () => {
    render(<DemoBanner runsUsed={3} runLimit={3} hasApiKey={false} isSignedIn={true} canRun={false} tier="free" onOpenApiKeyInput={() => {}} />)
    expect(screen.getByText(/Free runs exhausted/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add your API key to continue →/ })).toBeInTheDocument()
  })

  it('clicking "Add your API key to continue" calls onOpenApiKeyInput', async () => {
    const handler = vi.fn()
    render(<DemoBanner runsUsed={3} runLimit={3} hasApiKey={false} isSignedIn={true} canRun={false} tier="free" onOpenApiKeyInput={handler} />)
    await userEvent.click(screen.getByRole('button', { name: /Add your API key to continue →/ }))
    expect(handler).toHaveBeenCalledOnce()
  })

  // Anonymous — runs remaining
  it('anonymous, runs remaining shows run counter, no API key button', () => {
    render(<DemoBanner runsUsed={1} runLimit={3} hasApiKey={false} onOpenApiKeyInput={() => {}} />)
    expect(screen.getByText('1 of 3 free runs used · No account required')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('anonymous, runs exhausted shows "Sign in / Sign up to continue" button', () => {
    render(<DemoBanner runsUsed={3} runLimit={3} hasApiKey={false} onOpenApiKeyInput={() => {}} />)
    expect(screen.getByText('Free runs used up')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sign in \/ Sign up to continue →/ })).toBeInTheDocument()
  })

  it('clicking "Sign in / Sign up to continue" calls onOpenApiKeyInput', async () => {
    const handler = vi.fn()
    render(<DemoBanner runsUsed={3} runLimit={3} hasApiKey={false} onOpenApiKeyInput={handler} />)
    await userEvent.click(screen.getByRole('button', { name: /Sign in \/ Sign up to continue →/ }))
    expect(handler).toHaveBeenCalledOnce()
  })

  // Anonymous — isSignedIn=false prop (explicit)
  it('isSignedIn=false, runs remaining shows no-account-required text', () => {
    render(<DemoBanner runsUsed={2} runLimit={3} hasApiKey={false} isSignedIn={false} onOpenApiKeyInput={() => {}} />)
    expect(screen.getByText('2 of 3 free runs used · No account required')).toBeInTheDocument()
  })
})
