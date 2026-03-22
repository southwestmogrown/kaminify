import type { ClonedPage } from '@/lib/types'

interface PageTabBarProps {
  pages: ClonedPage[]
  activeSlug: string | null
  onSelect: (slug: string) => void
  mobilePreview: boolean
  onToggleMobilePreview: () => void
}

export default function PageTabBar({ pages, activeSlug, onSelect, mobilePreview, onToggleMobilePreview }: PageTabBarProps) {
  if (pages.length === 0) return null

  return (
    <div
      className="flex flex-row items-center shrink-0 border-b"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated)' }}
    >
      <div className="flex flex-row overflow-x-auto flex-1">
        {pages.map((page) => {
          const isActive = page.slug === activeSlug
          return (
            <button
              key={page.slug}
              onClick={() => onSelect(page.slug)}
              className={[
                'px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                'focus:outline-none',
                isActive
                  ? 'border-[var(--color-accent)] text-[var(--color-text-primary)]'
                  : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]',
              ].join(' ')}
            >
              {page.navLabel}
            </button>
          )
        })}
      </div>
      <div className="ml-auto flex items-center gap-1 pr-3 shrink-0">
        <button
          onClick={() => { if (mobilePreview) onToggleMobilePreview() }}
          aria-label="Desktop preview"
          aria-pressed={!mobilePreview}
          className="px-2 py-1.5 rounded text-xs flex items-center gap-1 transition-colors focus:outline-none"
          style={{
            color: !mobilePreview ? 'var(--color-accent)' : 'var(--color-text-muted)',
            backgroundColor: !mobilePreview ? 'rgba(249,115,22,0.1)' : 'transparent',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        </button>
        <button
          onClick={() => { if (!mobilePreview) onToggleMobilePreview() }}
          aria-label="Mobile preview"
          aria-pressed={mobilePreview}
          className="px-2 py-1.5 rounded text-xs flex items-center gap-1 transition-colors focus:outline-none"
          style={{
            color: mobilePreview ? 'var(--color-accent)' : 'var(--color-text-muted)',
            backgroundColor: mobilePreview ? 'rgba(249,115,22,0.1)' : 'transparent',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2"/>
            <line x1="12" y1="18" x2="12.01" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
