import puppeteer from 'puppeteer-core'
import * as cheerio from 'cheerio'
import type { ScrapedSite } from './types'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

export async function scrapeWithBrowser(url: string): Promise<ScrapedSite> {
  const wsUrl = process.env.BROWSERLESS_WS_URL
  if (!wsUrl) {
    throw new Error('BROWSERLESS_WS_URL is not configured — browser rendering unavailable')
  }

  const endpoint = new URL(wsUrl)
  if (!endpoint.pathname || endpoint.pathname === '/') {
    endpoint.pathname = '/chromium'
  }
  const browser = await puppeteer.connect({ browserWSEndpoint: endpoint.toString() })

  let page: Awaited<ReturnType<typeof browser.newPage>>
  try {
    page = await browser.newPage()
  } catch (err) {
    await browser.disconnect()
    throw new Error(`Browser: failed to open new page — ${err instanceof Error ? err.message : JSON.stringify(err)}`)
  }

  try {
    await page.setUserAgent(USER_AGENT)

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    } catch (err) {
      throw new Error(`Browser: failed to navigate to ${url} — ${err instanceof Error ? err.message : JSON.stringify(err)}`)
    }

    const html = await page.content()
    const $ = cheerio.load(html)

    const title = $('title').first().text().trim()

    const baseHref = $('base[href]').attr('href')
    const resolvedBase = baseHref ? new URL(baseHref, url).href : url

    const inlineStyles: string[] = []
    $('style').each((_, el) => {
      inlineStyles.push($(el).text())
    })

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

    $('script, noscript').remove()

    return { url, html: $.html(), css, title, jsRendered: true }
  } finally {
    await page.close().catch((err) =>
      console.error('Browser: failed to close page —', err instanceof Error ? err.message : JSON.stringify(err))
    )
    await browser.disconnect().catch((err) =>
      console.error('Browser: failed to disconnect —', err instanceof Error ? err.message : JSON.stringify(err))
    )
  }
}
