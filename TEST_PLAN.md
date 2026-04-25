# yt-diff API Test Plan

## Overview

This test plan covers end-to-end API integration testing for `yt-diff`. Tests
are organized into suites that each validate a specific subsystem. Each test
case documents the endpoint, request payload, expected response, and the
invariant being asserted.

**Base URL:** `http://localhost:8888/ytdiff`  
**Auth:** Include a valid JWT in all requests where applicable.

> [!NOTE]
> Tests must be executed in order within each suite. Later suites may depend
> on state established by earlier ones. Tear down the database to a clean state
> before running the full plan from the top.

---

## Suite 0 — Preconditions: Clean State Verification

Verify the system starts from an empty state before any test data is inserted.

### TC-0.1 — Initial playlist list is empty

**Endpoint:** `POST /getplay`

**Request:**
```json
{ "start": 0, "stop": 10, "sort": "1", "order": "1", "query": "" }
```

**Expected Response:**
```json
{ "count": 0, "rows": [] }
```

**Assert:** `count === 0` and `rows` is an empty array.

---

### TC-0.2 — "None" playlist sublist is empty

**Endpoint:** `POST /getsub`

**Request:**
```json
{ "start": 0, "stop": 10, "sortDownloaded": false, "query": "", "url": "None" }
```

**Expected Response:**
```json
{ "count": 0, "rows": [], "saveDirectory": "" }
```

**Assert:** `count === 0`. `saveDirectory` is an empty string (the "None"
playlist has no directory).

---

## Suite 1 — Duplicate Video Handling (`Dup Test` Playlist)

Validates that a playlist containing the same video at multiple positions is
indexed correctly, that downloading one entry downloads the shared
`VideoMetadata` record, and that cleanup propagates across all positions.

**Playlist:** `Dup Test`  
**URL:** `https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw`  
**Video:** `Run Immich through a docker container on Tailscale` (`PexSJ31niEI`)

---

### TC-1.1 — Add "Dup Test" playlist

**Endpoint:** `POST /list`

**Request:**
```json
{
  "urlList": ["https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw"],
  "chunkSize": 9,
  "monitoringType": "N/A",
  "sleep": true
}
```

**Expected Response:**
```json
{
  "status": "success",
  "message": "Listing initiated",
  "items": [{
    "url": "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw",
    "type": "undetermined",
    "currentMonitoringType": "N/A",
    "reason": "URL not found in database"
  }]
}
```

**Assert:** `status === "success"`. `items[0].reason` is `"URL not found in database"`, confirming new ingestion.

---

### TC-1.2 — Playlist appears in listing

**Endpoint:** `POST /getplay`

**Request:**
```json
{ "start": 0, "stop": 10, "sort": "1", "order": "1", "query": "" }
```

**Assert:**
- `count === 1`
- `rows[0].title === "Dup Test"`
- `rows[0].monitoringType === "N/A"`
- `rows[0].sortOrder === 0`
- `rows[0].saveDirectory === "Dup Test"`

---

### TC-1.3 — Sublist contains the duplicate video at two positions

**Endpoint:** `POST /getsub`

**Request:**
```json
{
  "start": 0,
  "stop": 8,
  "sortDownloaded": false,
  "query": "",
  "url": "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw"
}
```

**Assert:**
- `count === 2`
- `rows[0].positionInPlaylist === 1`
- `rows[1].positionInPlaylist === 2`
- Both rows reference the same `videoUrl` (`https://www.youtube.com/watch?v=PexSJ31niEI`)
- Both rows have `downloadStatus === false`, `fileName === null`

---

### TC-1.4 — Download the video (one request downloads both positions)

**Endpoint:** `POST /download`

**Request:**
```json
{
  "urlList": ["https://www.youtube.com/watch?v=PexSJ31niEI"],
  "playListUrl": "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw"
}
```

**Assert:**
- `status === "success"`
- `items[0].url === "https://www.youtube.com/watch?v=PexSJ31niEI"`
- `items[0].saveDirectory === "Dup Test"`

