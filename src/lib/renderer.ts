import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium-min'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

async function getExecutablePath(): Promise<string> {
  if (process.env.CHROMIUM_EXECUTABLE_PATH) {
    return process.env.CHROMIUM_EXECUTABLE_PATH
  }
  return chromium.executablePath(process.env.CHROMIUM_REMOTE_EXEC_PATH ?? '')
}

export async function renderSite(url: string): Promise<string> {
  const executablePath = await getExecutablePath()
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: true,
  })
  try {
    const page = await browser.newPage()
    await page.setUserAgent(USER_AGENT)
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 25_000 })
    return await page.content()
  } finally {
    await browser.close()
  }
}
