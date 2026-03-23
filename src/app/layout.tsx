import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'kaminify',
  description: 'Clone any site\'s design. Keep your content.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorBackground: '#12141f',
          colorInputBackground: '#0d0f18',
          colorText: '#e8e6e0',
          colorTextSecondary: '#9e9d98',
          colorInputText: '#e8e6e0',
          colorPrimary: '#f97316',
          colorDanger: '#f85149',
          borderRadius: '0.5rem',
        },
        elements: {
          card: 'border border-white/7 shadow-none',
          socialButtonsBlockButton: 'border border-white/7 bg-[#0d0f18] text-[#e8e6e0] hover:bg-[#12141f]',
          socialButtonsBlockButtonText: 'text-[#f97316]',
          socialButtonsProviderIcon: { style: { filter: 'brightness(0) saturate(100%) invert(56%) sepia(84%) saturate(1400%) hue-rotate(345deg) brightness(103%)' } },
          formButtonPrimary: 'bg-[#f97316] hover:bg-[#fb923c] text-black font-medium',
          footerActionLink: 'text-[#f97316] hover:text-[#fb923c]',
          identityPreviewEditButton: 'text-[#f97316]',
        },
      }}
    >
      <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
        <body className="antialiased">{children}</body>
      </html>
    </ClerkProvider>
  )
}
