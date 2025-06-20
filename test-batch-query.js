const { buildBatchedQuery } = require('./dist/lib/github/graphql/query-optimizer.js')

const queries = Array(10)
  .fill(null)
  .map((_, i) => ({
    alias: `repo${i}`,
    query: `repository(owner: "octocat", name: "repo${i}") {
    issues(first: 10) {
      totalCount
    }
  }`,
  }))

const result = buildBatchedQuery(queries, { maxComplexity: 50 })
console.log('Result type:', typeof result)
console.log('Result:', JSON.stringify(result, null, 2))
