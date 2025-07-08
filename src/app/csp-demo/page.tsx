/**
 * CSP Nonce Demo Page
 * Demonstrates secure inline script execution with dynamic nonces
 */

import { headers } from 'next/headers'

export default async function CSPDemoPage() {
  const headersList = await headers()
  const nonce = headersList.get('x-nonce')

  return (
    <div className="container mx-auto p-8">
      <h1 className="mb-6 font-bold text-3xl">CSP Nonce Demo</h1>

      <div className="space-y-6">
        <section>
          <h2 className="mb-4 font-semibold text-2xl">How CSP Nonces Work</h2>
          <p className="mb-4 text-gray-600">
            Each request generates a unique cryptographically secure nonce. Scripts with the correct
            nonce can execute, while others are blocked.
          </p>
          <div className="rounded bg-gray-100 p-4">
            <code className="text-sm">Current Nonce: {nonce || 'Not available'}</code>
          </div>
        </section>

        <section>
          <h2 className="mb-4 font-semibold text-2xl">Secure Script Example</h2>
          <p className="mb-4 text-gray-600">
            This script includes the nonce and will execute successfully:
          </p>
          <div className="rounded bg-green-50 p-4">
            <p id="demo-output" className="text-green-800">
              Waiting for script execution...
            </p>
          </div>
        </section>

        <section>
          <h2 className="mb-4 font-semibold text-2xl">Security Benefits</h2>
          <ul className="list-inside list-disc space-y-2 text-gray-600">
            <li>Prevents XSS attacks by blocking unauthorized inline scripts</li>
            <li>Each request gets a unique nonce (no reuse)</li>
            <li>128-bit cryptographically secure random values</li>
            <li>Compatible with server-side rendering</li>
          </ul>
        </section>
      </div>

      {/* Secure inline script with nonce */}
      {nonce && (
        <script
          nonce={nonce}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Educational CSP nonce demonstration
          dangerouslySetInnerHTML={{
            __html: `
              // This script has a valid nonce and will execute
              document.addEventListener('DOMContentLoaded', function() {
                const output = document.getElementById('demo-output');
                if (output) {
                  output.textContent = '✓ Script executed successfully with nonce!';
                  output.className = 'text-green-800 font-semibold';
                }
                console.log('CSP Demo: Nonce-protected script executed');
              });
            `,
          }}
        />
      )}

      {/* This would be blocked without a nonce:
      <script dangerouslySetInnerHTML={{
        __html: `console.log('This would be blocked by CSP');`
      }} />
      */}
    </div>
  )
}
