import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session extends DefaultSession {
    accessToken?: string
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      login?: string
      githubId?: number
      githubUsername?: string | undefined
      connectedProviders?: string[]
      primaryProvider?: string
    } & DefaultSession['user']
  }

  interface User {
    id: string
    email: string
    emailVerified: Date | null
    name?: string | null
    image?: string | null
    login?: string
    githubId?: number
    githubUsername?: string
  }

  interface JWT {
    accessToken?: string
    refreshToken?: string
    login?: string
    githubId?: number
    provider?: string
  }
}
