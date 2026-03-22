declare module '@sparticuz/chromium-min' {
  const chromium: {
    args: string[]
    defaultViewport: { width: number; height: number } | null
    executablePath: (remotePath?: string) => Promise<string>
  }
  export default chromium
}
