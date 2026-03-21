'use client'

import { useEffect, useRef, useState } from 'react'
import type { ClonedPage } from '@/lib/types'

interface PagePreviewProps {
  page: ClonedPage | null
  isLoading?: boolean
}

export default function PagePreview({ page, isLoading }: PagePreviewProps) {
  const blobUrlRef = useRef<string | null>(null)
  const [iframeSrc, setIframeSrc] = useState('')

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
      setIframeSrc('')
    }
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.slug])  // intentional: re-run only on slug change, not on html content change

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center" style={{ color: 'var(--color-text-muted)' }}>
        <span>Loading preview...</span>
      </div>
    )
  }

  if (!page) {
    return (
      <div className="flex flex-1 items-center justify-center" style={{ color: 'var(--color-text-muted)' }}>
        <span>Select a page to preview</span>
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