> [!NOTE]
> Wait for the download to complete (monitor via WebSocket `download-started`
> / progress events) before proceeding to TC-1.5.

---

### TC-1.5 — Both duplicate positions now show as downloaded

**Endpoint:** `POST /getsub` (same request as TC-1.3)

**Assert:**
- `count === 2`
- Both rows: `downloadStatus === true`
- Both rows: `fileName === "PexSJ31niEI.mkv"`
- Both rows: `thumbNailFile === "PexSJ31niEI.webp"`
- Both rows: `descriptionFile === "PexSJ31niEI.description"`
- Both rows: `isMetaDataSynced === true`
- Both rows: `saveDirectory === "Dup Test"`

---

### TC-1.6 — Update monitoring type to "Full"

**Endpoint:** `POST /watch`

**Request:**
```json
{
  "url": "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw",
  "watch": "Full"
}
```

**Assert:** `status === "success"`, `message` confirms update.

---

### TC-1.7 — Monitoring type change is reflected in playlist listing

**Endpoint:** `POST /getplay` (same request as TC-1.2)

**Assert:** `rows[0].monitoringType === "Full"`

---

## Suite 2 — Many-to-One Video Reference (`Dup Test 2` Playlist)

Validates that a video downloaded in one playlist is reflected as already
downloaded when that same video appears in a second playlist, and that cleaning
up files in one context resets the shared `VideoMetadata` record everywhere.

**Playlist:** `Dup Test 2`  
**URL:** `https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY`

---

### TC-2.1 — Add "Dup Test 2" playlist

**Endpoint:** `POST /list`

**Request:**
```json
{
  "urlList": ["https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY"],
  "chunkSize": 9,
  "monitoringType": "N/A",
  "sleep": true
}
```

**Assert:** `status === "success"`, listing initiated.

---

### TC-2.2 — Both playlists appear in listing

**Endpoint:** `POST /getplay`

**Assert:**
- `count === 2`
- `rows[1].title === "Dup Test 2"`
- `rows[1].sortOrder === 1`

---

### TC-2.3 — "Dup Test 2" sublist shows the shared video as already downloaded

**Endpoint:** `POST /getsub` with `url` set to the `Dup Test 2` URL

**Assert:**
- `count === 1`
- `rows[0].video_metadatum.downloadStatus === true` — download state is shared across playlists via `VideoMetadata`
- `rows[0].video_metadatum.fileName === "PexSJ31niEI.mkv"`
- `rows[0].video_metadatum.saveDirectory === "Dup Test"` — file is physically stored under the original playlist's directory

---

### TC-2.4 — Clean up files via `/delsub` (files only, keep mapping and DB record)

**Endpoint:** `POST /delsub`

**Request:**
```json
{
  "playListUrl": "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY",
  "videoUrls": ["https://www.youtube.com/watch?v=PexSJ31niEI"],
  "cleanUp": true,
  "deleteVideoMappings": false,
  "deleteVideosInDB": false
}
```

**Assert:**
- `deleted` array contains the video URL
- `failed` array is empty

---

### TC-2.5 — "Dup Test 2" sublist shows video as un-downloaded after file cleanup

**Endpoint:** `POST /getsub` (Dup Test 2)

**Assert:**
- `count === 1` — mapping is still present
- `downloadStatus === false`
- `fileName === null`, `thumbNailFile === null`

---

### TC-2.6 — "Dup Test" sublist also reflects the shared un-downloaded state

**Endpoint:** `POST /getsub` (Dup Test)

**Assert:**
- `count === 2`
- Both rows: `downloadStatus === false`, `fileName === null`
- Confirms the `VideoMetadata` record is shared — cleanup in one playlist context propagates everywhere.

---

### TC-2.7 — Unlink all videos from "Dup Test 2", then delete playlist record

**Endpoint:** `POST /delplay`

**Request (unlink):**
```json
{
  "playListUrl": "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY",
  "deleteAllVideosInPlaylist": true,
  "deletePlaylist": false,
  "cleanUp": false
}
```

**Assert:** `status === "success"`.

