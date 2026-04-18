# Efficient Live API Test Plan for yt-diff

## Summary

- Keep this as an all-live integration suite, but make it deterministic on your side: one top-level Deno.test(...) with sequential t.step(...) blocks for the stateful flow, plus
    small stateless auth/contract checks.
- Use HTTP as the source of truth for assertions. Socket events can be used to shorten waits for /list and /download, but every socket-observed transition must still be confirmed
    through /getplay, /getsub, or file fetches.
- Replace fixed sleeps and hardcoded JWTs with helpers: registerAndLogin(), apiRequest(), waitUntil(), getPlaylists(), getSublist(), getSignedFile(), fetchSignedContent().

## Public APIs / Test Interfaces

- No production API changes are assumed.
- Add test-side helpers only:
  - registerAndLogin() returns a fresh token and unique username per run.
  - waitUntil(label, fn, { timeoutMs, intervalMs }) polls until a stable condition is met.
  - awaitSocketEvent(event, predicate) is optional and only used as an accelerator.
  - assertDownloadedState(row) and assertUndownloadedState(row) check invariants without overfitting to provider output.

## Implementation Changes

- Restructure tests/api_test.ts into one serial lifecycle suite. Do not rely on Deno test execution order or shared mutable globals across independent tests.
- Remove the hardcoded JWT. Start with Unauthorized /getplay, then isregallowed, register, duplicate register, successful login, failed login.
- Cover validation and authz early with explicit client-error expectations:
  - protected route without token -> 401
  - malformed or missing required payloads on /list, /watch, /delsub, /getfile, /refreshfile -> intended 400
  - unknown playlist on /delplay or /delsub -> 404
  - deleting "None" via /delplay -> 400
  - expired/missing fileId on /refreshfile -> 404
- Main stateful flow:
  - verify initial /getplay state and only check "None" if the suite is guaranteed to boot a fresh tmpfs-backed stack
  - add Dup Test, wait until /getplay contains it, then assert /getsub has 2 rows with positions 1 and 2 and the same immutable videoId
  - download PexSJ31niEI, wait until both rows show downloaded state, and assert structural fields only: non-null file refs, downloadStatus: true, consistent videoId, consistent
        saved directory behavior
  - test /getfile, raw GET ?fileId=..., /refreshfile, and Range fetch (206) against the downloaded file
  - change monitoring with /watch, then verify /getplay reflects the new monitoring type
  - run /delsub cleanup-only on Dup Test 2, then assert both playlists now show the shared video as undownloaded while mappings remain
  - delete E7 Shorts, unlink then delete Dup Test 2, re-download Dup Test, then delplay with full cleanup and verify the playlist is gone and file signing/fetch now fails for
        removed assets
- Live edge coverage that your comment currently misses:
  - unlisted playlist/video should index successfully
  - private/deleted/empty playlist/video should not create stable rows or downloadable artifacts
  - /getplay and /getsub search modes (url:, title:, global:) need at least one smoke assertion each once fixtures exist

## Bug Traps / Things Missed

- Do not use fixed sleep(30000). That hides races and still flakes when provider latency changes.
- Do not assert exact YouTube titles, thumbnail URLs, timestamps, or exact file extensions unless the server itself owns that contract. Those values are live-provider data and can
    change without a backend bug.
- Do not use duplicate filenames in /getfiles as a happy-path assertion. The current response is keyed only by fileName, so duplicate basenames can overwrite each other and mask a
    real bug.
- Negative payload tests should assert the intended client-error contract, not current accidental 500s. The schemas currently mark many required fields as optional, so these tests
    are likely to expose real defects.
- Socket coverage should be minimal and purpose-built. Do not paste frontend hook logic into the test file.

## Test Plan

- Fast contract steps: ping, auth, unauthorized, invalid payloads, signed URL error cases.
- Core live lifecycle: Dup Test -> download -> signed file fetch/refresh/range -> Dup Test 2 -> delete modes -> final cleanup.
- Live edge steps: unlisted success, private/deleted/empty failure semantics, search query smoke checks.
- Acceptance criteria: every mutating call is followed by an eventual-state assertion, every deletion is verified from both the target playlist and any shared playlist, and no step
    depends on arbitrary time sleeps.

## Assumptions

- Default target is the fresh test stack from tests/docker-compose.test.yml; if you run against a reused environment, add a cleanup prelude for the named fixtures and avoid
    asserting global emptiness of "None".
- Core correctness is HTTP-visible state. Socket events are optional accelerators, not the oracle.
- When validation tests fail with 500 instead of 400, treat that as a service bug to fix, not a test expectation to relax.

`codex resume 019da247-2eaa-70d0-99d6-ff2d1d1ad944`
