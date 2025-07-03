const express = require('express')
const bodyParser = require('body-parser')
const crypto = require('node:crypto')

const app = express()
const PORT = process.env.PORT || 3001
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'test-webhook-secret'

// Store received webhooks for testing
const webhooks = []
const MAX_WEBHOOKS = 100

// Middleware to capture raw body for signature verification
app.use(
  bodyParser.raw({
    type: 'application/json',
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf-8')
    },
  })
)

// Parse JSON after capturing raw body
app.use((req, res, next) => {
  if (req.rawBody) {
    try {
      req.body = JSON.parse(req.rawBody)
    } catch (_error) {
      return res.status(400).json({ error: 'Invalid JSON' })
    }
  }
  next()
})

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() })
})

// Get received webhooks
app.get('/webhooks', (_req, res) => {
  res.json({
    count: webhooks.length,
    webhooks: webhooks,
  })
})

// Clear webhooks
app.delete('/webhooks', (_req, res) => {
  webhooks.length = 0
  res.json({ message: 'Webhooks cleared' })
})

// Main webhook endpoint
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-hub-signature-256']
  const event = req.headers['x-github-event']
  const delivery = req.headers['x-github-delivery']

  // Verify signature
  if (signature && req.rawBody) {
    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET)
    const digest = `sha256=${hmac.update(req.rawBody).digest('hex')}`

    if (signature !== digest) {
      console.error('Invalid webhook signature')
      return res.status(401).json({ error: 'Invalid signature' })
    }
  }

  // Store webhook
  const webhook = {
    id: delivery,
    event: event,
    timestamp: new Date().toISOString(),
    headers: {
      'x-github-event': event,
      'x-github-delivery': delivery,
      'x-hub-signature-256': signature,
    },
    body: req.body,
  }

  webhooks.push(webhook)

  // Keep only recent webhooks
  if (webhooks.length > MAX_WEBHOOKS) {
    webhooks.shift()
  }

  console.log(`Received ${event} webhook: ${delivery}`)

  // Respond based on event type
  switch (event) {
    case 'ping':
      res.json({ message: 'pong' })
      break
    case 'push':
      res.json({ message: 'Push event received', commits: req.body.commits?.length || 0 })
      break
    case 'pull_request':
      res.json({ message: 'Pull request event received', action: req.body.action })
      break
    case 'issues':
      res.json({ message: 'Issue event received', action: req.body.action })
      break
    default:
      res.json({ message: `${event} event received` })
  }
})

// Get specific webhook by delivery ID
app.get('/webhooks/:id', (req, res) => {
  const webhook = webhooks.find(w => w.id === req.params.id)
  if (webhook) {
    res.json(webhook)
  } else {
    res.status(404).json({ error: 'Webhook not found' })
  }
})

// Start server
app.listen(PORT, () => {
  console.log(`Webhook test server listening on port ${PORT}`)
  console.log(`Webhook secret: ${WEBHOOK_SECRET.substring(0, 4)}...`)
})