**Request (delete playlist):**
```json
{
  "playListUrl": "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY",
  "deleteAllVideosInPlaylist": false,
  "deletePlaylist": true,
  "cleanUp": false
}
```

**Assert:** `status === "success"`. Subsequent `GET /getplay` returns `count === 1` (only "Dup Test" remains).

---

### TC-2.8 — Delete everything for "Dup Test" (mappings + playlist + disk)

**Endpoint:** `POST /delplay`

**Request:**
```json
{
  "playListUrl": "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw",
  "deleteAllVideosInPlaylist": true,
  "deletePlaylist": true,
  "cleanUp": true
}
```

**Assert:**
- `status === "success"`
- Response message notes that shared video(s) were marked as un-downloaded.
- Subsequent `GET /getplay` returns `count === 0`.

---

## Suite 3 — Video Deletion Modes (`E7 Shorts` Playlist)

Validates the three `/delsub` deletion modes: full delete (`deleteVideosInDB`), unlink-only (`deleteVideoMappings`), and file-cleanup-only (`cleanUp`).

**Playlist:** `E7 Shorts`  
**URL:** `https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs`

---

### TC-3.1 — Add "E7 Shorts", verify 2 videos are listed

**Endpoint:** `POST /list` then `POST /getsub`

**Assert:** `count === 2`, positions 1 and 2 present, both un-downloaded.

---

### TC-3.2 — Hard-delete first video (`deleteVideosInDB = true`)

**Endpoint:** `POST /delsub`

**Request:**
```json
{
  "playListUrl": "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs",
  "videoUrls": ["https://www.youtube.com/watch?v=kr2lsFN_aM8"],
  "cleanUp": true,
  "deleteVideoMappings": true,
  "deleteVideosInDB": true
}
```

**Assert:** `deleted` contains the URL, `failed` is empty.

---

### TC-3.3 — Sublist now contains only one video (at position 2)

**Endpoint:** `POST /getsub` (E7 Shorts)

**Assert:**
- `count === 1`
- `rows[0].positionInPlaylist === 2`
- `rows[0].video_metadatum.videoId === "h0OdOdLtuQM"`

---

### TC-3.4 — Unlink second video (`deleteVideoMappings = true`, no DB delete)

**Endpoint:** `POST /delsub`

**Request:**
```json
{
  "playListUrl": "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs",
  "videoUrls": ["https://www.youtube.com/watch?v=h0OdOdLtuQM"],
  "cleanUp": false,
  "deleteVideoMappings": true,
  "deleteVideosInDB": false
}
```

**Assert:** `deleted` contains the URL.

---

### TC-3.5 — Sublist is now empty; playlist record still exists

**Endpoint:** `POST /getsub` (E7 Shorts)

**Assert:** `count === 0`.

---

### TC-3.6 — Delete only the playlist record (no mappings, no disk)

**Endpoint:** `POST /delplay`

**Request:**
```json
{
  "playListUrl": "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs",
  "deleteAllVideosInPlaylist": false,
  "deletePlaylist": true,
  "cleanUp": false
}
```

**Assert:** `status === "success"`. `GET /getplay` returns `count === 0`.

---

## Suite 4 — Pagination, Sorting, Download, and Cross-Playlist State (`Screen recordings`)

Validates paginated sublist retrieval, `sortDownloaded` ordering, downloading a video already in one playlist into the "None" playlist, and that download state is visible from both playlist contexts.

**Playlist:** `Screen recordings`  
**URL:** `https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh`  
**Total Videos:** 17

---

### TC-4.1 — Add "Screen recordings" and wait for full listing

**Endpoint:** `POST /list`

**Assert:** `status === "success"`.

> [!NOTE]
> Wait approximately 3 minutes for the full listing to complete (17 items via
> yt-dlp). Monitor WebSocket events for completion before proceeding.

---

### TC-4.2 — Paginated sublist retrieval (3 pages, 17 total)

**Endpoint:** `POST /getsub` (3 calls)

