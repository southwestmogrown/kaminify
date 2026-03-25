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
  // 1-page
  { label: 'Stripe → Tailwind',      design: 'https://stripe.com',       content: 'https://tailwindcss.com' },
  { label: 'Vercel → Railway',       design: 'https://vercel.com',        content: 'https://railway.app' },
  { label: 'Linear → Notion',        design: 'https://linear.app',        content: 'https://notion.so' },
  // 2-page
  { label: 'Resend → Postmark',      design: 'https://resend.com',        content: 'https://postmarkapp.com' },
  { label: 'PlanetScale → Supabase', design: 'https://planetscale.com',   content: 'https://supabase.com' },
  { label: 'Cal → SavvyCal',         design: 'https://cal.com',           content: 'https://savvycal.com' },
  // 3-page
  { label: 'Loom → Tella',           design: 'https://loom.com',          content: 'https://tella.tv' },
  { label: 'Retool → Appsmith',      design: 'https://retool.com',        content: 'https://appsmith.com' },
  { label: 'Framer → Webflow',       design: 'https://framer.com',        content: 'https://webflow.com' },
]

const HIDDEN_EXAMPLES = [
  { label: 'OpenAI → Anthropic', design: 'https://openai.com',   content: 'https://anthropic.com' },
  { label: 'Apple → Microsoft',  design: 'https://apple.com',    content: 'https://microsoft.com' },
  { label: 'Netflix → Hulu',     design: 'https://netflix.com',  content: 'https://hulu.com' },
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

  function pickRandom() {
    const pool = [...EXAMPLES, ...HIDDEN_EXAMPLES]
    const pick = pool[Math.floor(Math.random() * pool.length)]
    applyExample(pick.design, pick.content)
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
            onChange={(e) => { setDesignUrl(e.target.value); setDesignError('') }}
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
            onChange={(e) => { setContentUrl(e.target.value); setContentError('') }}
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
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Try an example →
          </span>
          <button
            type="button"
            onClick={pickRandom}
            aria-label="Random example"
            title="Pick a random pairing"
            className="flex items-center justify-center w-6 h-6 rounded border transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)', backgroundColor: 'transparent' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
            </svg>
          </button>
        </div>
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
        <div className="flex items-center gap-2">
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
        </div>

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
