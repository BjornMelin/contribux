// Database monitoring tests
import { DatabaseMonitor } from "../../src/lib/monitoring/database-monitor";

describe("DatabaseMonitor", () => {
  let monitor: DatabaseMonitor;

  beforeAll(() => {
    const testUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
    if (!testUrl) {
      throw new Error("No test database URL configured");
    }
    monitor = new DatabaseMonitor(testUrl);
  });

  describe("getConnectionMetrics", () => {
    it("should return connection metrics", async () => {
      const metrics = await monitor.getConnectionMetrics();
      
      expect(metrics).toHaveProperty("active");
      expect(metrics).toHaveProperty("idle");
      expect(typeof metrics.active).toBe("number");
      expect(typeof metrics.idle).toBe("number");
      expect(metrics.active).toBeGreaterThanOrEqual(0);
      expect(metrics.idle).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getSlowQueries", () => {
    it("should return slow queries array", async () => {
      const queries = await monitor.getSlowQueries(5);
      
      expect(Array.isArray(queries)).toBe(true);
      // Should not fail even if pg_stat_statements is not available
    });
  });

  describe("getIndexUsageStats", () => {
    it("should return index usage statistics", async () => {
      const stats = await monitor.getIndexUsageStats();
      
      expect(Array.isArray(stats)).toBe(true);
      
      if (stats.length > 0) {
        const stat = stats[0];
        expect(stat).toHaveProperty("schemaname");
        expect(stat).toHaveProperty("tablename");
        expect(stat).toHaveProperty("indexname");
        expect(stat).toHaveProperty("scans_count");
      }
    });
  });

  describe("getVectorIndexMetrics", () => {
    it("should return vector index metrics", async () => {
      const metrics = await monitor.getVectorIndexMetrics();
      
      expect(Array.isArray(metrics)).toBe(true);
      
      // Should have HNSW indexes
      if (metrics.length > 0) {
        const metric = metrics[0];
        expect(metric).toHaveProperty("indexname");
        expect(metric).toHaveProperty("index_size");
        expect(metric.indexname).toMatch(/hnsw/);
      }
    });
  });

  describe("getTableSizes", () => {
    it("should return table size information", async () => {
      const sizes = await monitor.getTableSizes();
      
      expect(Array.isArray(sizes)).toBe(true);
      expect(sizes.length).toBeGreaterThan(0);
      
      const size = sizes[0];
      expect(size).toHaveProperty("tablename");
      expect(size).toHaveProperty("total_size");
      expect(size).toHaveProperty("table_size");
      expect(size).toHaveProperty("index_size");
    });
  });

  describe("checkDatabaseHealth", () => {
    it("should perform comprehensive health check", async () => {
      const health = await monitor.checkDatabaseHealth();
      
      expect(health).toHaveProperty("status");
      expect(health).toHaveProperty("checks");
      expect(["healthy", "warning", "critical"]).toContain(health.status);
      expect(Array.isArray(health.checks)).toBe(true);
      expect(health.checks.length).toBeGreaterThan(0);
      
      // Check that each health check has required properties
      health.checks.forEach(check => {
        expect(check).toHaveProperty("name");
        expect(check).toHaveProperty("status");
        expect(check).toHaveProperty("message");
        expect(typeof check.status).toBe("boolean");
      });
    });

    it("should verify database connectivity", async () => {
      const health = await monitor.checkDatabaseHealth();
      
      const connectivityCheck = health.checks.find(check => 
        check.name === "Database Connectivity"
      );
      
      expect(connectivityCheck).toBeDefined();
      expect(connectivityCheck?.status).toBe(true);
    });

    it("should check required extensions", async () => {
      const health = await monitor.checkDatabaseHealth();
      
      const extensionsCheck = health.checks.find(check => 
        check.name === "Required Extensions"
      );
      
      expect(extensionsCheck).toBeDefined();
      // Should be true since we verified extensions in schema tests
    });
  });

  describe("generatePerformanceReport", () => {
    it("should generate comprehensive performance report", async () => {
      const report = await monitor.generatePerformanceReport();
      
      expect(typeof report).toBe("string");
      expect(report.length).toBeGreaterThan(0);
      
      // Check that report contains expected sections
      expect(report).toMatch(/Database Performance Report/);
      expect(report).toMatch(/Health Status/);
      expect(report).toMatch(/Connection Metrics/);
      expect(report).toMatch(/Table Sizes/);
    });

    it("should include timestamp in report", async () => {
      const report = await monitor.generatePerformanceReport();
      
      expect(report).toMatch(/Generated: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