| Call | `start` | `stop` | Expected row count |
|------|---------|--------|--------------------|
| 1    | 0       | 8      | 8                  |
| 2    | 8       | 16     | 8                  |
| 3    | 16      | 24     | 1                  |

**Assert for each call:**
- `count === 17` (total, not page size)
- Rows returned match expected page slice
- All videos have `downloadStatus === false`

---

### TC-4.3 — Download a video within the playlist

**Endpoint:** `POST /download`

**Request:**
```json
{
  "urlList": ["https://www.youtube.com/watch?v=i0S9vlyQpig"],
  "playListUrl": "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh"
}
```

**Assert:** `status === "success"`, `items[0].saveDirectory === "Screen recordings"`.

---

### TC-4.4 — Add a video already in "Screen recordings" to the "None" playlist

**Endpoint:** `POST /list`

**Request:**
```json
{
  "urlList": ["https://www.youtube.com/watch?v=JWdTskHy9TE"],
  "chunkSize": 9,
  "monitoringType": "N/A",
  "sleep": true
}
```

**Assert:**
- `status === "success"`
- `items[0].type === "undownloaded"` — video is known to the DB (already listed from the playlist) but not yet downloaded

---

### TC-4.5 — "None" sublist shows the newly added video

**Endpoint:** `POST /getsub` with `url: "None"`

**Assert:**
- `count === 1`
- `rows[0].video_metadatum.videoId === "JWdTskHy9TE"`
- `downloadStatus === false`

---

### TC-4.6 — Download the video via the "None" playlist context

**Endpoint:** `POST /download`

**Request:**
```json
{
  "urlList": ["https://www.youtube.com/watch?v=JWdTskHy9TE"],
  "playListUrl": "None"
}
```

**Assert:**
- `status === "success"`
- `items[0].saveDirectory === "Screen recordings"` — the video inherits the save directory from its original playlist, not from "None".

---

### TC-4.7 — "None" sublist confirms download success

**Endpoint:** `POST /getsub` with `url: "None"`

**Assert:**
- `downloadStatus === true`
- `fileName === "JWdTskHy9TE.mkv"`
- `thumbNailFile === "JWdTskHy9TE.webp"`
- `isMetaDataSynced === true`
- `saveDirectory === "Screen recordings"`

---

### TC-4.8 — Download state visible from the original playlist context

**Endpoint:** `POST /getsub` (Screen recordings, page `start=8, stop=16`)

**Assert:**
- The row for `JWdTskHy9TE` (position 15) shows `downloadStatus === true`, `fileName === "JWdTskHy9TE.mkv"`.
- The row for `i0S9vlyQpig` (position 16) shows `downloadStatus === true`.
- This confirms the shared `VideoMetadata` record reflects the download state in both playlist views.

---

### TC-4.9 — `sortDownloaded` ordering (downloaded items first)

**Endpoint:** `POST /getsub`

**Request:**
```json
{
  "start": 0,
  "stop": 8,
  "sortDownloaded": true,
  "query": "",
  "url": "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh"
}
```

**Assert:**
- `rows[0].video_metadatum.downloadStatus === true`
- `rows[1].video_metadatum.downloadStatus === true`
- All subsequent rows have `downloadStatus === false`

---

## Suite 5 — Prune Job and "None" Playlist Orphan Handling

Validates that when a playlist is deleted (without deleting video records),
the prune cron job moves downloaded orphans to "None" and destroys un-downloaded orphans.

---

### TC-5.1 — Delete the "Screen recordings" playlist record (no mappings, no disk)

**Endpoint:** `POST /delplay`

**Request:**
```json
{
  "playListUrl": "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh",
  "deleteAllVideosInPlaylist": false,
  "deletePlaylist": true,
  "cleanUp": false
}
```

**Assert:** `GET /getplay` returns `count === 0`.

---

### TC-5.2 — "None" sublist immediately after deletion (before prune job runs)

**Endpoint:** `POST /getsub` with `url: "None"`

**Assert:**
- `count === 1` — only the video already explicitly mapped to "None" is present.
- The videos that were in "Screen recordings" mappings are not yet here.

