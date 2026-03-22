import * as cheerio from 'cheerio'
import type { ScrapedSite } from './types'
import { renderSite } from './renderer'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

function isContentThin(html: string): boolean {
  const $ = cheerio.load(html)
  const headings = $('h1, h2, h3, h4').length
  const paragraphs = $('p').filter((_, el) => $(el).text().trim().length > 30).length
  return headings < 2 && paragraphs < 2
}

export async function scrapeSite(url: string): Promise<ScrapedSite> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)

  let html: string
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`)
    }
    html = await response.text()
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Timeout: ${url} did not respond within 10 seconds`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }

  const $ = cheerio.load(html)

  // Extract page title
  const title = $('title').first().text().trim()

  // Resolve base URL (respects <base href> if present)
  const baseHref = $('base[href]').attr('href')
  const resolvedBase = baseHref ? new URL(baseHref, url).href : url

  // Extract inline <style> tag content
  const inlineStyles: string[] = []
  $('style').each((_, el) => {
    inlineStyles.push($(el).text())
  })

  // Find all linked stylesheets and fetch them
  const stylesheetUrls: string[] = []
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr('href')
    if (href) {
      try {
        stylesheetUrls.push(new URL(href, resolvedBase).href)
      } catch {
        // skip malformed href
      }
    }
  })

  const fetchedStyles = await Promise.allSettled(
    stylesheetUrls.map((cssUrl) =>
      fetch(cssUrl, { headers: { 'User-Agent': USER_AGENT } }).then((r) =>
        r.ok ? r.text() : ''
      )
    )
  )

  const linkedCss = fetchedStyles
    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
    .map((r) => r.value)

  const css = [...inlineStyles, ...linkedCss].join('\n')

  // Collect inline script content before stripping (animation/canvas patterns)
  const scriptBlocks: string[] = []
  $('script:not([src])').each((_, el) => {
    const content = $(el).html()?.trim() ?? ''
    if (content) scriptBlocks.push(content)
  })
  const scripts = scriptBlocks.join('\n/* --- */\n')

  // Strip scripts and noscript before returning HTML
  $('script, noscript').remove()

  const result: ScrapedSite = {
    url,
    html: $.html(),
    css,
    scripts,
    title,
  }

  if (isContentThin(result.html)) {
    try {
      const renderedHtml = await renderSite(url)
      const $r = cheerio.load(renderedHtml)
      $r('script, noscript').remove()
      result.html = $r.html()
    } catch {
      // headless failed — return static result as-is
    }
  }

  return result
}
