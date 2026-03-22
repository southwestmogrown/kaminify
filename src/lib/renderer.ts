export async function renderSite(url: string): Promise<string> {
  const apiKey = process.env.BROWSERLESS_API_KEY
  if (!apiKey) throw new Error('BROWSERLESS_API_KEY is not configured')

  const base =
    process.env.BROWSERLESS_BASE_URL ?? 'https://production-sfo.browserless.io'

  const response = await fetch(`${base}/content?token=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, waitForTimeout: 3000 }),
  })

  if (!response.ok) {
    throw new Error(`Browserless error: ${response.status} ${response.statusText}`)
  }

  return response.text()
}
