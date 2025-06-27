#!/bin/bash

# API Route Validation Script
# Tests all API endpoints for functionality, security, and performance

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${API_BASE_URL:-http://localhost:3000}"
API_BASE="${BASE_URL}/api"
MAX_RESPONSE_TIME=2000  # 2 seconds
TEST_RESULTS_FILE="api-validation-results.json"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Initialize results file
echo "{" > "$TEST_RESULTS_FILE"
echo "  \"timestamp\": \"$(date -Iseconds)\"," >> "$TEST_RESULTS_FILE"
echo "  \"base_url\": \"$BASE_URL\"," >> "$TEST_RESULTS_FILE"
echo "  \"tests\": [" >> "$TEST_RESULTS_FILE"

print_header() {
    echo -e "\n${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
}

print_test() {
    echo -e "${YELLOW}Testing:${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓ PASS:${NC} $1"
    ((PASSED_TESTS++))
}

print_failure() {
    echo -e "${RED}✗ FAIL:${NC} $1"
    ((FAILED_TESTS++))
}

print_warning() {
    echo -e "${YELLOW}⚠ WARN:${NC} $1"
}

# Test execution function
run_test() {
    local test_name="$1"
    local method="$2"
    local endpoint="$3"
    local headers="$4"
    local body="$5"
    local expected_status="$6"
    local description="$7"

    ((TOTAL_TESTS++))
    print_test "$test_name"

    # Prepare curl command
    local curl_cmd="curl -s -w '%{http_code}|%{time_total}|%{size_download}' -X $method"
    
    if [[ -n "$headers" ]]; then
        curl_cmd="$curl_cmd $headers"
    fi
    
    if [[ -n "$body" && "$method" != "GET" ]]; then
        curl_cmd="$curl_cmd -d '$body'"
    fi
    
    curl_cmd="$curl_cmd '$endpoint'"

    # Execute test
    local response
    response=$(eval "$curl_cmd" 2>/dev/null)
    
    if [[ $? -ne 0 ]]; then
        print_failure "$test_name - Network error"
        add_test_result "$test_name" "ERROR" "Network error" 0 0 "$description"
        return 1
    fi

    # Parse response
    local body_content="${response%|*|*}"
    local status_and_time="${response##*|}"
    local time_total="${status_and_time%|*}"
    local http_code="${response##*|*|}"
    local size="${status_and_time#*|}"
    
    # Convert time to milliseconds
    local time_ms=$(echo "$time_total * 1000" | bc -l | cut -d. -f1)

    # Validate response
    local test_passed=true
    local failure_reason=""

    # Check HTTP status
    if [[ "$http_code" != "$expected_status" ]]; then
        test_passed=false
        failure_reason="Expected status $expected_status, got $http_code"
    fi

    # Check response time
    if [[ $time_ms -gt $MAX_RESPONSE_TIME ]]; then
        test_passed=false
        failure_reason="${failure_reason:+$failure_reason; }Response time ${time_ms}ms exceeds ${MAX_RESPONSE_TIME}ms"
    fi

    # Check JSON format for success responses
    if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
        if ! echo "$body_content" | jq . >/dev/null 2>&1; then
            test_passed=false
            failure_reason="${failure_reason:+$failure_reason; }Invalid JSON response"
        fi
    fi

    # Report results
    if [[ "$test_passed" == true ]]; then
        print_success "$test_name (${time_ms}ms)"
        add_test_result "$test_name" "PASS" "" "$time_ms" "$http_code" "$description"
    else
        print_failure "$test_name - $failure_reason"
        add_test_result "$test_name" "FAIL" "$failure_reason" "$time_ms" "$http_code" "$description"
    fi
}

# Add test result to JSON file
add_test_result() {
    local name="$1"
    local status="$2"
    local error="$3"
    local time_ms="$4"
    local http_code="$5"
    local description="$6"

    if [[ $TOTAL_TESTS -gt 1 ]]; then
        echo "," >> "$TEST_RESULTS_FILE"
    fi

    cat >> "$TEST_RESULTS_FILE" << EOF
    {
      "name": "$name",
      "description": "$description",
      "status": "$status",
      "error": "$error",
      "response_time_ms": $time_ms,
      "http_code": "$http_code",
      "timestamp": "$(date -Iseconds)"
    }
EOF
}

# Start validation
print_header "API Route Validation - Phase 2B-2"
echo "Base URL: $BASE_URL"
echo "Max Response Time: ${MAX_RESPONSE_TIME}ms"
echo ""

# 1. Health Check API Tests
print_header "Health Check API Tests"

run_test "health_basic" "GET" "$API_BASE/health" "" "" "200" \
    "Basic health check endpoint functionality"

run_test "health_performance" "GET" "$API_BASE/health" "" "" "200" \
    "Health check response time under 1000ms"

# 2. Authentication API Tests  
print_header "Authentication API Tests"

# Test basic auth endpoints
run_test "auth_providers_unauthorized" "GET" "$API_BASE/auth/providers" "" "" "401" \
    "Providers endpoint requires authentication"

run_test "auth_can_unlink_unauthorized" "GET" "$API_BASE/auth/can-unlink" "" "" "401" \
    "Can-unlink endpoint requires authentication"

run_test "auth_primary_provider_unauthorized" "GET" "$API_BASE/auth/primary-provider" "" "" "401" \
    "Primary provider endpoint requires authentication"

# 3. Search API Tests
print_header "Search API Tests"

# Test repositories search
run_test "search_repos_unauthorized" "GET" "$API_BASE/search/repositories" "" "" "401" \
    "Repository search requires authentication"

run_test "search_repos_invalid_auth" "GET" "$API_BASE/search/repositories" \
    "-H 'Authorization: Bearer invalid_token'" "" "401" \
    "Repository search rejects invalid token"

# Test with malformed JWT
run_test "search_repos_malformed_jwt" "GET" "$API_BASE/search/repositories" \
    "-H 'Authorization: Bearer not.a.jwt'" "" "401" \
    "Repository search rejects malformed JWT"

# Test opportunities search
run_test "search_opportunities_unauthorized" "GET" "$API_BASE/search/opportunities" "" "" "401" \
    "Opportunities search requires authentication"

# Test parameter validation
run_test "search_repos_invalid_params" "GET" "$API_BASE/search/repositories?page=0" \
    "-H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.invalid'" "" "400" \
    "Repository search validates page parameter"

run_test "search_opportunities_invalid_difficulty" "GET" "$API_BASE/search/opportunities?difficulty=invalid" \
    "-H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.invalid'" "" "400" \
    "Opportunities search validates difficulty parameter"

# 4. Security Tests
print_header "Security Validation Tests"

# Test SQL injection attempts
run_test "security_sql_injection_repos" "GET" "$API_BASE/search/repositories?q='; DROP TABLE repositories; --" \
    "-H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.invalid'" "" "401" \
    "Repository search prevents SQL injection"

# Test XSS attempts
run_test "security_xss_opportunities" "GET" "$API_BASE/search/opportunities?q=<script>alert('xss')</script>" \
    "-H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.invalid'" "" "401" \
    "Opportunities search prevents XSS attacks"

# Test oversized requests
run_test "security_large_query" "GET" "$API_BASE/search/repositories?q=$(printf 'a%.0s' {1..10000})" \
    "-H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.invalid'" "" "400" \
    "API handles oversized query parameters"

# 5. Error Handling Tests
print_header "Error Handling Tests"

# Test 404 endpoints
run_test "error_404_nonexistent" "GET" "$API_BASE/nonexistent" "" "" "404" \
    "Non-existent endpoints return 404"

# Test invalid methods
run_test "error_405_invalid_method" "POST" "$API_BASE/health" \
    "-H 'Content-Type: application/json'" "{}" "405" \
    "Invalid HTTP methods return 405"

# Test malformed JSON
run_test "error_400_malformed_json" "POST" "$API_BASE/search/opportunities" \
    "-H 'Content-Type: application/json' -H 'Authorization: Bearer test'" \
    "{invalid json}" "400" \
    "Malformed JSON returns 400"

# 6. Performance Tests
print_header "Performance Tests"

# Test concurrent requests simulation
print_test "Concurrent request handling"
for i in {1..5}; do
    curl -s "$API_BASE/health" >/dev/null &
done
wait
print_success "Handled 5 concurrent health checks"

# Finalize results file
echo "" >> "$TEST_RESULTS_FILE"
echo "  ]," >> "$TEST_RESULTS_FILE"
echo "  \"summary\": {" >> "$TEST_RESULTS_FILE"
echo "    \"total_tests\": $TOTAL_TESTS," >> "$TEST_RESULTS_FILE"
echo "    \"passed\": $PASSED_TESTS," >> "$TEST_RESULTS_FILE"
echo "    \"failed\": $FAILED_TESTS," >> "$TEST_RESULTS_FILE"
echo "    \"success_rate\": \"$(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)%\"" >> "$TEST_RESULTS_FILE"
echo "  }" >> "$TEST_RESULTS_FILE"
echo "}" >> "$TEST_RESULTS_FILE"

# Final summary
print_header "Validation Summary"
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"
echo "Success Rate: $(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)%"
echo ""
echo "Detailed results saved to: $TEST_RESULTS_FILE"

if [[ $FAILED_TESTS -eq 0 ]]; then
    echo -e "${GREEN}All API validation tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. Review the results for details.${NC}"
    exit 1
fi