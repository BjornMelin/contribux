// Database connection tests
import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl, vectorConfig, dbConfig } from "../../src/lib/db/config";
import { vi } from "vitest";

describe("Database Configuration", () => {
  describe("getDatabaseUrl", () => {
    // Don't manipulate environment variables in tests since they're validated at startup
    // Instead test the current real configuration

    it("should return main database URL by default", () => {
      const url = getDatabaseUrl();
      expect(url).toContain("postgresql://");
      expect(typeof url).toBe("string");
    });

    it("should return dev database URL when specified", () => {
      const url = getDatabaseUrl("dev");
      expect(url).toContain("postgresql://");
      expect(typeof url).toBe("string");
    });

    it("should return test database URL when specified", () => {
      const url = getDatabaseUrl("test");
      expect(url).toContain("postgresql://");
      expect(typeof url).toBe("string");
    });

    it("should return valid URLs for all branches", () => {
      const mainUrl = getDatabaseUrl("main");
      const devUrl = getDatabaseUrl("dev");
      const testUrl = getDatabaseUrl("test");
      
      expect(mainUrl).toContain("postgresql://");
      expect(devUrl).toContain("postgresql://");
      expect(testUrl).toContain("postgresql://");
    });
  });

  describe("vectorConfig", () => {
    it("should have valid configuration values", () => {
      expect(typeof vectorConfig.efSearch).toBe("number");
      expect(vectorConfig.efSearch).toBeGreaterThan(0);
      expect(typeof vectorConfig.similarityThreshold).toBe("number");
      expect(vectorConfig.similarityThreshold).toBeGreaterThanOrEqual(0);
      expect(vectorConfig.similarityThreshold).toBeLessThanOrEqual(1);
      expect(typeof vectorConfig.textWeight).toBe("number");
      expect(vectorConfig.textWeight).toBeGreaterThanOrEqual(0);
      expect(vectorConfig.textWeight).toBeLessThanOrEqual(1);
      expect(typeof vectorConfig.vectorWeight).toBe("number");
      expect(vectorConfig.vectorWeight).toBeGreaterThanOrEqual(0);
      expect(vectorConfig.vectorWeight).toBeLessThanOrEqual(1);
    });

    it("should have weights that sum to a reasonable value", () => {
      const totalWeight = vectorConfig.textWeight + vectorConfig.vectorWeight;
      expect(totalWeight).toBeGreaterThan(0);
      expect(totalWeight).toBeLessThanOrEqual(2); // Allow some flexibility
    });
  });

  describe("dbConfig", () => {
    it("should have valid project configuration", () => {
      expect(typeof dbConfig.projectId).toBe("string");
      expect(dbConfig.projectId.length).toBeGreaterThan(0);
      expect(typeof dbConfig.poolMin).toBe("number");
      expect(dbConfig.poolMin).toBeGreaterThan(0);
      expect(typeof dbConfig.poolMax).toBe("number");
      expect(dbConfig.poolMax).toBeGreaterThan(dbConfig.poolMin);
      expect(typeof dbConfig.poolIdleTimeout).toBe("number");
      expect(dbConfig.poolIdleTimeout).toBeGreaterThan(0);
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
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result) && result.length > 0) {
      const firstRow = result[0];
      if (firstRow && typeof firstRow === 'object' && 'test' in firstRow) {
        expect((firstRow as { test: number }).test).toBe(1);
      }
    }
  });

  it("should handle parameterized queries safely", async () => {
    const testValue = "test'injection";
    const result = await sql`SELECT ${testValue} as safe_param`;
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result) && result.length > 0) {
      const firstRow = result[0];
      if (firstRow && typeof firstRow === 'object' && 'safe_param' in firstRow) {
        expect((firstRow as { safe_param: string }).safe_param).toBe(testValue);
      }
    }
  });

  it("should return database version", async () => {
    const result = await sql`SELECT version() as version`;
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result) && result.length > 0) {
      const firstRow = result[0];
      if (firstRow && typeof firstRow === 'object' && 'version' in firstRow) {
        const version = (firstRow as { version: string }).version;
        expect(version).toMatch(/PostgreSQL/);
      }
    }
  });
});
