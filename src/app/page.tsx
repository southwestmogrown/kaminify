'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CloneEvent, ClonedPage } from '@/lib/types'
import { getDemoSession, incrementDemoRun, getByokSession, saveByokSession, clearByokSession } from '@/lib/demo'
import UrlInputPanel from '@/components/UrlInputPanel'
import ProgressFeed from '@/components/ProgressFeed'
import PageTabBar from '@/components/PageTabBar'
import PagePreview from '@/components/PagePreview'
import DemoBanner from '@/components/DemoBanner'
import ApiKeyInput from '@/components/ApiKeyInput'

const DEMO_RUN_LIMIT = parseInt(process.env.NEXT_PUBLIC_DEMO_RUN_LIMIT ?? '3')

export default function Home() {
  const [isRunning, setIsRunning] = useState(false)
  const [events, setEvents] = useState<CloneEvent[]>([])
  const [pages, setPages] = useState<ClonedPage[]>([])
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const [hasStarted, setHasStarted] = useState(false)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [runsUsed, setRunsUsed] = useState(0)
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const byok = getByokSession()
    if (byok) setApiKey(byok.apiKey)
    setRunsUsed(getDemoSession().runsUsed)
  }, [])

  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  async function startClone(designUrl: string, contentUrl: string) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsRunning(true)
    setHasStarted(true)
    setEvents([])
    setPages([])
    setActiveSlug(null)

    if (!apiKey) {
      const updated = incrementDemoRun()
      setRunsUsed(updated.runsUsed)
    }

    const headers: Record<string, string> = {}
    if (apiKey) headers['x-api-key'] = apiKey

    const params = new URLSearchParams({ designUrl, contentUrl })

    try {
      const res = await fetch(`/api/clone?${params}`, {
        headers,
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        setIsRunning(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue
          try {
            const event: CloneEvent = JSON.parse(line.slice(6))
            setEvents((prev) => [...prev, event])

            if (event.type === 'page_complete') {
              setPages((prev) => [...prev, event.page])
              setActiveSlug((prev) => prev ?? event.page.slug)
            }
            if (event.type === 'done' || event.type === 'error') {
              setIsRunning(false)
            }
          } catch {
            // malformed event — skip
          }
        }
      }
      // Stream ended without a 'done' event (e.g. Vercel killed the function)
      setIsRunning(false)
    } catch (err: unknown) {
      // AbortError is intentional — don't surface as an error state
      if (!(err instanceof Error && err.name === 'AbortError')) {
        setIsRunning(false)
      }
    }
  }

  async function handleDownload() {
    setIsDownloading(true)
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages }),
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'cloned-site.zip'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsDownloading(false)
    }
  }

  function handleSaveApiKey(key: string) {
    saveByokSession(key)
    setApiKey(key)
  }

  function handleClearApiKey() {
    clearByokSession()
    setApiKey(null)
  }

  const activePage = useMemo(
    () => pages.find((p) => p.slug === activeSlug) ?? null,
    [pages, activeSlug],
  )
  const demoLimitReached = !apiKey && runsUsed >= DEMO_RUN_LIMIT

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: 'var(--color-bg-primary)' }}
    >
      <header
        className="px-6 py-4 border-b flex items-center gap-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
          <span className="logo-dot" />
          kaminify
        </h1>
        <span className="text-sm hidden sm:block" style={{ color: 'var(--color-text-muted)' }}>
          Clone any site&apos;s design. Keep your content.
        </span>
        {apiKey && (
          <button
            onClick={handleClearApiKey}
            className="ml-auto text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Remove API key
          </button>
        )}
      </header>

      <DemoBanner
        runsUsed={runsUsed}
        runLimit={DEMO_RUN_LIMIT}
        hasApiKey={!!apiKey}
        onOpenApiKeyInput={() => setShowApiKeyInput(true)}
      />

      {!hasStarted && (
        <div className="w-full max-w-4xl mx-auto px-6 pt-16 pb-8 text-center flex flex-col items-center gap-6">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-mono border"
            style={{
              backgroundColor: 'var(--color-accent-dim)',
              borderColor: 'rgba(249,115,22,0.3)',
              color: 'var(--color-accent-hover)',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: 'var(--color-accent)',
                flexShrink: 0,
              }}
            />
            Powered by Claude · Multi-page generation
          </div>

          {/* Headline */}
          <h2
            className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight"
            style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.03em' }}
          >
            Clone any site&apos;s design.
            <br />
            <em style={{ fontStyle: 'normal', color: 'var(--color-accent)' }}>Keep your content.</em>
          </h2>

          {/* Sub */}
          <p
            className="text-base max-w-lg leading-relaxed"
            style={{ color: 'var(--color-text-muted)', fontWeight: 300 }}
          >
            Paste a design URL and a content URL. Kaminify scrapes both, extracts
            the design system, and generates a complete multi-page site — in
            minutes, not months.
          </p>
        </div>
      )}

      <section className={`px-6 w-full max-w-4xl mx-auto ${hasStarted ? 'py-8' : 'pb-8'}`}>
        <UrlInputPanel
          onClone={startClone}
          isRunning={isRunning}
          disabled={demoLimitReached}
        />
        {!isRunning && pages.length > 0 && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-accent)', color: '#000' }}
            >
              {isDownloading ? 'Preparing ZIP…' : 'Download ZIP'}
            </button>
          </div>
        )}
      </section>

      {hasStarted && (
        <div
          className="flex flex-1 min-h-0 border-t flex-col md:flex-row"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <aside
            className="md:w-[280px] shrink-0 md:border-r border-b md:border-b-0 overflow-hidden flex flex-col"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated)' }}
          >
            <div
              className="px-4 py-2 text-xs font-medium border-b flex items-center justify-between"
              style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}
            >
              <span>Pipeline</span>
              {isRunning && (
                <button
                  onClick={() => { abortRef.current?.abort(); setIsRunning(false) }}
                  className="px-2 py-0.5 rounded text-xs font-medium"
                  style={{ backgroundColor: 'var(--color-error)', color: '#fff' }}
                >
                  Stop
                </button>
              )}
            </div>
            <ProgressFeed events={events} isRunning={isRunning} />
          </aside>

          <div className="flex flex-col flex-1 min-h-0">
            <PageTabBar pages={pages} activeSlug={activeSlug} onSelect={setActiveSlug} />
            <PagePreview page={activePage} isLoading={isRunning && pages.length === 0} />
          </div>
        </div>
      )}

      {showApiKeyInput && (
        <ApiKeyInput
          onSave={handleSaveApiKey}
          onClose={() => setShowApiKeyInput(false)}
        />
      )}
    </main>
  )
}
