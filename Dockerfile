FROM denoland/deno:alpine

WORKDIR /app

# The user is running the tests from the context of the tests dir
COPY . .

USER root
RUN chown -R deno:deno /app
USER deno

# Environment variables will be passed via docker-compose
# --allow-import is scoped to the two hosts the import map resolves against
# (std/ -> deno.land, socket.io-client -> cdn.socket.io). Without it the module
# graph fails to load and no test registers; deno.lock pins both by hash.
CMD ["deno", "test", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "--allow-import=deno.land:443,cdn.socket.io:443", "--junit-path=/app/reports/test_results.xml", "api_test_e2e.ts"]
