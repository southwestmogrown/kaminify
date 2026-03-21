import type { ClonedPage } from '@/lib/types'

interface PageTabBarProps {
  pages: ClonedPage[]
  activeSlug: string | null
  onSelect: (slug: string) => void
}

export default function PageTabBar({ pages, activeSlug, onSelect }: PageTabBarProps) {
  if (pages.length === 0) return null

  return (
    <div
      className="flex flex-row overflow-x-auto shrink-0 border-b"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated)' }}
    >
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
  )
}
