import { clerkMiddleware } from '@clerk/nextjs/server'

export default clerkMiddleware()

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|ico|png|svg|jpg|jpeg|gif|woff2?|ttf)).*)',
    '/(api|trpc)(.*)',
  ],
}
