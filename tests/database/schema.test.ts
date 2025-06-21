// Database schema tests
import { neon } from "@neondatabase/serverless";

describe("Database Schema", () => {
  let sql: ReturnType<typeof neon>;

  beforeAll(() => {
    const testUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
    if (!testUrl) {
      throw new Error("No test database URL configured");
    }
    sql = neon(testUrl);
  });

  describe("Extensions", () => {
    it("should have required extensions installed", async () => {
      const extensions = await sql`
        SELECT extname 
        FROM pg_extension 
        WHERE extname IN ('vector', 'pg_trgm', 'uuid-ossp', 'pgcrypto')
        ORDER BY extname
      `;
      
      expect(Array.isArray(extensions)).toBe(true);
      if (Array.isArray(extensions)) {
        const extNames: string[] = [];
        for (const ext of extensions) {
          if (typeof ext === 'object' && ext !== null && 'extname' in ext) {
            const extObj = ext as { extname: string };
            extNames.push(extObj.extname);
          }
        }
        expect(extNames).toContain("vector");
        expect(extNames).toContain("pg_trgm");
        expect(extNames).toContain("uuid-ossp");
        expect(extNames).toContain("pgcrypto");
      }
    });

    it("should have pgvector extension with correct version", async () => {
      const vectorExt = await sql`
        SELECT extversion 
        FROM pg_extension 
        WHERE extname = 'vector'
      `;
      
      expect(vectorExt).toHaveLength(1);
      expect(Array.isArray(vectorExt)).toBe(true);
      if (Array.isArray(vectorExt) && vectorExt.length > 0) {
        const firstRow = vectorExt[0];
        if (firstRow && typeof firstRow === 'object' && 'extversion' in firstRow) {
          const version = (firstRow as { extversion: string }).extversion;
          expect(version).toMatch(/^0\.[8-9]/); // Version 0.8+ or higher
        }
      }
    });
  });

  describe("Tables", () => {
    it("should have all required tables", async () => {
      const tables = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
      `;
      
      const tableNames: string[] = [];
      if (Array.isArray(tables)) {
        for (const table of tables) {
          if (typeof table === 'object' && table !== null && 'table_name' in table) {
            const tableObj = table as { table_name: string };
            tableNames.push(tableObj.table_name);
          }
        }
      }
      const requiredTables = [
        "users",
        "repositories", 
        "opportunities",
        "user_preferences",
        "notifications",
        "contribution_outcomes",
        "user_repository_interactions"
      ];
      
      requiredTables.forEach(tableName => {
        expect(tableNames).toContain(tableName);
      });
    });

    it("should have halfvec columns in embedding tables", async () => {
      const columns = await sql`
        SELECT table_name, column_name, data_type, udt_name
        FROM information_schema.columns 
        WHERE column_name LIKE '%embedding%'
        ORDER BY table_name, column_name
      `;
      
      expect(Array.isArray(columns) ? columns.length : 0).toBeGreaterThan(0);
      
      // Check that we have embedding columns
      const embeddingColumns: Array<{ column_name: string; data_type: string }> = [];
      if (Array.isArray(columns)) {
        for (const col of columns) {
          if (typeof col === 'object' && col !== null && 'column_name' in col && 'data_type' in col) {
            const colObj = col as { column_name: string; data_type: string };
            if (colObj.column_name.includes("embedding")) {
              embeddingColumns.push(colObj);
            }
          }
        }
      }
      
      expect(embeddingColumns.length).toBeGreaterThanOrEqual(3);
      
      // Verify data type is user-defined (halfvec)
      embeddingColumns.forEach((col) => {
        expect(col.data_type).toBe("USER-DEFINED");
      });
    });
  });

  describe("Enum Types", () => {
    it("should have all required enum types", async () => {
      const enums = await sql`
        SELECT typname 
        FROM pg_type 
        WHERE typtype = 'e'
        ORDER BY typname
      `;
      
      const enumNames: string[] = [];
      if (Array.isArray(enums)) {
        for (const enumType of enums) {
          if (typeof enumType === 'object' && enumType !== null && 'typname' in enumType) {
            const enumObj = enumType as { typname: string };
            enumNames.push(enumObj.typname);
          }
        }
      }
      const requiredEnums = [
        "user_role",
        "repository_status", 
        "opportunity_status",
        "skill_level",
        "contribution_type",
        "notification_type",
        "outcome_status"
      ];
      
      requiredEnums.forEach(enumName => {
        expect(enumNames).toContain(enumName);
      });
    });
  });

  describe("Indexes", () => {
    it("should have HNSW indexes for vector columns", async () => {
      const hnsWIndexes = await sql`
        SELECT indexname, tablename
        FROM pg_indexes 
        WHERE schemaname = 'public'
        AND indexname LIKE '%hnsw%'
        ORDER BY tablename, indexname
      `;
      
      expect(Array.isArray(hnsWIndexes) ? hnsWIndexes.length : 0).toBeGreaterThanOrEqual(4);
      
      const expectedIndexes = [
        "idx_users_profile_embedding_hnsw",
        "idx_repositories_embedding_hnsw", 
        "idx_opportunities_title_embedding_hnsw",
        "idx_opportunities_description_embedding_hnsw"
      ];
      
      const indexNames: string[] = [];
      if (Array.isArray(hnsWIndexes)) {
        for (const index of hnsWIndexes) {
          if (typeof index === 'object' && index !== null && 'indexname' in index) {
            const indexObj = index as { indexname: string };
            indexNames.push(indexObj.indexname);
          }
        }
      }
      expectedIndexes.forEach(indexName => {
        expect(indexNames).toContain(indexName);
      });
    });

    it("should have GIN indexes for text search", async () => {
      const ginIndexes = await sql`
        SELECT indexname, tablename
        FROM pg_indexes 
        WHERE schemaname = 'public'
        AND (indexname LIKE '%gin%' OR indexname LIKE '%trgm%')
        ORDER BY tablename, indexname
      `;
      
      expect(Array.isArray(ginIndexes) ? ginIndexes.length : 0).toBeGreaterThan(0);
    });
  });

  describe("Functions", () => {
    it("should have update_updated_at_column trigger function", async () => {
      const triggerFunction = await sql`
        SELECT routine_name 
        FROM information_schema.routines 
        WHERE routine_schema = 'public'
        AND routine_name = 'update_updated_at_column'
      `;
      
      expect(triggerFunction).toHaveLength(1);
    });

    it("should have hybrid search functions", async () => {
      const searchFunctions = await sql`
        SELECT routine_name 
        FROM information_schema.routines 
        WHERE routine_schema = 'public'
        AND routine_name LIKE '%search%'
        ORDER BY routine_name
      `;
      
      const functionNames: string[] = [];
      if (Array.isArray(searchFunctions)) {
        for (const func of searchFunctions) {
          if (typeof func === 'object' && func !== null && 'routine_name' in func) {
            const funcObj = func as { routine_name: string };
            functionNames.push(funcObj.routine_name);
          }
        }
      }
      const expectedFunctions = [
        "hybrid_search_opportunities",
        "hybrid_search_repositories",
        "search_similar_users"
      ];
      
      expectedFunctions.forEach(funcName => {
        expect(functionNames).toContain(funcName);
      });
    });
  });

  describe("Triggers", () => {
    it("should have updated_at triggers on relevant tables", async () => {
      const triggers = await sql`
        SELECT trigger_name, event_object_table
        FROM information_schema.triggers 
        WHERE trigger_schema = 'public'
        AND trigger_name LIKE '%updated_at%'
        ORDER BY event_object_table, trigger_name
      `;
      
      expect(Array.isArray(triggers) ? triggers.length : 0).toBeGreaterThanOrEqual(5);
      
      const expectedTables = [
        "users",
        "repositories",
        "opportunities", 
        "user_preferences",
        "contribution_outcomes"
      ];
      
      const triggerTables: string[] = [];
      if (Array.isArray(triggers)) {
        for (const trigger of triggers) {
          if (typeof trigger === 'object' && trigger !== null && 'event_object_table' in trigger) {
            const triggerObj = trigger as { event_object_table: string };
            triggerTables.push(triggerObj.event_object_table);
          }
        }
      }
      expectedTables.forEach(tableName => {
        expect(triggerTables).toContain(tableName);
      });
    });
  });
});
