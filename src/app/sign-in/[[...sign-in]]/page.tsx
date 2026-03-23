import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <main
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: 'var(--color-bg-primary)' }}
    >
      <SignIn />
    </main>
  )
}
