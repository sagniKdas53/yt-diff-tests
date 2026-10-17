FROM denoland/deno:alpine

WORKDIR /app

# The user is running the tests from the context of the tests dir
COPY . .

USER root
RUN chown -R deno:deno /app
USER deno

# Environment variables will be passed via docker-compose
# --allow-import is scoped to the host the import map still resolves remotely
# (std/ -> deno.land); socket.io-client is vendored under vendor/ and so is a
# local file import. Without it the module graph fails to load and no test
# registers; deno.lock pins the remote one by hash.
CMD ["deno", "test", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "--allow-import=deno.land:443", "--junit-path=/app/reports/test_results.xml", "api_test_e2e.ts"]