---

### TC-5.3 — "None" sublist after prune job runs

> [!NOTE]
> Wait for the prune job to execute (up to `PRUNE_INTERVAL`, default 30 min;
> can be shortened via env var for test environments). The job moves downloaded
> orphans to "None" and destroys un-downloaded orphans.

**Endpoint:** `POST /getsub` with `url: "None"`

**Assert:**
- `count === 2` — the two previously downloaded videos (`JWdTskHy9TE`, `i0S9vlyQpig`) have been moved to "None".
- All other un-downloaded videos from the playlist have been removed from `VideoMetadata`.
- The two rescued videos retain their `fileName`, `thumbNailFile`, and `saveDirectory` values.

---

## Suite 6 — "None" Playlist Deduplication and Single-Video Ingestion

Validates idempotent single-video adds, duplicate prevention in "None", and
the WebSocket notification behavior.

---

### TC-6.1 — Re-add a video already downloaded in "None" (no-op)

**Endpoint:** `POST /list`

**Request:**
```json
{
  "urlList": ["https://www.youtube.com/watch?v=JWdTskHy9TE"],
  "chunkSize": 9,
  "monitoringType": "N/A",
  "sleep": true
}
```

**Assert:**
- `items` array is empty (`[]`) — server recognizes the video is already in "None" and skips re-ingestion.
- WebSocket event `listing-single-item-complete` is received with `alreadyExisted: true` and a `seekSubListTo` position.

---

### TC-6.2 — Add a new single video to "None"

**Endpoint:** `POST /list`

**Request:**
```json
{
  "urlList": ["https://www.youtube.com/watch?v=dPiPWbkebEo"],
  "chunkSize": 9,
  "monitoringType": "N/A",
  "sleep": true
}
```

**Assert:**
- `items[0].reason === "URL not found in database"` — new video ingested.
- `GET /getsub` for "None" shows `count === 3`, new video at position 3 with `downloadStatus === false`.

---

### TC-6.3 — Re-add the same un-downloaded video to "None" (idempotent)

**Endpoint:** `POST /list` (same request as TC-6.2)

**Assert:**
- `items[0].type === "undownloaded"` — video is in DB but not downloaded; server acknowledges without creating a duplicate mapping.
- WebSocket event `listing-single-item-complete` received with `alreadyExisted: true`.
- `GET /getsub` for "None" still returns `count === 3` (no new entry added).

---

## Suite 7 — Re-Index (`/reindexall`)

Validates that the re-index endpoint re-populates a playlist's video mappings after they have been cleared.

**Playlist:** `Engineering Stuff`  
**URL:** `https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2TwKOK-_dXvPlzs1DktqFX`

---

### TC-7.1 — Add "Engineering Stuff" playlist and verify it has 1 video

**Endpoint:** `POST /list` then `POST /getsub`

**Assert:** `count === 1`, one video listed.

---

### TC-7.2 — Unlink all videos from the playlist

**Endpoint:** `POST /delplay`

**Request:**
```json
{
  "playListUrl": "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2TwKOK-_dXvPlzs1DktqFX",
  "deleteAllVideosInPlaylist": true,
  "deletePlaylist": false,
  "cleanUp": false
}
```

**Assert:**
- `status === "success"`
- `GET /getsub` returns `count === 0` — all mappings removed.

---

### TC-7.3 — Trigger re-index for all playlists in range

**Endpoint:** `POST /reindexall`

**Request:**
```json
{ "start": 0, "stop": 10, "chunkSize": 8 }
```

**Assert:**
- `status === "success"`
- `queued === 1`, `total === 1`

---

### TC-7.4 — Sublist repopulated after re-index completes

> [!NOTE]
> Wait briefly (a few seconds) for the re-index job to finish before asserting.

**Endpoint:** `POST /getsub` (Engineering Stuff)

**Assert:**
- `count === 1` — video mapping is restored
- Video metadata matches the original listing

---

## Suite 8 — Signed URL and File Retrieval

Validates the `/getfile`, `/getfiles`, and `/refreshfile` token flow.

