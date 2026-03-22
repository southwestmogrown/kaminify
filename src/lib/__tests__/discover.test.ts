import { describe, it, expect } from 'vitest'
import { discoverPages } from '../discover'
import type { ScrapedSite } from '../types'

function makeSite(html: string, url = 'https://example.com'): ScrapedSite {
  return { url, html, css: '', title: '', jsRendered: false }
}

describe('discoverPages', () => {
  it('always returns the root URL as the first page with slug "index"', () => {
    const site = makeSite('<html><head></head><body></body></html>')
    const pages = discoverPages(site)
    expect(pages[0].slug).toBe('index')
    expect(pages[0].url).toBe('https://example.com/')
  })

  it('returns at least 1 page (root) even with no nav links', () => {
    const site = makeSite('<html><head></head><body><p>No links here</p></body></html>')
    const pages = discoverPages(site)
    expect(pages.length).toBeGreaterThanOrEqual(1)
  })

  it('extracts internal nav links from <nav> element', () => {
    const site = makeSite(`
      <html><head></head><body>
        <nav>
          <a href="/about">About</a>
          <a href="/contact">Contact</a>
        </nav>
      </body></html>
    `)
    const pages = discoverPages(site)
    const slugs = pages.map((p) => p.slug)
    expect(slugs).toContain('about')
    expect(slugs).toContain('contact')
  })

  it('falls back to <header> when no <nav> element exists', () => {
    const site = makeSite(`
      <html><head></head><body>
        <header>
          <a href="/blog">Blog</a>
        </header>
      </body></html>
    `)
    const pages = discoverPages(site)
    const slugs = pages.map((p) => p.slug)
    expect(slugs).toContain('blog')
  })

  it('excludes #anchor-only links', () => {
    const site = makeSite(`
      <html><head></head><body>
        <nav>
          <a href="#section1">Section 1</a>
          <a href="/about">About</a>
        </nav>
      </body></html>
    `)
    const pages = discoverPages(site)
    const urls = pages.map((p) => p.url)
    // No page for #section1
    expect(urls.every((u) => !u.includes('#'))).toBe(true)
    expect(pages.map((p) => p.slug)).toContain('about')
  })

  it('excludes mailto: links', () => {
    const site = makeSite(`
      <html><head></head><body>
        <nav>
          <a href="mailto:hello@example.com">Email</a>
          <a href="/about">About</a>
        </nav>
      </body></html>
    `)
    const pages = discoverPages(site)
    const urls = pages.map((p) => p.url)
    expect(urls.every((u) => !u.startsWith('mailto:'))).toBe(true)
  })

  it('excludes tel: links', () => {
    const site = makeSite(`
      <html><head></head><body>
        <nav>
          <a href="tel:+1234567890">Call us</a>
          <a href="/about">About</a>
        </nav>
      </body></html>
    `)
    const pages = discoverPages(site)
    const urls = pages.map((p) => p.url)
    expect(urls.every((u) => !u.startsWith('tel:'))).toBe(true)
  })

  it('excludes links to /cdn paths', () => {
    const site = makeSite(`
      <html><head></head><body>
        <nav>
          <a href="/cdn/file.png">Asset</a>
          <a href="/about">About</a>
        </nav>
      </body></html>
    `)
    const pages = discoverPages(site)
    const urls = pages.map((p) => p.url)
    expect(urls.every((u) => !u.includes('/cdn'))).toBe(true)
  })

  it('excludes external links (different domain)', () => {
    const site = makeSite(`
      <html><head></head><body>
        <nav>
          <a href="https://other.com/page">External</a>
          <a href="/about">About</a>
        </nav>
      </body></html>
    `)
    const pages = discoverPages(site)
    const urls = pages.map((p) => p.url)
    expect(urls.every((u) => !u.includes('other.com'))).toBe(true)
  })

  it('deduplicates identical URLs (trailing slash normalization)', () => {
    const site = makeSite(`
      <html><head></head><body>
        <nav>
          <a href="/about">About 1</a>
          <a href="/about/">About 2</a>
        </nav>
      </body></html>
    `)
    const pages = discoverPages(site)
    const aboutPages = pages.filter((p) => p.slug === 'about')
    expect(aboutPages.length).toBe(1)
  })

  it('resolves relative URLs to absolute', () => {
    const site = makeSite(`
      <html><head></head><body>
        <nav><a href="about">About</a></nav>
      </body></html>
    `)
    const pages = discoverPages(site)
    const aboutPage = pages.find((p) => p.slug === 'about')
    expect(aboutPage?.url).toMatch(/^https:\/\//)
  })

  it('generates correct slugs from URL paths', () => {
    const site = makeSite(`
      <html><head></head><body>
        <nav>
          <a href="/about-us">About Us</a>
          <a href="/blog/posts">Blog Posts</a>
        </nav>
      </body></html>
    `)
    const pages = discoverPages(site)
    const slugs = pages.map((p) => p.slug)
    expect(slugs).toContain('about-us')
    expect(slugs).toContain('blog-posts')
  })

  it('respects the maxPages cap', () => {
    const links = Array.from({ length: 10 }, (_, i) => `<a href="/page-${i}">Page ${i}</a>`).join('')
    const site = makeSite(`<html><head></head><body><nav>${links}</nav></body></html>`)
    const pages = discoverPages(site, 3)
    expect(pages.length).toBeLessThanOrEqual(3)
  })

  it('uses nav link text as navLabel', () => {
    const site = makeSite(`
      <html><head></head><body>
        <nav><a href="/about">About Us</a></nav>
      </body></html>
    `)
    const pages = discoverPages(site)
    const aboutPage = pages.find((p) => p.slug === 'about')
    expect(aboutPage?.navLabel).toBe('About Us')
  })
})
