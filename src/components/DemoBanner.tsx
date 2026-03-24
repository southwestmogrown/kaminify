'use client'

interface DemoBannerProps {
  runsUsed: number
  runLimit?: number      // undefined = unlimited
  hasApiKey: boolean
  isSignedIn?: boolean
  canRun?: boolean      // for signed-in users — server-enforced
  tier?: 'free' | 'pro'
  onOpenApiKeyInput: () => void
}

export default function DemoBanner({ runsUsed, runLimit, hasApiKey, isSignedIn, canRun, tier, onOpenApiKeyInput }: DemoBannerProps) {
  const bannerClass = 'sticky top-0 z-10 px-6 py-2 text-sm border-b flex items-center gap-1'
  const bannerStyle = { backgroundColor: 'var(--color-bg-elevated)', borderColor: 'var(--color-border)' }

  // Signed in + has BYOK key → unlimited (tier doesn't matter)
  if (isSignedIn && hasApiKey) {
    return (
      <div className={bannerClass} style={bannerStyle}>
        <span style={{ color: 'var(--color-success)' }}>✓ Signed in · API key active — unlimited runs</span>
      </div>
    )
  }

  // Signed in, no BYOK key
  if (isSignedIn) {
    if (tier === 'pro') {
      return (
        <div className={bannerClass} style={bannerStyle}>
          <span style={{ color: 'var(--color-success)' }}>✓ Signed in · Pro account — unlimited runs</span>
        </div>
      )
    }

    // Free tier signed-in (no BYOK key)
    if (canRun === false) {
      return (
        <div className={bannerClass} style={{ ...bannerStyle, color: 'var(--color-text-secondary)' }}>
          <span style={{ color: 'var(--color-warning)' }}>Free runs exhausted ·</span>
          <span> </span>
          <button
            onClick={onOpenApiKeyInput}
            className="underline cursor-pointer"
            style={{ color: 'var(--color-accent)' }}
          >
            Add your API key to continue →
          </button>
        </div>
      )
    }

    // Free tier, runs remaining
    return (
      <div className={bannerClass} style={{ ...bannerStyle, color: 'var(--color-text-secondary)' }}>
        <span>Signed in · {runsUsed} of {runLimit} free runs used ·</span>
        <span> </span>
        <button
          onClick={onOpenApiKeyInput}
          className="underline cursor-pointer"
          style={{ color: 'var(--color-accent)' }}
        >
          {runsUsed >= (runLimit ?? 0) - 1 ? 'Add your API key →' : 'Add your own API key →'}
        </button>
      </div>
    )
  }

  // Anonymous + has BYOK key
  if (hasApiKey) {
    return (
      <div className={bannerClass} style={bannerStyle}>
        <span style={{ color: 'var(--color-success)' }}>✓ Your API key active — unlimited runs</span>
      </div>
    )
  }

  // Anonymous, no BYOK key
  const limitReached = runLimit !== undefined && runsUsed >= runLimit

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
