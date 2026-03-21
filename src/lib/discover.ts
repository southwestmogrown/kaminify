import * as cheerio from 'cheerio'
import type { Element } from 'domhandler'
import type { DiscoveredPage, ScrapedSite } from './types'

const EXCLUDED_PATH_PREFIXES = ['/cdn', '/assets', '/static/assets']
const EXCLUDED_PROTOCOLS = ['mailto:', 'tel:', 'javascript:']

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    u.search = ''
    // strip trailing slash except for root
    if (u.pathname !== '/') {
      u.pathname = u.pathname.replace(/\/$/, '')
    }
    return u.href
  } catch {
    return url
  }
}

function urlToSlug(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const slug = pathname
      .replace(/^\/|\/$/g, '')  // strip leading/trailing slashes
      .replace(/\//g, '-')       // slashes → hyphens
      .toLowerCase()
    return slug || 'index'
  } catch {
    return 'index'
  }
}

function isInternalUrl(href: string, baseOrigin: string): boolean {
  try {
    // Relative URLs are always internal
    if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('//')) {
      return true
    }
    const u = new URL(href)
    return u.origin === baseOrigin
  } catch {
    return false
  }
}

function isExcluded(url: string): boolean {
  // Exclude anchor-only, mailto:, tel:, javascript:
  if (url.startsWith('#')) return true
  for (const proto of EXCLUDED_PROTOCOLS) {
    if (url.startsWith(proto)) return true
  }
  // Exclude CDN/assets paths
  try {
    const pathname = new URL(url).pathname
    for (const prefix of EXCLUDED_PATH_PREFIXES) {
      if (pathname.startsWith(prefix)) return true
    }
  } catch {
    // relative URL — check against raw href
    for (const prefix of EXCLUDED_PATH_PREFIXES) {
      if (url.startsWith(prefix)) return true
    }
  }
  return false
}

function navLabelFromEl($: cheerio.CheerioAPI, el: Element): string {
  const text = $(el).text().trim()
  if (text) return text
  // Fallback: last path segment of href
  const href = $(el).attr('href') ?? ''
  try {
    const parts = new URL(href).pathname.replace(/\/$/, '').split('/')
    return parts[parts.length - 1] || 'Home'
  } catch {
    return href || 'Home'
  }
}

export function discoverPages(site: ScrapedSite, maxPages = 6): DiscoveredPage[] {
  const $ = cheerio.load(site.html)
  const baseUrl = site.url
  const baseOrigin = new URL(baseUrl).origin

  // Always include root as first page
  const rootUrl = new URL(baseUrl).origin + '/'
  const seen = new Set<string>([normalizeUrl(rootUrl)])
  const pages: DiscoveredPage[] = [
    {
      url: rootUrl,
      title: $('title').first().text().trim() || 'Home',
      slug: 'index',
      navLabel: 'Home',
    },
  ]

  // Find nav links — prefer <nav>, fall back to <header>, then all <a> tags
  let navEl = $('nav').first()
  if (!navEl.length) navEl = $('header').first()
  const linkSource = navEl.length ? navEl : $('body')

  linkSource.find('a[href]').each((_, el) => {
    if (pages.length >= maxPages) return false // break

    const rawHref = $(el).attr('href')!

    if (isExcluded(rawHref)) return
    if (!isInternalUrl(rawHref, baseOrigin)) return

    let absoluteUrl: string
    try {
      absoluteUrl = new URL(rawHref, baseUrl).href
    } catch {
      return
    }

    // Skip pure anchor links (same page, different hash)
    const withoutHash = absoluteUrl.split('#')[0]
    const normalized = normalizeUrl(withoutHash)

    if (seen.has(normalized)) return
    seen.add(normalized)

    const slug = urlToSlug(normalized)
    const navLabel = navLabelFromEl($, el)

    pages.push({
      url: normalized,
      title: navLabel,
      slug,
      navLabel,
    })
  })

  return pages.slice(0, maxPages)
}