---

### TC-8.1 — Batch-resolve signed URLs for multiple files (`/getfiles`)

**Endpoint:** `POST /getfiles`

**Request:**
```json
{
  "files": [
    { "saveDirectory": "Dup Test", "fileName": "PexSJ31niEI.webp" },
    { "saveDirectory": "Dup Test", "fileName": "PexSJ31niEI.webp" }
  ]
}
```

**Assert:**
- `status === "success"`
- The response `files` map contains one entry for `PexSJ31niEI.webp` (duplicates are de-duplicated server-side).
- Each entry is a structured object containing both `signedUrlId` (a UUID string) and `expiry` (a future millisecond timestamp) — not a bare UUID string.

> **Regression guard (Frontend Bug #4):** Before this fix, `/getfiles` returned only the token UUID, giving the frontend no way to schedule proactive refresh. The `expiry` field is now required for the thumbnail sliding-window refresh to function correctly.

---

### TC-8.2 — Resolve a single signed URL (`/getfile`)

**Endpoint:** `POST /getfile`

**Request:**
```json
{ "saveDirectory": "Dup Test", "fileName": "PexSJ31niEI.mkv" }
```

**Assert:**
- `status === "success"`
- `signedUrlId` is a UUID string
- `expiry` is a future timestamp (milliseconds since epoch)

---

### TC-8.3 — Stream file content using signed URL token

**Endpoint:** `GET /getfile?fileId=<signedUrlId>`

**Assert:**
- HTTP response status is `200`
- `Content-Type` header is `video/mp4` (or appropriate MIME type)
- Response body is the raw binary file stream (non-empty)

---

### TC-8.4 — Refresh a signed URL token before expiry

**Endpoint:** `POST /refreshfile`

**Request:**
```json
{ "fileId": "<signedUrlId from TC-8.2>" }
```

**Assert:**
- `status === "success"`
- `expiry` is a new timestamp approximately 30 minutes later than the original, confirming the sliding window extension.

---

## Suite 10 — Regression: Per-Mapping Delete for Duplicate Playlist Entries (Backend Bug #5)

Tests the fix that allows individual duplicate entries in a playlist to be deleted one at a time by mapping ID, without removing all mappings for the same video URL simultaneously.

**Prerequisite:** The `Dup Test` playlist (`PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw`) must be present with both duplicate mappings for `PexSJ31niEI` intact and un-downloaded (state left by Suite 2).

---

### TC-10.1 — `/getsub` returns a mapping `id` for each row

**Endpoint:** `POST /getsub`

**Request:**
```json
{
  "start": 0,
  "stop": 8,
  "sortDownloaded": false,
  "query": "",
  "url": "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw"
}
```

**Assert:**
- `count === 2`
- `rows[0].id` is a non-null UUID string — the `PlaylistVideoMapping` row ID for position 1
- `rows[1].id` is a **different** non-null UUID string — the mapping row ID for position 2
- Both rows reference the same `videoUrl` (`https://www.youtube.com/watch?v=PexSJ31niEI`)

---

### TC-10.2 — Delete only the first duplicate by mapping ID

**Endpoint:** `POST /delsub`

**Request:**
```json
{
  "playListUrl": "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw",
  "mappingIds": ["<rows[0].id from TC-10.1>"],
  "cleanUp": false,
  "deleteVideoMappings": true,
  "deleteVideosInDB": false
}
```

**Assert:**
- `deleted` array is non-empty
- `failed` array is empty

---

### TC-10.3 — Only one mapping remains (position 2 is intact)

**Endpoint:** `POST /getsub` (same request as TC-10.1)

**Assert:**
- `count === 1`
- `rows[0].positionInPlaylist === 2` — position 1 was removed, position 2 survives untouched
- `rows[0].video_metadatum.videoUrl === "https://www.youtube.com/watch?v=PexSJ31niEI"` — same video still present at position 2

> **Regression guard:** Before this fix, the `/delsub` request validator stripped `mappingIds` before it reached the handler, causing deletion by `videoUrl` which removed both entries simultaneously. The fix ensures deletion by `mappingId` is scoped to the exact row.

---

## Suite 11 — Regression: Sort Index Not Burned on Failed Playlist Bootstrap (Backend Bug #2)

Tests that a failed playlist bootstrap does not consume the next available `sortOrder` slot, keeping the index sequence contiguous for subsequent successful additions.

---

### TC-11.1 — Baseline: no playlists exist

**Endpoint:** `POST /getplay`

**Request:**
```json
{ "start": 0, "stop": 10, "sort": "1", "order": "1", "query": "" }
```

**Assert:** `count === 0`.

---

### TC-11.2 — Trigger a failed playlist bootstrap

Submit a URL that fails during bootstrap — for example, a playlist whose first several items are all unavailable/private so the listing stream yields no valid metadata before the failure path is hit.

**Endpoint:** `POST /list`

**Request:**
```json
{
  "urlList": ["https://www.youtube.com/playlist?list=PLwLSw1_eDZl3mojgeqUHyMpTt3lQ6ogmJ"],
  "chunkSize": 9,
  "monitoringType": "N/A",
  "sleep": true
}
```

> [!NOTE]
> This URL's first 13 items are unavailable (Backend Bug #1, still open). The bootstrap is expected to fail or produce no playlist row. If Bug #1 is fixed before this test runs, substitute a different URL that reliably triggers a bootstrap failure.

**Assert:**
- `GET /getplay` returns `count === 0` — no playlist record was persisted.

---

### TC-11.3 — Add a valid playlist immediately after the failure

**Endpoint:** `POST /list`

**Request:**
```json
{
  "urlList": ["https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2TwKOK-_dXvPlzs1DktqFX"],
  "chunkSize": 9,
  "monitoringType": "N/A",
  "sleep": true
}
```

**Assert:** `status === "success"`, listing initiated.

---

### TC-11.4 — Valid playlist gets `sortOrder === 0` with no gap

**Endpoint:** `POST /getplay`

**Request:**
```json
{ "start": 0, "stop": 10, "sort": "1", "order": "1", "query": "" }
```

**Assert:**
- `count === 1`
- `rows[0].sortOrder === 0`

> **Regression guard:** Before this fix, the in-memory sort counter was incremented before playlist creation fully succeeded, causing the next successful playlist to land at `sortOrder === 1` (or higher) and leaving a permanent gap in the display order.

---

### TC-11.5 — Teardown: delete the Engineering Stuff playlist

**Endpoint:** `POST /delplay`

**Request:**
```json
{
  "playListUrl": "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2TwKOK-_dXvPlzs1DktqFX",
  "deleteAllVideosInPlaylist": true,
  "deletePlaylist": true,
  "cleanUp": false
}
```

**Assert:** `GET /getplay` returns `count === 0`.

---

## Suite 12 — Regression: "None" Playlist Add Feedback and No Filesystem Path Exposure (Backend Bug #3)

Tests the improved feedback messages when adding videos to "None" that are already known to the database, and that no responses leak absolute filesystem paths to the client.

**Prerequisite:** At least one video must exist in `VideoMetadata` from a prior listing (e.g., from Suite 4's `Screen recordings` run) but must not already be mapped to "None".

---

### TC-12.1 — Adding a known-but-unmapped video to "None" uses fast-path insert

A video that is already in `VideoMetadata` (indexed from a playlist) but not yet in "None" should be inserted directly into "None" without re-fetching metadata from the source URL.

**Endpoint:** `POST /list`

**Request:**
```json
{
  "urlList": ["<videoUrl already in VideoMetadata but not mapped to None>"],
  "chunkSize": 9,
  "monitoringType": "N/A",
  "sleep": true
}
```

**Assert:**
- `status === "success"`
- `items[0].type` is `"undownloaded"` or `"video"` — not `"undetermined"`. `"undetermined"` would indicate yt-dlp was invoked; a more specific type confirms the fast-path was taken.
- If the video was already downloaded in another playlist, the WebSocket `listing-single-item-complete` event includes the source playlist title and position in "None".
- No field in the REST response body contains an absolute filesystem path.

---

### TC-12.2 — Duplicate add to "None" returns standardized message with title/URL and position

Submit the same video URL to "None" a second time.

**Endpoint:** `POST /list` (same request as TC-12.1)

**Assert:**
- The WebSocket `listing-single-item-complete` event includes:
  - `alreadyExisted: true`
  - `seekSubListTo` — the position in "None" the video currently occupies
  - The video title or URL is present in the payload (not a bare internal ID)
- No absolute filesystem path appears anywhere in the event payload.

---

### TC-12.3 — No filesystem paths in any "None"-related response

Review responses from TC-12.1 and TC-12.2 (both REST and WebSocket payloads).

**Assert:**
- No string field starts with `/` followed by a filesystem path component (e.g., `/data/`, `/home/`, `/mnt/`).
- `saveDirectory` values, where present, are relative names only (e.g., `"Screen recordings"`).

---

## Suite 9 — Cleanup

Tear down all test state created during the plan.

---

### TC-9.1 — Remove remaining videos from "None" playlist

**Endpoint:** `POST /delsub` (repeated per video)

Delete orphaned test videos from "None" using appropriate flag combinations:
- Videos with no files: `deleteVideoMappings: true, deleteVideosInDB: false`
- Videos with downloaded files: `cleanUp: true, deleteVideoMappings: true, deleteVideosInDB: true`

**Assert:** After all deletions, `GET /getsub` for "None" returns `count === 0`.

---

### TC-9.2 — Delete any remaining playlists with full cleanup

**Endpoint:** `POST /delplay`

**Request (for each remaining playlist):**
```json
{
  "playListUrl": "<url>",
  "deleteAllVideosInPlaylist": true,
  "deletePlaylist": true,
  "cleanUp": true
}
```

**Assert:** Final `GET /getplay` returns `count === 0`.

---

## Outstanding Items / Known Gaps

### Open bugs (no test cases yet)

- **Playlist bootstrap fails when early items are unavailable (Backend Bug #1)** —
  Playlists where the first N items are private or deleted fail to bootstrap
  even though valid items exist further down the list. The URL
  `https://www.youtube.com/playlist?list=PLwLSw1_eDZl3mojgeqUHyMpTt3lQ6ogmJ`
  (first 13 items unavailable) is a confirmed reproduction case. Suite 11
  currently uses this URL as a failure trigger; once the bug is fixed, Suite 11
  must be updated with a different failure URL and a new TC added to confirm
  the playlist bootstraps successfully with a tolerant early-item strategy.

- **Important events should appear in the notification center (Backend Bug #4)** —
  Coverage of snackbar and notification-center events is inconsistent across
  socket and REST flows. Requires a browser-level integration test once an audit
  of all success/error/info paths is complete.

### Requires browser-level integration tests (not coverable via REST/WS alone)

- **Player refresh timer cleanup (Frontend Bug #3)** — The fix ensures that
  stale async refresh/getfile callbacks are discarded on player unmount or track
  change, and that outstanding timers are cleared. This can only be verified by
  mounting and unmounting the player component in a real browser or a jsdom
  environment while observing that no further network requests are made after
  the component is torn down.

### Future REST API test additions

- **WebSocket event validation** — `listing-single-item-complete`,
  `download-started`, and progress events carry significant state
  (`seekSubListTo`, `alreadyExisted`, download percentage) that the REST API
  does not expose. A dedicated WebSocket client test harness is needed to cover
  these paths properly.
- **Bulk video delete** — Multi-video `/delsub` using a batch `mappingIds` array
  (enabled by the Backend Bug #5 fix) needs a test covering deletion of 3+
  mappings in a single request.
- **Multiple playlist + None concurrent adds** — Verify categorization and
  WebSocket streaming correctness when several URLs are submitted simultaneously.
- **`sortOrder` compaction on mid-list deletion** — Verify that deleting a
  playlist that is not last in the list correctly decrements `sortOrder` for all
  higher-sorted playlists, leaving no gaps.
