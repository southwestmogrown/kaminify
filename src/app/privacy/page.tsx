import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy · kaminify',
  description: 'How kaminify handles your data, API keys, and privacy.',
}

export default function PrivacyPage() {
  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: 'var(--color-bg-primary)' }}
    >
      <header
        className="px-6 py-4 border-b flex items-center gap-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
          <span className="logo-dot" />
          kaminify
        </h1>
        <Link
          href="/"
          className="text-sm ml-auto"
          style={{ color: 'var(--color-accent)' }}
        >
          ← Back to app
        </Link>
      </header>

      <article className="max-w-2xl mx-auto px-6 py-16" style={{ color: 'var(--color-text-secondary)' }}>
        <h2
          className="text-3xl font-bold mb-8"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Privacy Policy
        </h2>

        <p className="text-sm mb-8" style={{ color: 'var(--color-text-muted)' }}>
          Last updated: March 2026
        </p>

        <div className="space-y-8 text-sm leading-relaxed">

          <section>
            <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              What we collect
            </h3>
            <p>
              <strong style={{ color: 'var(--color-text-secondary)' }}>URLs you submit.</strong> When you use kaminify, you paste two URLs — a design source and a content source. These URLs are processed in memory to generate your cloned site and are not stored on our servers after the session ends. We do not persist, log, or share the URLs you submit.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              API keys
            </h3>
            <p className="mb-3">
              If you choose to provide your own Anthropic API key (BYOK mode), that key is transmitted directly to Anthropic&apos;s API on your behalf. We store your key encrypted at rest in our database. We do not log, expose, or share your API key in any form.
            </p>
            <p>
              Your API key is used exclusively to power the site cloning generation on your behalf and is never used for any other purpose.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Authentication
            </h3>
            <p>
              We use Clerk for authentication. Your authentication credentials (email, password, OAuth tokens) are handled exclusively by Clerk and governed by Clerk&apos;s own{' '}
              <a
                href="https://clerk.com/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                style={{ color: 'var(--color-accent)' }}
              >
                Privacy Policy
              </a>
              . We never have access to your Clerk credentials.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              What we do NOT store
            </h3>
            <ul className="list-disc pl-5 space-y-1" style={{ color: 'var(--color-text-secondary)' }}>
              <li>Submitted URLs — processed in memory, not persisted</li>
              <li>Generated HTML — delivered as a download or preview, not stored server-side</li>
              <li>Your Anthropic API key — stored encrypted, never exposed in logs</li>
              <li>Browsing history or content from submitted URLs beyond what is needed for a single generation session</li>
            </ul>
          </section>

          <section>
            <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Cookies
            </h3>
            <p>
              kaminify uses Clerk for authentication, which may set session cookies. We do not use tracking cookies, analytics cookies, or advertising cookies.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Data deletion
            </h3>
            <p>
              You can delete your account and all associated data (including any stored API key) at any time by contacting us at{' '}
              <a
                href="mailto:support@kaminify.com"
                className="underline"
                style={{ color: 'var(--color-accent)' }}
              >
                support@kaminify.com
              </a>
              . Account deletion removes your user record and stored API key from our systems within 30 days.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Contact
            </h3>
            <p>
              Questions about this privacy policy? Reach us at{' '}
              <a
                href="mailto:support@kaminify.com"
                className="underline"
                style={{ color: 'var(--color-accent)' }}
              >
                support@kaminify.com
              </a>
              .
            </p>
          </section>

        </div>
      </article>
    </main>
  )
}
