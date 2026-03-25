'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useUser, useAuth, SignInButton, UserButton } from '@clerk/nextjs'
import type { CloneEvent, ClonedPage, DiscoveredPage, Site, Run } from '@/lib/types'
import { getDemoSession, incrementDemoRun } from '@/lib/demo'
import { getOrCreateSessionId } from '@/lib/session'
import UrlInputPanel from '@/components/UrlInputPanel'
import ProgressFeed from '@/components/ProgressFeed'
import PageTabBar from '@/components/PageTabBar'
import PagePreview from '@/components/PagePreview'
import DemoBanner from '@/components/DemoBanner'
import ApiKeyInput from '@/components/ApiKeyInput'

const DEMO_RUN_LIMIT = parseInt(process.env.NEXT_PUBLIC_DEMO_RUN_LIMIT ?? '3')

export default function Home() {
  const { isSignedIn } = useUser()
  const { getToken } = useAuth()
  const [isRunning, setIsRunning] = useState(false)
  const [events, setEvents] = useState<CloneEvent[]>([])
  const [pages, setPages] = useState<ClonedPage[]>([])
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const [hasStarted, setHasStarted] = useState(false)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [model, setModel] = useState('claude-haiku-4-5-20251001')
  // The server may upgrade the model when screenshots are present (Haiku → Sonnet)
  const [effectiveModel, setEffectiveModel] = useState('claude-haiku-4-5-20251001')
  const [runsUsed, setRunsUsed] = useState(0)
  const [runsLimit, setRunsLimit] = useState<number | null>(null)  // null = unlimited
  const [canRun, setCanRun] = useState(true)
  const [tier, setTier] = useState<'free' | 'pro'>('free')
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [showSignIn, setShowSignIn] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [mobilePreview, setMobilePreview] = useState(false)
  const [sessionId, setSessionId] = useState<string>('')
  const [showMySites, setShowMySites] = useState(false)
  const [mySites, setMySites] = useState<(Site & { runs?: Run[] })[]>([])
  const [loadingSites, setLoadingSites] = useState(false)
  const [expandedSiteId, setExpandedSiteId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Hydrate quota state from server for signed-in users; sessionStorage for anonymous
  useEffect(() => {
    async function hydrate() {
      if (isSignedIn) {
        // Claim any anonymous runs before hydrating quota
        if (sessionId) {
          const token = await getToken()
          if (token) {
            fetch('/api/me/claim-anonymous-runs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ sessionId }),
            }).catch(() => {/* non-critical */})
          }
        }

        try {
          const res = await fetch('/api/me')
          if (res.ok) {
            const data = await res.json() as {
              runsUsed: number
              runsLimit: number | null
              canRun: boolean
              tier: 'free' | 'pro'
              hasApiKey: boolean
              apiKey: string | null
            }
            setRunsUsed(data.runsUsed)
            setRunsLimit(data.runsLimit)
            setCanRun(data.canRun)
            setTier(data.tier)
            if (data.apiKey) {
              setApiKey(data.apiKey)
            }
          }
        } catch {
          // Network error — fall back to client state
        }
      } else {
        setRunsUsed(getDemoSession().runsUsed)
        setRunsLimit(DEMO_RUN_LIMIT)
        setCanRun(getDemoSession().runsUsed < DEMO_RUN_LIMIT)
      }
    }
    hydrate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn])

  // Initialize session ID for anonymous run tracking
  useEffect(() => {
    setSessionId(getOrCreateSessionId())
  }, [])

  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  // Trigger Clerk sign-in modal when anonymous user clicks "Sign in / Sign up"
  const signInBtnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (showSignIn) {
      signInBtnRef.current?.click()
      setShowSignIn(false)
    }
  }, [showSignIn])

  async function startClone(designUrl: string, contentUrl: string) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsRunning(true)
    setHasStarted(true)
    setEvents([])
    setPages([])
    setActiveSlug(null)
    setEffectiveModel(apiKey ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001')

    // Anonymous users without BYOK key consume a demo run (server-enforced in /api/prepare)
    if (!apiKey && !isSignedIn) {
      const updated = incrementDemoRun()
      setRunsUsed(updated.runsUsed)
      setCanRun(updated.runsUsed < DEMO_RUN_LIMIT)
    }

    const headers: Record<string, string> = {}
    if (apiKey) headers['x-api-key'] = apiKey
    // Attach Clerk JWT for signed-in users so the server can identify them
    if (isSignedIn) {
      const token = await getToken()
      if (token) headers['Authorization'] = `Bearer ${token}`
    }

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
      if (sessionId) params.set('sessionId', sessionId)
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
        designScreenshot?: string
        contentScreenshot?: string
        userApiKey?: string   // the user's stored api_key (returned for signed-in users)
        siteId?: string
        runId?: string
      }
      const { designSystem, pages, pageContents, warnings, model: resolvedModel, designScreenshot, contentScreenshot, userApiKey, siteId, runId } = prepData
      setEffectiveModel(resolvedModel)

      // If prepare returned a stored user api_key, use it for all compose calls
      if (userApiKey) {
        setApiKey(userApiKey)
        headers['x-api-key'] = userApiKey
      }

      // Signed-in users: re-fetch quota to reflect the server-side run increment
      if (isSignedIn) {
        try {
          const meRes = await fetch('/api/me', {
            headers: { Authorization: `Bearer ${await getToken()}` },
          })
          if (meRes.ok) {
            const me = await meRes.json() as { runsUsed: number; canRun: boolean; tier: 'free' | 'pro' }
            setRunsUsed(me.runsUsed)
            setCanRun(me.canRun)
            setTier(me.tier)
          }
        } catch {
          // non-critical — quota stale but compose will still work
        }
      }

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
            ...(designScreenshot &&
              contentScreenshot && {
                screenshots: { design: designScreenshot, content: contentScreenshot },
              }),
            ...(siteId && runId && { siteId, runId }),
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

  async function handleSaveApiKey(key: string) {
    const token = await getToken()
    if (!token) return
    await fetch('/api/me/api-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ apiKey: key }),
    })
    setApiKey(key)
    setModel('claude-sonnet-4-6')
    setEffectiveModel('claude-sonnet-4-6')
    // Re-fetch quota state now that key is persisted server-side
    const meRes = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } })
    if (meRes.ok) {
      const me = await meRes.json() as { runsUsed: number; canRun: boolean; tier: 'free' | 'pro' }
      setRunsUsed(me.runsUsed)
      setCanRun(me.canRun)
      setTier(me.tier)
    }
  }

  async function handleClearApiKey() {
    const token = await getToken()
    if (token) {
      await fetch('/api/me/api-key', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
    }
    setApiKey(null)
    setModel('claude-haiku-4-5-20251001')
    setEffectiveModel('claude-haiku-4-5-20251001')
    if (token) {
      const meRes = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } })
      if (meRes.ok) {
        const me = await meRes.json() as { runsUsed: number; canRun: boolean; tier: 'free' | 'pro' }
        setRunsUsed(me.runsUsed)
        setCanRun(me.canRun)
        setTier(me.tier)
      }
    }
  }

  async function openMySites() {
    setShowMySites(true)
    setLoadingSites(true)
    try {
      const token = await getToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      if (sessionId) headers['x-session-id'] = sessionId
      const res = await fetch('/api/sites', { headers })
      if (res.ok) {
        const data = await res.json() as { sites: Site[] }
        setMySites(data.sites)
      }
    } catch {
      // non-critical
    } finally {
      setLoadingSites(false)
    }
  }

  async function handleDeleteSite(id: string) {
    const token = await getToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (sessionId) headers['x-session-id'] = sessionId
    await fetch(`/api/sites/${id}`, { method: 'DELETE', headers })
    setMySites((prev) => prev.filter((s) => s.id !== id))
  }

  async function handleRenameSite(id: string, name: string) {
    const token = await getToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (sessionId) headers['x-session-id'] = sessionId
    const res = await fetch(`/api/sites/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      const data = await res.json() as { site: Site }
      setMySites((prev) => prev.map((s) => (s.id === id ? data.site : s)))
    }
  }

  async function handleToggleConsent(runId: string, currentConsent: boolean) {
    const token = await getToken()
    if (!token) return
    await fetch(`/api/runs/${runId}/consent`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ consent_for_training: !currentConsent }),
    })
  }

  async function openSite(site: Site & { runs?: Run[] }) {
    if (expandedSiteId === site.id) {
      setExpandedSiteId(null)
      return
    }
    // Fetch full site with runs
    const token = await getToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (sessionId) headers['x-session-id'] = sessionId
    const res = await fetch(`/api/sites/${site.id}`, { headers })
    if (!res.ok) return
    const data = await res.json() as { site: Site & { runs?: Run[] }; runs: Run[] }
    const siteWithRuns = { ...data.site, runs: data.runs }
    setMySites((prev) => prev.map((s) => (s.id === site.id ? siteWithRuns : s)))
    setExpandedSiteId(site.id)
  }

  const activePage = useMemo(
    () => pages.find((p) => p.slug === activeSlug) ?? null,
    [pages, activeSlug],
  )
  // Signed-in users: server-enforced limit. Anonymous: sessionStorage-based demo.
  const demoLimitReached = isSignedIn
    ? !canRun
    : (!apiKey && runsUsed >= DEMO_RUN_LIMIT)

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
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={openMySites}
            className="text-xs px-3 py-1.5 rounded-md border transition-colors"
            style={{
              color: 'var(--color-text-secondary)',
              borderColor: 'var(--color-border-bright)',
              backgroundColor: 'transparent',
            }}
          >
            My Sites
          </button>
          {isSignedIn && apiKey && (
            <button
              onClick={handleClearApiKey}
              className="text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Remove API key
            </button>
          )}
          {isSignedIn ? (
            <UserButton />
          ) : (
            <SignInButton mode="redirect">
              <button
                className="text-xs px-3 py-1.5 rounded-md border transition-colors"
                style={{
                  color: 'var(--color-text-secondary)',
                  borderColor: 'var(--color-border-bright)',
                  backgroundColor: 'transparent',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-accent)'
                  ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--color-accent)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border-bright)'
                  ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-secondary)'
                }}
              >
                Sign in / Sign up
              </button>
            </SignInButton>
          )}
        </div>
      </header>

      <DemoBanner
        runsUsed={runsUsed}
        runLimit={runsLimit ?? undefined}
        hasApiKey={!!apiKey}
        isSignedIn={!!isSignedIn}
        canRun={canRun}
        tier={tier}
        onOpenApiKeyInput={() => {
          if (!isSignedIn) {
            setShowSignIn(true)
          } else {
            setShowApiKeyInput(true)
          }
        }}
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
          effectiveModel={effectiveModel}
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

      {/* My Sites slide-over */}
      {showMySites && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={() => setShowMySites(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md h-full overflow-y-auto border-l flex flex-col"
            style={{ backgroundColor: 'var(--color-bg-elevated)', borderColor: 'var(--color-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-6 py-4 border-b flex items-center justify-between shrink-0"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>My Sites</h2>
              <button
                onClick={() => setShowMySites(false)}
                className="text-xs px-2 py-1 rounded"
                style={{ color: 'var(--color-text-muted)' }}
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loadingSites ? (
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
              ) : mySites.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    No saved sites yet. Run a clone to get started.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {mySites.map((site) => (
                    <div
                      key={site.id}
                      className="rounded-lg border p-4 flex flex-col gap-2"
                      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                            {site.name}
                          </p>
                          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
                            {site.design_url} → {site.content_url}
                          </p>
                        </div>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded shrink-0"
                          style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent-hover)' }}
                        >
                          {site.model.includes('sonnet') ? 'Sonnet' : site.model.includes('opus') ? 'Opus' : 'Haiku'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {site.page_count} page{site.page_count !== 1 ? 's' : ''}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          · {new Date(site.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() => openSite(site as Site & { runs?: Run[] })}
                          className="text-xs px-3 py-1 rounded border transition-colors"
                          style={{
                            borderColor: 'var(--color-border-bright)',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          {expandedSiteId === site.id ? 'Hide' : 'Show'} runs
                        </button>
                        <button
                          onClick={() => {
                            const newName = window.prompt('Rename site:', site.name)
                            if (newName?.trim()) handleRenameSite(site.id, newName.trim())
                          }}
                          className="text-xs px-3 py-1 rounded"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm('Delete this site?')) handleDeleteSite(site.id)
                          }}
                          className="text-xs px-3 py-1 rounded ml-auto"
                          style={{ color: 'var(--color-error)' }}
                        >
                          Delete
                        </button>
                      </div>

                      {/* Expanded runs view */}
                      {expandedSiteId === site.id && site.runs && site.runs.length > 0 && (
                        <div className="mt-2 flex flex-col gap-2 border-t pt-2" style={{ borderColor: 'var(--color-border)' }}>
                          {site.runs.map((run) => (
                            <div key={run.id} className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="text-xs w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: run.success ? 'var(--color-success)' : 'var(--color-error)' }}
                                />
                                <span className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                                  {run.pages_completed}/{run.pages_requested} pages
                                  {run.consent_for_training ? ' · consented' : ''}
                                </span>
                              </div>
                              {isSignedIn && run.success && (
                                <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={run.consent_for_training}
                                    onChange={() => {
                                      handleToggleConsent(run.id, run.consent_for_training)
                                      // Optimistic update
                                      setMySites((prev) =>
                                        prev.map((s) =>
                                          s.id === site.id
                                            ? {
                                                ...s,
                                                runs: s.runs?.map((r) =>
                                                  r.id === run.id ? { ...r, consent_for_training: !r.consent_for_training } : r,
                                                ),
                                              }
                                            : s,
                                        ),
                                      )
                                    }}
                                    className="accent-orange-500"
                                  />
                                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                    Train
                                  </span>
                                </label>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hidden Clerk sign-in trigger for anonymous exhausted users */}
      <SignInButton mode="modal">
        <button ref={signInBtnRef} className="hidden" aria-hidden />
      </SignInButton>
    </main>
  )
}
