#!/bin/bash

# Isolated API Test Runner for yt-diff (Containerized Version)
# This script manages the full lifecycle of the isolated test environment.

# Exit on failure
set -e

# Cleanup on exit
cleanup() {
    echo "Cleaning up test environment..."
    docker compose -f docker-compose.test.yml down -v
}
trap cleanup EXIT

echo "Generating mock-tube SSL certificates..."
mkdir -p mock-tube/ssl
# Generate CA
openssl req -x509 -newkey rsa:4096 -keyout mock-tube/ssl/ca.key -out mock-tube/ssl/ca.crt -days 365 -nodes -subj "/CN=mock-tube-ca" 2>/dev/null
# Generate Server CSR and Key
openssl req -newkey rsa:2048 -keyout mock-tube/ssl/server.key -out mock-tube/ssl/server.csr -nodes -subj "/CN=mock-tube" 2>/dev/null
# Sign Server Certificate
openssl x509 -req -in mock-tube/ssl/server.csr -CA mock-tube/ssl/ca.crt -CAkey mock-tube/ssl/ca.key -CAcreateserial -out mock-tube/ssl/server.crt -days 365 -extfile <(printf "subjectAltName=DNS:mock-tube") 2>/dev/null

echo "Creating combined CA bundle..."
cat /etc/ssl/certs/ca-certificates.crt mock-tube/ssl/ca.crt > mock-tube/ssl/combined-ca.crt

echo "Starting isolated test stack and running tests..."
# --build: Always rebuild the test-runner if changes are made to Dockerfile.test or api_test.ts
# --exit-code-from: Exit with the same code as the test-runner service
set +e
docker compose -f docker-compose.test.yml up --build --exit-code-from test-runner
TEST_EXIT_CODE=$?
set -e

if [ $TEST_EXIT_CODE -ne 0 ]; then
    echo ""
    echo "❌ Tests failed with exit code: $TEST_EXIT_CODE"
    echo "Check the logs above for details."
    exit $TEST_EXIT_CODE
fi

echo ""
echo "✅ Tests completed successfully."
