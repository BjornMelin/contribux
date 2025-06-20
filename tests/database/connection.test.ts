// Database connection tests
import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl, vectorConfig, dbConfig } from "../../src/lib/db/config";
import { env } from "../../src/lib/validation/env";
import { vi } from "vitest";

describe("Database Configuration", () => {
  describe("getDatabaseUrl", () => {
    beforeEach(() => {
      // Reset environment variables
      delete process.env.DATABASE_URL_DEV;
      delete process.env.DATABASE_URL_TEST;
      process.env.DATABASE_URL = "postgresql://test@localhost/test";
    });

    it("should return main database URL by default", () => {
      const url = getDatabaseUrl();
      expect(url).toBe(env.DATABASE_URL);
    });

    it("should return dev database URL when specified", () => {
      process.env.DATABASE_URL_DEV = "postgresql://test@localhost/test_dev";
      const url = getDatabaseUrl("dev");
      expect(url).toBe(process.env.DATABASE_URL_DEV);
    });

    it("should return test database URL when specified", () => {
      process.env.DATABASE_URL_TEST = "postgresql://test@localhost/test_test";
      const url = getDatabaseUrl("test");
      expect(url).toBe(process.env.DATABASE_URL_TEST);
    });

    it("should fallback to main URL if branch-specific URL not set", () => {
      const devUrl = getDatabaseUrl("dev");
      const testUrl = getDatabaseUrl("test");
      
      expect(devUrl).toBe(env.DATABASE_URL);
      expect(testUrl).toBe(env.DATABASE_URL);
    });
  });

  describe("vectorConfig", () => {
    it("should have default values", () => {
      expect(vectorConfig.efSearch).toBe(200);
      expect(vectorConfig.similarityThreshold).toBe(0.7);
      expect(vectorConfig.textWeight).toBe(0.3);
      expect(vectorConfig.vectorWeight).toBe(0.7);
    });

    it("should parse environment variables", async () => {
      process.env.HNSW_EF_SEARCH = "300";
      process.env.VECTOR_SIMILARITY_THRESHOLD = "0.8";
      
      // Re-import to get updated config
      vi.resetModules();
      const { vectorConfig: updatedConfig } = await vi.importActual("../../src/lib/db/config");
      
      expect(updatedConfig.efSearch).toBe(300);
      expect(updatedConfig.similarityThreshold).toBe(0.8);
    });
  });

  describe("dbConfig", () => {
    it("should have default project configuration", () => {
      expect(dbConfig.projectId).toBe("soft-dew-27794389");
      expect(dbConfig.poolMin).toBe(2);
      expect(dbConfig.poolMax).toBe(20);
      expect(dbConfig.poolIdleTimeout).toBe(10000);
    });
  });
});

describe("Database Connection", () => {
  let sql: ReturnType<typeof neon>;

  beforeAll(() => {
    const testUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
    if (!testUrl) {
      throw new Error("No test database URL configured");
    }
    sql = neon(testUrl);
  });

  it("should successfully connect to database", async () => {
    const result = await sql`SELECT 1 as test`;
    expect(result).toHaveLength(1);
    expect(result[0].test).toBe(1);
  });

  it("should handle parameterized queries safely", async () => {
    const testValue = "test'injection";
    const result = await sql`SELECT ${testValue} as safe_param`;
    expect(result[0].safe_param).toBe(testValue);
  });

  it("should return database version", async () => {
    const result = await sql`SELECT version() as version`;
    expect(result[0].version).toMatch(/PostgreSQL/);
  });
});
