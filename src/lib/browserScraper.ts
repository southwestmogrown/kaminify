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

  const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl })
  const page = await browser.newPage()

  try {
    await page.setUserAgent(USER_AGENT)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 })

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
    await page.close()
    await browser.disconnect()
  }
}
