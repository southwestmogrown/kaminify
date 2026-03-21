'use client'

interface DemoBannerProps {
  runsUsed: number
  runLimit: number
  hasApiKey: boolean
  onOpenApiKeyInput: () => void
}

export default function DemoBanner({ runsUsed, runLimit, hasApiKey, onOpenApiKeyInput }: DemoBannerProps) {
  const bannerClass = 'sticky top-0 z-10 px-6 py-2 text-sm border-b flex items-center gap-1'
  const bannerStyle = { backgroundColor: 'var(--color-bg-elevated)', borderColor: 'var(--color-border)' }

  if (hasApiKey) {
    return (
      <div className={bannerClass} style={bannerStyle}>
        <span style={{ color: 'var(--color-success)' }}>✓ Your API key active — unlimited runs</span>
      </div>
    )
  }

  const limitReached = runsUsed >= runLimit

  return (
    <div className={bannerClass} style={{ ...bannerStyle, color: 'var(--color-text-secondary)' }}>
      {limitReached ? (
        <span style={{ color: 'var(--color-warning)' }}>Free runs used up</span>
      ) : (
        <span>{runsUsed} of {runLimit} free runs used · No account required</span>
      )}
      <span> · </span>
      <button
        onClick={onOpenApiKeyInput}
        className="underline cursor-pointer"
        style={{ color: 'var(--color-accent)' }}
      >
        {limitReached ? 'Add your API key to continue' : 'Add your own API key →'}
      </button>
    </div>
  )
}
