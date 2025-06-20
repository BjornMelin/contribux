// Test setup configuration for Vitest
import { config } from "dotenv";
import { vi } from "vitest";

// Load test environment variables
config({ path: ".env.test" });

// Set test environment
process.env.NODE_ENV = "test";

// Default test database URL if not provided
if (!process.env.DATABASE_URL_TEST && !process.env.DATABASE_URL) {
  console.warn("⚠️ No test database URL configured. Some tests may fail.");
}

// Suppress console.log in tests unless debugging
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}
