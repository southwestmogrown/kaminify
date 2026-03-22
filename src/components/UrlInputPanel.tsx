'use client'

import { useState } from 'react'

interface UrlInputPanelProps {
  onClone: (designUrl: string, contentUrl: string) => void
  isRunning: boolean
  disabled?: boolean
  model: string
  onModelChange: (model: string) => void
  hasApiKey: boolean
}

const MODEL_OPTIONS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku (fast)' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet' },
  { value: 'claude-opus-4-6', label: 'Opus' },
]

const EXAMPLES = [
  { label: 'Stripe + me', design: 'https://stripe.com', content: 'https://github.com/shanewilkey' },
  { label: 'Stripe + GitHub', design: 'https://stripe.com', content: 'https://github.com' },
  { label: 'Linear + GitHub', design: 'https://linear.app', content: 'https://github.com' },
  { label: 'Vercel + GitHub', design: 'https://vercel.com', content: 'https://github.com' },
]

function validateUrl(v: string): string {
  if (!v) return 'URL is required'
  if (!v.startsWith('http://') && !v.startsWith('https://')) return 'Must start with http:// or https://'
  try {
    new URL(v)
    return ''
  } catch {
    return 'Invalid URL'
  }
}

export default function UrlInputPanel({ onClone, isRunning, disabled, model, onModelChange, hasApiKey }: UrlInputPanelProps) {
  const [designUrl, setDesignUrl] = useState('')
  const [contentUrl, setContentUrl] = useState('')
  const [designError, setDesignError] = useState('')
  const [contentError, setContentError] = useState('')

  const canSubmit =
    !isRunning &&
    !disabled &&
    !designError &&
    !contentError &&
    !!designUrl &&
    !!contentUrl

  function handleSubmit() {
    const de = validateUrl(designUrl)
    const ce = validateUrl(contentUrl)
    setDesignError(de)
    setContentError(ce)
    if (!de && !ce) onClone(designUrl, contentUrl)
  }

  function applyExample(design: string, content: string) {
    setDesignUrl(design)
    setContentUrl(content)
    setDesignError('')
    setContentError('')
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Inputs row */}
      <div className="flex gap-4">
        {/* Design source */}
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            Design source
          </label>
          <input
            type="url"
            placeholder="https://stripe.com"
            value={designUrl}
            onChange={(e) => setDesignUrl(e.target.value)}
            onBlur={() => setDesignError(validateUrl(designUrl))}
            className="px-3 py-2 rounded-md text-sm border focus:outline-none focus:border-[var(--color-accent)]"
            style={{
              backgroundColor: 'var(--color-bg-input)',
              borderColor: designError ? 'var(--color-error)' : 'var(--color-border)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-mono)',
            }}
            aria-label="Design source URL"
          />
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            The site whose visual style you want to clone
          </span>
          {designError && (
            <span className="text-xs" style={{ color: 'var(--color-error)' }}>
              {designError}
            </span>
          )}
        </div>

        {/* Content source */}
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            Content source
          </label>
          <input
            type="url"
            placeholder="https://your-site.com"
            value={contentUrl}
            onChange={(e) => setContentUrl(e.target.value)}
            onBlur={() => setContentError(validateUrl(contentUrl))}
            className="px-3 py-2 rounded-md text-sm border focus:outline-none focus:border-[var(--color-accent)]"
            style={{
              backgroundColor: 'var(--color-bg-input)',
              borderColor: contentError ? 'var(--color-error)' : 'var(--color-border)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-mono)',
            }}
            aria-label="Content source URL"
          />
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            The site whose content you want to redesign
          </span>
          {contentError && (
            <span className="text-xs" style={{ color: 'var(--color-error)' }}>
              {contentError}
            </span>
          )}
        </div>
      </div>

      {/* Example pills */}
      <div className="flex flex-col gap-2">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Try an example →
        </span>
        <div className="flex gap-2 flex-wrap">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => applyExample(ex.design, ex.content)}
              className="px-3 py-1 rounded-full text-xs border transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-text-primary)]"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-secondary)',
                backgroundColor: 'transparent',
              }}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      {/* Model selector + Clone button row */}
      <div className="flex gap-3 items-center">
        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={!hasApiKey || isRunning}
          className="px-3 py-2.5 rounded-md text-sm border focus:outline-none focus:border-[var(--color-accent)] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--color-bg-input)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
          aria-label="Model"
        >
          {hasApiKey
            ? MODEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))
            : <option value="claude-haiku-4-5-20251001">Haiku (fast)</option>
          }
        </select>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="flex-1 py-2.5 rounded-md text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          backgroundColor: canSubmit ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
          color: canSubmit ? '#000' : 'var(--color-text-muted)',
        }}
      >
        {isRunning && (
          <svg
            aria-label="running"
            className="w-4 h-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        )}
        {isRunning ? 'Cloning…' : 'Clone'}
      </button>
      </div>
    </div>
  )
}
