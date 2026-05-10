/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/search/repositories/route'

describe('repository search route', () => {
  it('reports pagination metadata from the full filtered result set', async () => {
    const pageOne = await GET(
      new NextRequest('http://localhost:3000/api/search/repositories?q=react&per_page=1&page=1')
    )
    const pageOneBody = await pageOne.json()

    expect(pageOne.status).toBe(200)
    expect(pageOneBody.data.repositories).toHaveLength(1)
    expect(pageOneBody.data.total_count).toBe(2)
    expect(pageOneBody.data.has_more).toBe(true)

    const pageTwo = await GET(
      new NextRequest('http://localhost:3000/api/search/repositories?q=react&per_page=1&page=2')
    )
    const pageTwoBody = await pageTwo.json()

    expect(pageTwo.status).toBe(200)
    expect(pageTwoBody.data.repositories).toHaveLength(1)
    expect(pageTwoBody.data.total_count).toBe(2)
    expect(pageTwoBody.data.has_more).toBe(false)
  })

  it('honors sort and order before paginating demo repositories', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/search/repositories?q=react&sort=stars&order=asc&per_page=2'
      )
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(
      body.data.repositories.map((repository: { fullName: string }) => repository.fullName)
    ).toEqual(['vercel/next.js', 'facebook/react'])
  })
})
