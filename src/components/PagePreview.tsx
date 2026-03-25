'use client'

import { useEffect, useRef, useState } from 'react'
import type { ClonedPage } from '@/lib/types'
import dynamic from 'next/dynamic'
const GeneratingAnimation = dynamic(() => import('./GeneratingAnimation'), { ssr: false })

interface PagePreviewProps {
  page: ClonedPage | null
  isLoading?: boolean
  mobilePreview?: boolean
}

export default function PagePreview({ page, isLoading, mobilePreview }: PagePreviewProps) {
  const blobUrlRef = useRef<string | null>(null)
  const [iframeSrc, setIframeSrc] = useState<string | null>(null)

  useEffect(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    if (page?.html) {
      const blob = new Blob([page.html], { type: 'text/html' })
      blobUrlRef.current = URL.createObjectURL(blob)
      setIframeSrc(blobUrlRef.current)
    } else {
      setIframeSrc(null)
    }
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.slug])  // intentional: re-run only on slug change, not on html content change

  if (isLoading) {
    return <GeneratingAnimation />
  }

  if (!page) {
    return (
      <div className="flex flex-1 items-center justify-center" style={{ color: 'var(--color-text-muted)' }}>
        <span>Pages will appear here as they&apos;re generated</span>
      </div>
    )
  }

  if (!iframeSrc) {
    return null
  }

  if (mobilePreview) {
    return (
      <div
        className="flex flex-1 justify-center overflow-auto py-6"
        style={{ backgroundColor: 'var(--color-bg-base)', minHeight: 0 }}
      >
        <div
          className="flex flex-col shrink-0 rounded-[2rem] overflow-hidden"
          style={{
            width: 390,
            boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 0 0 8px var(--color-bg-elevated), 0 0 0 9px var(--color-border), 0 16px 48px rgba(0,0,0,0.5)',
            alignSelf: 'flex-start',
          }}
        >
          {/* Phone notch bar */}
          <div
            className="flex items-center justify-center py-2 shrink-0"
            style={{ backgroundColor: 'var(--color-bg-elevated)' }}
          >
            <div
              className="rounded-full"
              style={{ width: 80, height: 6, backgroundColor: 'var(--color-border-bright)' }}
            />
          </div>
          <iframe
            src={iframeSrc}
            title={page.title}
            sandbox="allow-scripts allow-same-origin"
            style={{
              width: 390,
              height: 720,
              border: 'none',
            }}
          />
          {/* Home indicator */}
          <div
            className="flex items-center justify-center py-2 shrink-0"
            style={{ backgroundColor: 'var(--color-bg-elevated)' }}
          >
            <div
              className="rounded-full"
              style={{ width: 120, height: 4, backgroundColor: 'var(--color-border-bright)' }}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      {/* Browser chrome */}
      <div
        className="flex items-center gap-2 px-4 py-2 shrink-0 border-b"
        style={{ backgroundColor: 'var(--color-bg-elevated)', borderColor: 'var(--color-border)' }}
      >
        {/* Traffic lights */}
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ff5f57' }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#febc2e' }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#28c840' }} />
        </div>
        {/* Address bar */}
        <div
          className="flex-1 px-3 py-1 rounded-md text-xs truncate"
          style={{
            backgroundColor: 'var(--color-bg-input)',
            color: 'var(--color-text-muted)',
            border: '1px solid var(--color-border)',
          }}
        >
          {page.title}
        </div>
      </div>
      <iframe
        src={iframeSrc}
        title={page.title}
        sandbox="allow-scripts allow-same-origin"
        className="w-full flex-1 border-0"
        style={{ minHeight: 0 }}
      />
    </div>
  )
}
