// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UrlInputPanel from '../UrlInputPanel'

function setup(props: Partial<Parameters<typeof UrlInputPanel>[0]> = {}) {
  const onClone = vi.fn()
  render(
    <UrlInputPanel
      onClone={props.onClone ?? onClone}
      isRunning={props.isRunning ?? false}
      disabled={props.disabled}
      model={props.model ?? 'claude-haiku-4-5-20251001'}
      onModelChange={props.onModelChange ?? vi.fn()}
      hasApiKey={props.hasApiKey ?? false}
    />
  )
  return { onClone }
}

describe('UrlInputPanel', () => {
  it('renders two URL inputs', () => {
    setup()
    expect(screen.getByLabelText('Design source URL')).toBeInTheDocument()
    expect(screen.getByLabelText('Content source URL')).toBeInTheDocument()
  })

  it('Clone button is disabled when both inputs are empty', () => {
    setup()
    expect(screen.getByRole('button', { name: /clone/i })).toBeDisabled()
  })

  it('Clone button is disabled while isRunning is true', () => {
    setup({ isRunning: true })
    expect(screen.getByRole('button', { name: /cloning/i })).toBeDisabled()
  })

  it('shows spinner when isRunning', () => {
    setup({ isRunning: true })
    expect(screen.getByLabelText('running')).toBeInTheDocument()
  })

  it('shows validation error on submit with invalid URL', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('Design source URL'), 'not-a-url')
    await userEvent.type(screen.getByLabelText('Content source URL'), 'https://example.com')
    await userEvent.click(screen.getByRole('button', { name: /clone/i }))
    expect(screen.getByText(/must start with http/i)).toBeInTheDocument()
  })

  it('clears error immediately when user starts correcting', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('Design source URL'), 'not-a-url')
    await userEvent.type(screen.getByLabelText('Content source URL'), 'https://example.com')
    await userEvent.click(screen.getByRole('button', { name: /clone/i }))
    expect(screen.getByText(/must start with http/i)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Design source URL'), 's')
    expect(screen.queryByText(/must start with http/i)).not.toBeInTheDocument()
  })

  it('Clone button enabled when both inputs are valid URLs', async () => {
    setup()
    const designInput = screen.getByLabelText('Design source URL')
    const contentInput = screen.getByLabelText('Content source URL')
    await userEvent.type(designInput, 'https://stripe.com')
    await userEvent.type(contentInput, 'https://example.com')
    expect(screen.getByRole('button', { name: /clone/i })).not.toBeDisabled()
  })

  it('calls onClone with correct URL values on submit', async () => {
    const { onClone } = setup()
    await userEvent.type(screen.getByLabelText('Design source URL'), 'https://stripe.com')
    await userEvent.type(screen.getByLabelText('Content source URL'), 'https://example.com')
    await userEvent.click(screen.getByRole('button', { name: /clone/i }))
    expect(onClone).toHaveBeenCalledWith('https://stripe.com', 'https://example.com')
  })

  it('pill click populates both inputs', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Stripe → Tailwind' }))
    expect(screen.getByLabelText('Design source URL')).toHaveValue('https://stripe.com')
    expect(screen.getByLabelText('Content source URL')).toHaveValue('https://tailwindcss.com')
  })

  it('pill click clears submit errors', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('Design source URL'), 'not-a-url')
    await userEvent.type(screen.getByLabelText('Content source URL'), 'https://example.com')
    await userEvent.click(screen.getByRole('button', { name: /clone/i }))
    expect(screen.getByText(/must start with http/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Stripe → Tailwind' }))
    expect(screen.queryByText(/must start with http/i)).not.toBeInTheDocument()
  })

  it('random button populates both inputs with valid URLs', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /random example/i }))
    const design = screen.getByLabelText('Design source URL') as HTMLInputElement
    const content = screen.getByLabelText('Content source URL') as HTMLInputElement
    expect(design.value).toMatch(/^https:\/\//)
    expect(content.value).toMatch(/^https:\/\//)
  })
})
