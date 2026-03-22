'use client'

import { useEffect, useRef } from 'react'
import type { CloneEvent } from '@/lib/types'

interface ProgressFeedProps {
  events: CloneEvent[]
  isRunning: boolean
}

function Spinner() {
  return (
    <svg
      aria-label="loading"
      className="inline-block w-4 h-4 animate-spin shrink-0"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  )
}

function Checkmark({ color }: { color: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`inline-block w-3 h-3 shrink-0 ${color}`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586l-3.293-3.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export default function ProgressFeed({ events, isRunning }: ProgressFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (el) el.scrollTo?.({ top: el.scrollHeight, behavior: 'smooth' })
  }, [events.length])

  // Latest progress message to overlay on the active step
  const lastProgress = [...events].reverse().find((e) => e.type === 'progress')
  const progressMessage = lastProgress?.type === 'progress' ? lastProgress.message : null

  // Filter out progress events — they update inline, not as new rows
  const displayEvents = events.filter((e) => e.type !== 'progress')

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto h-full p-4"
      style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}
    >
      {displayEvents.map((event, i) => {
        const isLast = i === displayEvents.length - 1

        if (event.type === 'status') {
          const label = isLast && isRunning && progressMessage ? progressMessage : event.message
          return (
            <div
              key={i}
              className="flex items-center gap-2 py-1"
              style={{ color: isLast && isRunning ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}
            >
              {isLast && isRunning
                ? <Spinner />
                : <span className="w-4 shrink-0 text-center" style={{ color: 'var(--color-text-muted)' }}>–</span>
              }
              <span>{label}</span>
            </div>
          )
        }

        if (event.type === 'page_complete') {
          return (
            <div key={i} className="flex items-center gap-2 py-1" style={{ color: 'var(--color-text-primary)' }}>
              <Checkmark color="text-[var(--color-success)]" />
              <span>{event.page.navLabel}</span>
            </div>
          )
        }

        if (event.type === 'error') {
          return (
            <div key={i} className="flex items-start gap-2 py-1" style={{ color: 'var(--color-error)' }}>
              <span className="w-4 shrink-0 mt-0.5 text-center">✕</span>
              <span>{event.error}</span>
            </div>
          )
        }

        if (event.type === 'done') {
          return (
            <div key={i} className="flex items-center gap-2 py-1 font-bold" style={{ color: 'var(--color-success)' }}>
              <Checkmark color="text-[var(--color-success)]" />
              <span>All pages complete</span>
            </div>
          )
        }

        return null
      })}
    </div>
  )
}
