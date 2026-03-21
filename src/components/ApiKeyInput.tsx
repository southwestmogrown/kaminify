'use client'

import { useState } from 'react'

const KEY_PREFIX = 'sk-ant-'

interface ApiKeyInputProps {
  onSave: (apiKey: string) => void
  onClose: () => void
}

export default function ApiKeyInput({ onSave, onClose }: ApiKeyInputProps) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')

  function handleSave() {
    const trimmed = key.trim()
    if (!trimmed.startsWith(KEY_PREFIX)) {
      setError(`Key must start with ${KEY_PREFIX}`)
      return
    }
    onSave(trimmed)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border p-6 flex flex-col gap-4"
        style={{ backgroundColor: 'var(--color-bg-elevated)', borderColor: 'var(--color-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Enter your Anthropic API key
        </h2>
        <p className="text-sm -mt-2" style={{ color: 'var(--color-text-muted)' }}>
          Your key is stored in sessionStorage and never sent to our servers.
        </p>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="api-key-input" style={{ color: 'var(--color-text-secondary)' }}>
            API Key
          </label>
          <input
            id="api-key-input"
            type="password"
            value={key}
            onChange={(e) => { setKey(e.target.value); setError('') }}
            placeholder={`${KEY_PREFIX}...`}
            className="rounded-md border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2"
            style={{
              backgroundColor: 'var(--color-bg-input)',
              borderColor: error ? 'var(--color-error)' : 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          />
          {error && (
            <span className="text-xs" style={{ color: 'var(--color-error)' }}>
              {error}
            </span>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm border"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-md text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            Save key
          </button>
        </div>
      </div>
    </div>
  )
}
