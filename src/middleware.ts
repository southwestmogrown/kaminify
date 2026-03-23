import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest, NextFetchEvent } from 'next/server'

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (request.nextUrl.pathname.startsWith('/__clerk')) {
    const clerkUrl = new URL(
      request.nextUrl.pathname.replace('/__clerk', '') + request.nextUrl.search,
      'https://clerk.kaminify.com'
    )
    return NextResponse.rewrite(clerkUrl)
  }

  return clerkMiddleware()(request, event)
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|ico|png|svg|jpg|jpeg|gif|woff2?|ttf)).*)',
    '/(api|trpc)(.*)',
    '/__clerk(.*)',
  ],
}