/**
 * Example: How to use CSP nonces with inline scripts
 * This demonstrates the pattern for adding secure inline scripts
 */

import { headers } from 'next/headers'

interface NonceScriptExampleProps {
  scriptContent: string
  id?: string
}

/**
 * Server Component that demonstrates nonce usage
 * The nonce is retrieved from headers set by middleware
 */
export async function NonceScriptExample({ scriptContent, id }: NonceScriptExampleProps) {
  const headersList = await headers()
  const nonce = headersList.get('x-nonce')

  if (!nonce) {
    return null
  }

  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: Educational nonce script example
    <script id={id} nonce={nonce} dangerouslySetInnerHTML={{ __html: scriptContent }} />
  )
}

/**
 * Client Component example that receives nonce as prop
 * Use this pattern when you need client-side script injection
 */
export function ClientNonceScript({
  nonce,
  scriptContent,
  id,
}: NonceScriptExampleProps & { nonce: string }) {
  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: Educational nonce script example
    <script id={id} nonce={nonce} dangerouslySetInnerHTML={{ __html: scriptContent }} />
  )
}

/**
 * Example usage in a page or component:
 *
 * // Server Component
 * export default async function MyPage() {
 *   const headersList = await headers()
 *   const nonce = headersList.get('x-nonce')
 *
 *   return (
 *     <div>
 *       <h1>My Page</h1>
 *       {nonce && (
 *         <script nonce={nonce} dangerouslySetInnerHTML={{
 *           __html: `console.log('Page loaded');`
 *         }} />
 *       )}
 *     </div>
 *   )
 * }
 *
 * // Or use the helper component:
 * <NonceScriptExample scriptContent="console.log('Using helper');" />
 */
