import { clerkMiddleware } from '@clerk/nextjs/server'

export default clerkMiddleware({
  frontendApiProxy: {
    enabled: true,
  },
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|ico|png|svg|jpg|jpeg|gif|woff2?|ttf)).*)',
    '/(api|trpc|__clerk)(.*)',
  ],
}
