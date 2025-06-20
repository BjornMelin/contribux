import { ImageResponse } from 'next/og'

export const size = {
  width: 512,
  height: 512,
}
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        fontSize: 320,
        background: 'linear-gradient(135deg, #000000 0%, #333333 100%)',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontFamily: 'Inter, sans-serif',
        fontWeight: 700,
        borderRadius: '64px',
        border: '8px solid #ffffff',
      }}
    >
      C
    </div>,
    {
      ...size,
    }
  )
}
