// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UrlInputPanel from '../UrlInputPanel'

function setup(props: Partial<Parameters<typeof UrlInputPanel>[0]> = {}) {
  const onClone = vi.fn()
  render(
    <UrlInputPanel
      onClone={props.onClone ?? onClone}
      isRunning={props.isRunning ?? false}
      disabled={props.disabled}
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

  it('shows inline error on blur with invalid URL', () => {
    setup()
    const input = screen.getByLabelText('Design source URL')
    fireEvent.change(input, { target: { value: 'not-a-url' } })
    fireEvent.blur(input)
    expect(screen.getByText(/must start with http/i)).toBeInTheDocument()
  })

  it('shows no error for valid URL on blur', () => {
    setup()
    const input = screen.getByLabelText('Design source URL')
    fireEvent.change(input, { target: { value: 'https://stripe.com' } })
    fireEvent.blur(input)
    expect(screen.queryByText(/must start with http/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/invalid url/i)).not.toBeInTheDocument()
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
    await userEvent.click(screen.getByRole('button', { name: 'Stripe + GitHub' }))
    expect(screen.getByLabelText('Design source URL')).toHaveValue('https://stripe.com')
    expect(screen.getByLabelText('Content source URL')).toHaveValue('https://github.com')
  })

  it('pill click clears existing errors', async () => {
    setup()
    const input = screen.getByLabelText('Design source URL')
    fireEvent.change(input, { target: { value: 'bad-url' } })
    fireEvent.blur(input)
    expect(screen.getByText(/must start with http/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Stripe + GitHub' }))
    expect(screen.queryByText(/must start with http/i)).not.toBeInTheDocument()
  })
})
