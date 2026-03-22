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
        className="flex flex-1 justify-center overflow-auto"
        style={{ backgroundColor: 'var(--color-bg-base)', minHeight: 0 }}
      >
        <iframe
          src={iframeSrc}
          title={page.title}
          sandbox="allow-scripts allow-same-origin"
          style={{
            width: 375,
            flexShrink: 0,
            border: 'none',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.4)',
            alignSelf: 'stretch',
          }}
        />
      </div>
    )
  }

  return (
    <iframe
      src={iframeSrc}
      title={page.title}
      sandbox="allow-scripts allow-same-origin"
      className="w-full flex-1 border-0"
      style={{ minHeight: 0 }}
    />
  )
}
