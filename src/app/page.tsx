'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CloneEvent, ClonedPage, DiscoveredPage } from '@/lib/types'
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
  const [model, setModel] = useState('claude-haiku-4-5-20251001')
  const [runsUsed, setRunsUsed] = useState(0)
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [mobilePreview, setMobilePreview] = useState(false)
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

    function pushEvent(event: CloneEvent) {
      setEvents((prev) => [...prev, event])
    }

    async function readComposeStream(body: ReadableStream<Uint8Array>): Promise<void> {
      const reader = body.getReader()
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
            if (event.type === 'done') continue
            pushEvent(event)
            if (event.type === 'page_complete') {
              setPages((prev) => [...prev, event.page])
              setActiveSlug((prev) => prev ?? event.page.slug)
            }
          } catch {
            // malformed event — skip
          }
        }
      }
      // Flush any remaining buffer content not terminated by \n\n
      const remaining = buffer.trim()
      if (remaining.startsWith('data: ')) {
        try {
          const event: CloneEvent = JSON.parse(remaining.slice(6))
          if (event.type !== 'done') {
            pushEvent(event)
            if (event.type === 'page_complete') {
              setPages((prev) => [...prev, event.page])
              setActiveSlug((prev) => prev ?? event.page.slug)
            }
          }
        } catch {
          // malformed — skip
        }
      }
    }

    try {
      pushEvent({ type: 'status', message: 'Scraping and preparing...' })

      const params = new URLSearchParams({ designUrl, contentUrl, model })
      const prepRes = await fetch(`/api/prepare?${params}`, {
        headers,
        signal: controller.signal,
      })

      if (!prepRes.ok) {
        const text = await prepRes.text()
        pushEvent({ type: 'error', error: text || `Prepare failed (${prepRes.status})` })
        return
      }

      const prepData = await prepRes.json() as {
        designSystem: unknown
        pages: DiscoveredPage[]
        pageContents: unknown[]
        warnings: string[]
        model: string
      }
      const { designSystem, pages, pageContents, warnings, model: resolvedModel } = prepData

      for (const w of warnings) {
        pushEvent({ type: 'warning', message: w })
      }
      pushEvent({ type: 'status', message: `Found ${pages.length} page(s)` })

      for (let i = 0; i < pages.length; i++) {
        if (controller.signal.aborted) break

        const composeRes = await fetch('/api/compose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            designSystem,
            pageContent: pageContents[i],
            allPages: pages,
            model: resolvedModel,
          }),
          signal: controller.signal,
        })

        if (!composeRes.ok || !composeRes.body) {
          pushEvent({ type: 'error', error: `Failed to compose page ${i + 1} (${composeRes.status})` })
          continue
        }

        await readComposeStream(composeRes.body)
      }

      if (!controller.signal.aborted) {
        pushEvent({ type: 'done' })
      }
    } catch (err: unknown) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        pushEvent({ type: 'error', error: err instanceof Error ? err.message : 'Unknown error' })
      }
    } finally {
      setIsRunning(false)
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
    setModel('claude-sonnet-4-6')
  }

  function handleClearApiKey() {
    clearByokSession()
    setApiKey(null)
    setModel('claude-haiku-4-5-20251001')
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
          model={model}
          onModelChange={setModel}
          hasApiKey={!!apiKey}
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
            <PageTabBar
              pages={pages}
              activeSlug={activeSlug}
              onSelect={setActiveSlug}
              mobilePreview={mobilePreview}
              onToggleMobilePreview={() => setMobilePreview((v) => !v)}
            />
            <PagePreview page={activePage} isLoading={isRunning && pages.length === 0} mobilePreview={mobilePreview} />
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
