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
