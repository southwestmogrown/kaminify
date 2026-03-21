import archiver from 'archiver'
import { Writable } from 'stream'
import type { ClonedPage } from '@/lib/types'

export async function POST(request: Request): Promise<Response> {
  let body: { pages?: ClonedPage[] }
  try {
    body = await request.json()
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const pages = body?.pages
  if (!Array.isArray(pages)) {
    return new Response('Bad Request', { status: 400 })
  }

  const chunks: Uint8Array[] = []
  const sink = new Writable({
    write(chunk: Buffer, _encoding: BufferEncoding, cb: () => void) {
      chunks.push(chunk)
      cb()
    },
  })

  const archive = archiver('zip', { zlib: { level: 6 } })
  archive.pipe(sink)

  for (const page of pages) {
    const filename = page.slug === 'index' ? 'index.html' : `${page.slug}.html`
    archive.append(page.html, { name: filename })
  }

  // Register finish/error listeners before calling finalize() to avoid missing the event
  const sinkDone = new Promise<void>((resolve, reject) => {
    sink.on('finish', resolve)
    sink.on('error', reject)
  })

  await archive.finalize()
  await sinkDone

  const buffer = Buffer.concat(chunks)
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="cloned-site.zip"',
    },
  })
}
