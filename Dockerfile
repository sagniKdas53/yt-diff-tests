FROM denoland/deno:alpine

WORKDIR /app

# The user is running the tests from the context of the tests dir
COPY . .

USER root
RUN chown -R deno:deno /app
USER deno

# Environment variables will be passed via docker-compose
CMD ["deno", "test", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "--junit-path=/app/reports/test_results.xml", "api_test_e2e.ts"]
