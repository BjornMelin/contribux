/**
 * Test script to verify Pino logging integration
 * Run with: node -r ts-node/register src/lib/logging/test-pino.ts
 */

import { logger, securityLogger } from '@/lib/logging'

async function testPinoLogging() {
  console.log('Testing Pino structured logging...\n')

  // Test basic logging
  logger.info('Application started', {
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    component: 'test-runner',
  })

  // Test error logging
  try {
    throw new Error('Test error for logging')
  } catch (error) {
    logger.error('Test error occurred', error, {
      component: 'test-runner',
      operation: 'error-test',
    })
  }

  // Test security logging
  securityLogger.authenticationSuccess('user123', {
    ip: '192.168.1.100',
    userAgent: 'Mozilla/5.0 Test Browser',
    component: 'test-runner',
  })

  // Test performance logging
  const startTime = Date.now()
  await new Promise(resolve => setTimeout(resolve, 100))
  const duration = Date.now() - startTime

  logger.performance('Test operation completed', {
    operation: 'test-delay',
    duration,
    component: 'test-runner',
  })

  // Test child logger
  const childLogger = logger.child({
    requestId: 'req-123',
    userId: 'user456',
  })

  childLogger.info('Child logger test', {
    operation: 'child-test',
    component: 'test-runner',
  })

  // Test database logging
  logger.database('Database query executed', {
    operation: 'SELECT',
    duration: 45,
    success: true,
    component: 'test-runner',
  })

  // Test API logging
  logger.api('API request processed', {
    statusCode: 200,
    duration: 120,
    component: 'test-runner',
  })

  console.log('\nPino logging test completed. Check the output above for structured JSON logs.')
}

// Run the test
testPinoLogging().catch(console.error)
