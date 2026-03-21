// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ApiKeyInput from '../ApiKeyInput'

function setup(props: Partial<{ onSave: (k: string) => void; onClose: () => void }> = {}) {
  const onSave = props.onSave ?? vi.fn()
  const onClose = props.onClose ?? vi.fn()
  render(<ApiKeyInput onSave={onSave} onClose={onClose} />)
  return { onSave, onClose }
}

describe('ApiKeyInput', () => {
  it('renders the modal with title "Enter your Anthropic API key"', () => {
    setup()
    expect(screen.getByText('Enter your Anthropic API key')).toBeInTheDocument()
  })

  it('shows error when saving key that does not start with sk-ant-', async () => {
    setup()
    const input = screen.getByLabelText('API Key')
    await userEvent.type(input, 'invalid-key')
    await userEvent.click(screen.getByRole('button', { name: /save key/i }))
    expect(screen.getByText('Key must start with sk-ant-')).toBeInTheDocument()
  })

  it('shows no error initially', () => {
    setup()
    expect(screen.queryByText(/key must start with/i)).not.toBeInTheDocument()
  })

  it('calls onSave and onClose with trimmed key on valid save', async () => {
    const { onSave, onClose } = setup()
    const input = screen.getByLabelText('API Key')
    await userEvent.type(input, '  sk-ant-mykey123  ')
    await userEvent.click(screen.getByRole('button', { name: /save key/i }))
    expect(onSave).toHaveBeenCalledWith('sk-ant-mykey123')
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const { onClose } = setup()
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when backdrop is clicked', () => {
    const { onClose } = setup()
    // The backdrop is the outermost fixed div; clicking it directly triggers onClose
    const backdrop = screen.getByText('Enter your Anthropic API key').closest('[class*="fixed"]') as HTMLElement
    fireEvent.click(backdrop!)
    expect(onClose).toHaveBeenCalled()
  })

  it('error clears when input changes after an error', async () => {
    setup()
    const input = screen.getByLabelText('API Key')
    await userEvent.type(input, 'bad-key')
    await userEvent.click(screen.getByRole('button', { name: /save key/i }))
    expect(screen.getByText('Key must start with sk-ant-')).toBeInTheDocument()
    await userEvent.type(input, 'x')
    expect(screen.queryByText('Key must start with sk-ant-')).not.toBeInTheDocument()
  })
})
