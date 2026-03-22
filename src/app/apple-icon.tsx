import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 40,
          background: '#0d0f18',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: '50%',
            background: '#f97316',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              color: '#ffffff',
              fontSize: 56,
              fontWeight: 700,
              lineHeight: 1,
              fontFamily: 'sans-serif',
            }}
          >
            k
          </span>
        </div>
        <span
          style={{
            color: '#e8e6e0',
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '-0.5px',
            fontFamily: 'sans-serif',
          }}
        >
          kaminify
        </span>
      </div>
    ),
    { ...size }
  )
}
