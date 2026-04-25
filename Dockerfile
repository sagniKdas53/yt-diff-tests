FROM denoland/deno:alpine

WORKDIR /app

# The user is running the tests from the context of the tests dir
COPY . .

# Environment variables will be passed via docker-compose
CMD ["deno", "test", "--allow-net", "--allow-env", "--allow-read", "api_test_e2e.ts"]
