'use client'

import { useEffect, useRef, useState } from 'react'
import type { CloneEvent, ClonedPage } from '@/lib/types'
import UrlInputPanel from '@/components/UrlInputPanel'
import ProgressFeed from '@/components/ProgressFeed'
import PageTabBar from '@/components/PageTabBar'
import PagePreview from '@/components/PagePreview'
import DemoBanner from '@/components/DemoBanner'

export default function Home() {
  const [isRunning, setIsRunning] = useState(false)
  const [events, setEvents] = useState<CloneEvent[]>([])
  const [pages, setPages] = useState<ClonedPage[]>([])
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const [hasStarted, setHasStarted] = useState(false)
  const sourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    return () => { sourceRef.current?.close() }
  }, [])

  function startClone(designUrl: string, contentUrl: string) {
    sourceRef.current?.close()

    setIsRunning(true)
    setHasStarted(true)
    setEvents([])
    setPages([])
    setActiveSlug(null)

    const params = new URLSearchParams({ designUrl, contentUrl })
    const source = new EventSource(`/api/clone?${params}`)
    sourceRef.current = source

    source.onmessage = (e: MessageEvent) => {
      const event: CloneEvent = JSON.parse(e.data as string)
      setEvents((prev) => [...prev, event])

      if (event.type === 'page_complete') {
        setPages((prev) => [...prev, event.page])
        setActiveSlug((prev) => prev ?? event.page.slug)
      }
      if (event.type === 'done' || event.type === 'error') {
        setIsRunning(false)
        source.close()
      }
    }

    source.onerror = () => {
      setIsRunning(false)
      source.close()
    }
  }

  const activePage = pages.find((p) => p.slug === activeSlug) ?? null

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: 'var(--color-bg-primary)' }}
    >
      {/* Header */}
      <header
        className="px-6 py-4 border-b flex items-center gap-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <h1 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
          kaminify
        </h1>
        <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Paste two URLs. Get a cloned site.
        </span>
      </header>

      {/* Demo banner — null in M3, implemented in M4 */}
      <DemoBanner />

      {/* URL input */}
      <section className="px-6 py-8 w-full max-w-4xl mx-auto">
        <UrlInputPanel onClone={startClone} isRunning={isRunning} />
      </section>

      {/* Pipeline output — only visible after first run */}
      {hasStarted && (
        <div
          className="flex flex-1 min-h-0 border-t"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {/* Left: progress feed */}
          <aside
            className="w-[280px] shrink-0 border-r overflow-hidden flex flex-col"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated)' }}
          >
            <div
              className="px-4 py-2 text-xs font-medium border-b"
              style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}
            >
              Pipeline
            </div>
            <ProgressFeed events={events} isRunning={isRunning} />
          </aside>

          {/* Right: tabs + preview */}
          <div className="flex flex-col flex-1 min-h-0">
            <PageTabBar pages={pages} activeSlug={activeSlug} onSelect={setActiveSlug} />
            <div className="flex flex-1 min-h-0">
              <PagePreview page={activePage} isLoading={isRunning && pages.length === 0} />
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
