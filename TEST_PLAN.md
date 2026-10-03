# yt-diff API Test Plan

## Overview

This test plan covers end-to-end API integration testing for `yt-diff`. Tests
are organized into suites that each validate a specific subsystem. Each test
case documents the endpoint, request payload, expected response, and the
invariant being asserted.

**Base URL:** `http://localhost:8888/ytdiff`\
**Auth:** Include a valid JWT in all requests where applicable.

> [!NOTE]
> Tests must be executed in order within each suite. Later suites may depend on
> state established by earlier ones. Tear down the database to a clean state
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

**Playlist:** `Dup Test`\
**URL:**
`https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw`\
**Video:** `Run Immich through a docker container on Tailscale` (`PexSJ31niEI`)

---

### TC-1.1 — Add "Dup Test" playlist

**Endpoint:** `POST /list`

**Request:**

```json
{
  "urlList": [
    "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw"
  ],
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

**Assert:** `status === "success"`. `items[0].reason` is
`"URL not found in database"`, confirming new ingestion.

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
- Both rows reference the same `videoUrl`
  (`https://www.youtube.com/watch?v=PexSJ31niEI`)
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
> Wait for the download to complete (monitor via WebSocket `download-started` /
> progress events) before proceeding to TC-1.5.

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

**Playlist:** `Dup Test 2`\
**URL:**
`https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY`

---

### TC-2.1 — Add "Dup Test 2" playlist

**Endpoint:** `POST /list`

**Request:**

```json
{
  "urlList": [
    "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY"
  ],
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
- `rows[0].video_metadatum.downloadStatus === true` — download state is shared
  across playlists via `VideoMetadata`
- `rows[0].video_metadatum.fileName === "PexSJ31niEI.mkv"`
- `rows[0].video_metadatum.saveDirectory === "Dup Test"` — file is physically
  stored under the original playlist's directory

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
- Confirms the `VideoMetadata` record is shared — cleanup in one playlist
  context propagates everywhere.

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

**Assert:** `status === "success"`. Subsequent `GET /getplay` returns
`count === 1` (only "Dup Test" remains).

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

Validates the three `/delsub` deletion modes: full delete (`deleteVideosInDB`),
unlink-only (`deleteVideoMappings`), and file-cleanup-only (`cleanUp`).

**Playlist:** `E7 Shorts`\
**URL:**
`https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs`

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

Validates paginated sublist retrieval, `sortDownloaded` ordering, downloading a
video already in one playlist into the "None" playlist, and that download state
is visible from both playlist contexts.

**Playlist:** `Screen recordings`\
**URL:**
`https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh`\
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
| ---- | ------- | ------ | ------------------ |
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

**Assert:** `status === "success"`,
`items[0].saveDirectory === "Screen recordings"`.

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
- `items[0].type === "undownloaded"` — video is known to the DB (already listed
  from the playlist) but not yet downloaded

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
- `items[0].saveDirectory === "Screen recordings"` — the video inherits the save
  directory from its original playlist, not from "None".

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

- The row for `JWdTskHy9TE` (position 15) shows `downloadStatus === true`,
  `fileName === "JWdTskHy9TE.mkv"`.
- The row for `i0S9vlyQpig` (position 16) shows `downloadStatus === true`.
- This confirms the shared `VideoMetadata` record reflects the download state in
  both playlist views.

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

Validates that when a playlist is deleted (without deleting video records), the
prune cron job moves downloaded orphans to "None" and destroys un-downloaded
orphans.

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
> Wait for the prune job to execute (up to `PRUNE_INTERVAL`, default 30 min; can
> be shortened via env var for test environments). The job moves downloaded
> orphans to "None" and destroys un-downloaded orphans.

**Endpoint:** `POST /getsub` with `url: "None"`

**Assert:**

- `count === 2` — the two previously downloaded videos (`JWdTskHy9TE`,
  `i0S9vlyQpig`) have been moved to "None".
- All other un-downloaded videos from the playlist have been removed from
  `VideoMetadata`.
- The two rescued videos retain their `fileName`, `thumbNailFile`, and
  `saveDirectory` values.

---

## Suite 6 — "None" Playlist Deduplication and Single-Video Ingestion

Validates idempotent single-video adds, duplicate prevention in "None", and the
WebSocket notification behavior.

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

- `items` array is empty (`[]`) — server recognizes the video is already in
  "None" and skips re-ingestion.
- WebSocket event `listing-single-item-complete` is received with
  `alreadyExisted: true` and a `seekSubListTo` position.

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
- `GET /getsub` for "None" shows `count === 3`, new video at position 3 with
  `downloadStatus === false`.

---

### TC-6.3 — Re-add the same un-downloaded video to "None" (idempotent)

**Endpoint:** `POST /list` (same request as TC-6.2)

**Assert:**

- `items[0].type === "undownloaded"` — video is in DB but not downloaded; server
  acknowledges without creating a duplicate mapping.
- WebSocket event `listing-single-item-complete` received with
  `alreadyExisted: true`.
- `GET /getsub` for "None" still returns `count === 3` (no new entry added).

---

## Suite 7 — Re-Index (`/reindexall`)

Validates that the re-index endpoint re-populates a playlist's video mappings
after they have been cleared.

**Playlist:** `Engineering Stuff`\
**URL:**
`https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2TwKOK-_dXvPlzs1DktqFX`

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
- The response `files` map contains one entry for `PexSJ31niEI.webp` (duplicates
  are de-duplicated server-side).
- Each entry is a structured object containing both `signedUrlId` (a UUID
  string) and `expiry` (a future millisecond timestamp) — not a bare UUID
  string.

> **Regression guard (Frontend Bug #4):** Before this fix, `/getfiles` returned
> only the token UUID, giving the frontend no way to schedule proactive refresh.
> The `expiry` field is now required for the thumbnail sliding-window refresh to
> function correctly.

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
- `expiry` is a new timestamp approximately 30 minutes later than the original,
  confirming the sliding window extension.

---

## Suite 10 — Regression: Per-Mapping Delete for Duplicate Playlist Entries (Backend Bug #5)

Tests the fix that allows individual duplicate entries in a playlist to be
deleted one at a time by mapping ID, without removing all mappings for the same
video URL simultaneously.

**Prerequisite:** The `Dup Test` playlist (`PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw`)
must be present with both duplicate mappings for `PexSJ31niEI` intact and
un-downloaded (state left by Suite 2).

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
- `rows[0].id` is a non-null UUID string — the `PlaylistVideoMapping` row ID for
  position 1
- `rows[1].id` is a **different** non-null UUID string — the mapping row ID for
  position 2
- Both rows reference the same `videoUrl`
  (`https://www.youtube.com/watch?v=PexSJ31niEI`)

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
- `rows[0].positionInPlaylist === 2` — position 1 was removed, position 2
  survives untouched
- `rows[0].video_metadatum.videoUrl === "https://www.youtube.com/watch?v=PexSJ31niEI"`
  — same video still present at position 2

> **Regression guard:** Before this fix, the `/delsub` request validator
> stripped `mappingIds` before it reached the handler, causing deletion by
> `videoUrl` which removed both entries simultaneously. The fix ensures deletion
> by `mappingId` is scoped to the exact row.

---

## Suite 11 — Regression: Sort Index Not Burned on Failed Playlist Bootstrap (Backend Bug #2)

Tests that a failed playlist bootstrap does not consume the next available
`sortOrder` slot, keeping the index sequence contiguous for subsequent
successful additions.

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

Submit a URL that fails during bootstrap — for example, a playlist whose first
several items are all unavailable/private so the listing stream yields no valid
metadata before the failure path is hit.

**Endpoint:** `POST /list`

**Request:**

```json
{
  "urlList": [
    "https://www.youtube.com/playlist?list=PLwLSw1_eDZl3mojgeqUHyMpTt3lQ6ogmJ"
  ],
  "chunkSize": 9,
  "monitoringType": "N/A",
  "sleep": true
}
```

> [!NOTE]
> This URL's first 13 items are unavailable (Backend Bug #1, still open). The
> bootstrap is expected to fail or produce no playlist row. If Bug #1 is fixed
> before this test runs, substitute a different URL that reliably triggers a
> bootstrap failure.

**Assert:**

- `GET /getplay` returns `count === 0` — no playlist record was persisted.

---

### TC-11.3 — Add a valid playlist immediately after the failure

**Endpoint:** `POST /list`

**Request:**

```json
{
  "urlList": [
    "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2TwKOK-_dXvPlzs1DktqFX"
  ],
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

> **Regression guard:** Before this fix, the in-memory sort counter was
> incremented before playlist creation fully succeeded, causing the next
> successful playlist to land at `sortOrder === 1` (or higher) and leaving a
> permanent gap in the display order.

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

Tests the improved feedback messages when adding videos to "None" that are
already known to the database, and that no responses leak absolute filesystem
paths to the client.

**Prerequisite:** At least one video must exist in `VideoMetadata` from a prior
listing (e.g., from Suite 4's `Screen recordings` run) but must not already be
mapped to "None".

---

### TC-12.1 — Adding a known-but-unmapped video to "None" uses fast-path insert

A video that is already in `VideoMetadata` (indexed from a playlist) but not yet
in "None" should be inserted directly into "None" without re-fetching metadata
from the source URL.

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
- `items[0].type` is `"undownloaded"` or `"video"` — not `"undetermined"`.
  `"undetermined"` would indicate yt-dlp was invoked; a more specific type
  confirms the fast-path was taken.
- If the video was already downloaded in another playlist, the WebSocket
  `listing-single-item-complete` event includes the source playlist title and
  position in "None".
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

- No string field starts with `/` followed by a filesystem path component (e.g.,
  `/data/`, `/home/`, `/mnt/`).
- `saveDirectory` values, where present, are relative names only (e.g.,
  `"Screen recordings"`).

---

## Suite 14 — Start/End Incremental Shift Updates

Regression coverage for the watch-mode duplication bug: a playlist gaining
videos at the top (`Start`) shifts every existing position down, and one
appending at the bottom (`End`) grows the tail. The updater used to key rows on
`videoUrl|position` and re-create shifted rows instead of moving them, so every
position ended up with two rows (e.g. `count: 203` with pairs at positions 1..8
on a channel profile).

Static fixtures cannot express a playlist changing under the updater, so these
tests rewrite the mock-tube RSS mid-run — via the `mock-tube` volume mounted
writable into the test-runner — and restore the committed v1 afterwards. Only
the v1 states are committed; v2/v3 states are built by the test. The core
assertion everywhere is `assertExactPlaylistOrder`: positions cover exactly
`1..N` in order, each holds the expected video, and no `(videoUrl, position)`
pair appears twice.

**Playlists:** `start-shift.rss` ("Shift Startcast", v1: 10 videos),
`start-shift-big.rss` ("Shift Startcast Big", v1: 10 videos), `end-append.rss`
("Shift Endcast", v1: 11 videos)

---

### TC-14.1 — Add "Shift Startcast" playlist (10 videos, positions 1..10)

**Endpoint:** `POST /list` (`monitoringType: "N/A"`) then `POST /getsub`

**Assert:** `count === 10`, positions `1..10` hold `video-shift-s01..s10`.

---

### TC-14.2 — Start update after prepending 3 shifts rows without duplicating

Rewrite `start-shift.rss` with 3 new videos prepended (13 total), then
`POST /list` with `monitoringType: "Start"`.

**Assert:**

- `/list` responds `status === "success"` with
  `items[0].reason === "Monitoring type changed"` (the update path ran).
- After settling, `count === 13`; positions `1..3` hold the new videos, `4..13`
  hold the shifted originals; no duplicate pairs.
- The RSS file is restored to v1; the playlist is deleted via `/delplay`.

---

### TC-14.3 — Add "Shift Startcast Big" playlist (10 videos)

Same as TC-14.1 against `start-shift-big.rss`.

---

### TC-14.4 — Start update prepending 12 (more than one chunk) keeps 22 unique rows

Rewrite `start-shift-big.rss` with 12 new videos prepended (22 total, chunk size
10, so the first chunk is entirely new and the shift is only learnable from the
second chunk onward), then re-list with `"Start"`.

**Assert:** `count === 22`; positions `1..12` hold the new videos, `13..22` the
shifted originals; no duplicate pairs. File restored, playlist deleted.

---

### TC-14.5 — Add "Shift Endcast" playlist (11 videos, positions 1..11)

**Endpoint:** `POST /list` (`monitoringType: "N/A"`) then `POST /getsub`

**Assert:** `count === 11`, positions `1..11` hold `video-shift-e01..e11`.

---

### TC-14.6 — End update appending 10 grows the tail without duplicating

Rewrite `end-append.rss` with 10 videos appended (21 total, mirroring a real 11
→ 21 catch-up), then re-list with `"End"`.

**Assert:** `count === 21`; positions `1..11` unchanged, `12..21` hold the
appended videos; no duplicate pairs. The v2 file stays in place for TC-14.7.

---

### TC-14.7 — End update after deleting 2 from the head moves survivors to 1..19

Rewrite `end-append.rss` without its first 2 items (19 total). Monitoring is
already `End`, which `/list` would skip, so `POST /watch` drops it to `"N/A"`
first and the re-list takes the `End` tail path again. The count does not change
(19 moves, 0 creates), so the test waits on survivors reaching positions 1 and
19 rather than on a count.

**Assert:**

- All 19 surviving videos are present at positions `1..19` in order.
- No `(videoUrl, position)` pair appears twice.
- `count === 21`: the 2 deleted videos' rows are retained as ghosts. Tombstoning
  unobserved rows from an incremental walk would also delete yt-dlp-skipped
  private items, so `Full` remains the repair path for deletions.
- The committed v1 is regenerated afterwards and the playlist is deleted via
  `/delplay`.

---

## Suite 15 — Bot-Facing Sidecar, Keep, Cancel and Locate Endpoints

Validates the four endpoints the chat bot and the web UI gained alongside the
partial-download work: fetching only what a run missed, keeping a file, stopping
a job, and opening a link to any page of a list.

**Playlist:** `Dup Test`\
**URL:** `https://mock-tube/playlists/dup-test-1.rss?list=1`\
**Video:** `https://mock-tube/videos/video-dup.mp4`

**Setup:** index the playlist (2 mappings) and download the video.

---

### TC-15.1 — A completed download reports itself complete

**Endpoint:** `POST /getsub`

**Request:**

```json
{
  "start": 0,
  "stop": 8,
  "sortDownloaded": false,
  "query": "",
  "url": "https://mock-tube/playlists/dup-test-1.rss?list=1"
}
```

**Assert** on `rows[0].video_metadatum`:

- `isMetaDataSynced === true`
- `missingExtras === null`
- `chapters === null`
- `botExpiresAt === null`

> **Regression guard:** the fixture offers no subtitles, chapters, description
> or comments, and none of those is something the run failed to fetch. An extra
> the source never had is not a gap, and reporting it as one is what made every
> download look partial. `chapters === null` additionally proves the ffprobe
> probe ran and found nothing — the common case, not a failure.

---

### TC-15.2 — `/syncextras` runs nothing when there is nothing missing

**Endpoint:** `POST /syncextras`

**Request:**

```json
{ "videoUrl": "https://mock-tube/videos/video-dup.mp4" }
```

**Assert:**

- HTTP `200`
- `status === "unchanged"`
- `recovered` and `stillMissing` are both empty arrays

> A retry against a complete download must not spend a yt-dlp process to
> discover there is nothing to fetch.

---

### TC-15.3 — `/syncextras` refuses a body with no video

**Endpoint:** `POST /syncextras`

**Request:**

```json
{}
```

**Assert:** HTTP `400`. The URL is handed to `yt-dlp` as an argument, so a
missing one is a bad request rather than a run against nothing.

---

### TC-15.4 — `/keepfile` says plainly that there was nothing to keep

**Endpoint:** `POST /keepfile`

**Request:**

```json
{ "videoUrl": "https://mock-tube/videos/video-dup.mp4" }
```

**Assert:**

- HTTP `200`
- `status === "success"`
- `kept === 0`

> No bot has fetched this file, so zero is the honest answer and the UI says it
> out loud rather than dressing it up as a success.

---

### TC-15.5 — `/locate` names the list and the page a video opens in

**Endpoint:** `POST /locate`

**Request:**

```json
{
  "videoUrl": "https://mock-tube/videos/video-dup.mp4",
  "pageSize": 8,
  "sortDownloaded": false
}
```

**Assert:**

- HTTP `200`
- `videoUrl` echoes the request
- `playlistUrl === "https://mock-tube/playlists/dup-test-1.rss?list=1"`
- `page === 0`

> The list comes from the same helper `resolveAndEnqueue` uses to pick a folder,
> so the player link opens the list the download actually landed in.

---

### TC-15.6 — `/locate` reports a video that belongs to no list

**Endpoint:** `POST /locate`

**Request:**

```json
{
  "videoUrl": "https://mock-tube/videos/not-indexed.mp4",
  "pageSize": 8
}
```

**Assert:** `playlistUrl === null` and `page === null` — null rather than a
guess, so the caller drops the link instead of opening a list that does not hold
the video.

---

### TC-15.7 — `/cancel` says there was nothing to stop

**Endpoint:** `POST /cancel`

**Request:**

```json
{ "url": "https://mock-tube/videos/video-dup.mp4", "kind": "download" }
```

**Assert:** `outcome === "not-found"`. A bare `200` would leave a client that
hid a button believing the work went away.

---

### TC-15.8 — `/cancel` refuses a kind it does not know

**Endpoint:** `POST /cancel`

**Request:**

```json
{ "url": "https://mock-tube/videos/video-dup.mp4", "kind": "everything" }
```

**Assert:** HTTP `400`.

---

### TC-15.9 — `/cancel` accepts both kinds and answers with one vocabulary

**Endpoint:** `POST /cancel`

**Request:** the same URL under `"download"` and again under `"listing"`.

**Assert:** for each, HTTP `200`, `status === "success"`, the echoed `kind`, and
`outcome` drawn from the same three documented answers (`killed`, `queued`,
`not-found`).

> What this pins is the vocabulary, not a race. A listing or download that is
> genuinely _running_ cannot be caught at a chosen instant in this fixture
> environment — a mock-tube video finishes in tens of milliseconds — so a test
> that waited for `killed` here would be a coin flip, and a coin flip in CI is
> worse than an honest gap. The kill path is covered where it can be
> deterministic instead: the backend's own pipeline tests, and the
> pause-then-cancel round trip in the job-control suite, where a paused job
> stays put long enough to act on.

---

## Suite 16 — Job Control

Pausing, resuming and cancelling a job that is genuinely in flight.

**Playlist:** `Slow Transfer`\
**URL:** `https://mock-tube/playlists/slow-playlist.rss?list=1`\
**Video:** `https://mock-tube/slow/video-slow.mp4`\
**Queued video:** `https://mock-tube/videos/video-slow-2.mp4`

**Setup:** index the playlist (2 mappings). Neither video is downloaded — the
tests do that themselves, because a download that has already finished is not
one you can act on.

The playlist holds two videos on purpose. The first is the throttled one, and
every test that needs a transfer in flight uses it. The second is ordinary speed
and is only ever indexed: it exists to sit queued behind the first and be
cancelled before it takes a slot. A second megabyte of fixture to download
nothing with is not worth keeping. It also has to be a _different_ video — a
second request for the same URL is deduplicated before it reaches the queue, so
the same video twice is one job rather than a job and a wait for it.

**Between tests:** each one deletes the fetched file first (`POST /delsub` with
`cleanUp`). yt-dlp skips a URL whose output is already on disk, and the pipeline
calls a skipped run a success the moment it sees a file, so without this every
test after the first would watch a job finish in milliseconds. The mapping and
the row stay put, so the video is still indexed.

> **Why this fixture exists.** Every other mock video is 2 KB and lands in
> milliseconds. That answers "did this file arrive" and cannot answer "is this
> still running when I ask", which is the question every test below has to ask
> before it acts. nginx caps `/slow/` at 100 KB/s, so this 1,071,444-byte file
> takes exactly ten seconds to fetch — a window wide enough to poll and act, and
> narrow enough not to slow the suite down.

**Environment:** `MAX_DOWNLOADS=1`, so a second request for the same video is
provably still queued while the first holds the only slot.

---

### TC-16.1 — `/queuestatus` reports a running download with real progress

**Endpoint:** `POST /queuestatus`

**Assert** on the download entry for the slow video:

- `state === "running"`, `kind === "download"`, an `id` is present
- `progress.totalBytes === 1071444` — the real size, from the enclosure
- `0 < progress.downloadedBytes < progress.totalBytes`

> A total at or past the end would mean the run is already over, and a bar drawn
> from a number nobody measured is not progress. The bytes have to have come off
> the throttled connection for this to mean anything.

---

### TC-16.2 — Pausing a running download keeps the bytes it has

**Endpoint:** `POST /jobaction`

**Request:** `{ "id": "<running job>", "action": "pause" }`

**Assert:**

- `outcome === "paused"`
- `partialDeleted === false` — pausing keeps the partial file
- the job is then reported with `state === "paused"` and the **same id**
- and it is no longer reported as `running`

> The same id matters: the drawer keys on it, and a pause that minted a new one
> would make the row the user pressed on disappear. The last assertion is what
> makes the first two mean anything — "paused" over a job that is still fetching
> would pass them.

---

### TC-16.3 — A paused download resumes under the same job

**Endpoint:** `POST /jobaction`

**Request:** `{ "id": "<paused job>", "action": "resume" }`

**Assert:** `outcome === "resumed"`, the job reappears as `running` or `queued`
under the same `id`, and the download goes on to complete.

---

### TC-16.4 — Cancelling a paused download throws the kept bytes away

**Endpoint:** `POST /jobaction`

**Request:** `{ "id": "<job>", "action": "pause" }` then
`{ "id": "<same id>", "action": "cancel" }`

**Assert:** `outcome === "cancelled"` and **`partialDeleted === true`**, and the
job is gone from the queue.

> Cancelling a paused job is the one case where deleting is the whole point:
> those bytes are on disk precisely because a pause left them. A cancel that
> kept them would leak half a video every time somebody changed their mind.

---

### TC-16.5 — A running listing is paused and resumed like a download

**Endpoint:** `POST /jobaction`

**Request:** pause, then resume, then cancel a running listing.

**Assert:** each answers `paused`, `resumed`, `cancelled`; a pause reports
`partialDeleted === false`.

> A listing writes no files — it streams JSON into the database and persists
> each chunk as it goes — so there is never anything to delete. Reporting `true`
> here would be claiming a deletion that did not happen.

---

### TC-16.6 — A queued download is cancelled for free

**Endpoint:** `POST /jobaction`

**Setup:** request both videos. `MAX_DOWNLOADS=1`, so the throttled one holds
the only slot and the second is queued behind it.

**Assert** on the queued job: a distinct `id` and `queuePosition > 0`.
Cancelling it answers `cancelled` with `partialDeleted === false`.

> Nothing to kill and nothing to delete — this is the "at no cost" the drawer
> offers, and `partialDeleted` must not claim otherwise. A `queuePosition` of 0
> would mean the drawer is telling someone waiting that they are first.

---

### TC-16.7 — `/jobaction` refuses what it cannot do

**Endpoint:** `POST /jobaction`

**Request:** `{ "id": "no-such-job", "action": "pause" }` and
`{ "id": "no-such-job", "action": "detonate" }`

**Assert:** the first answers `200` with `outcome === "not-found"`; the second
is `400`.

> `not-found` is a normal answer, not an error: the drawer hides the buttons a
> job cannot take, so reaching it means the last poll was stale. It stays a
> `200` so the client can show the sentence without an error branch.

---

## Suite 9 — Cleanup

Tear down all test state created during the plan.

---

### TC-9.1 — Remove remaining videos from "None" playlist

**Endpoint:** `POST /delsub` (repeated per video)

Delete orphaned test videos from "None" using appropriate flag combinations:

- Videos with no files: `deleteVideoMappings: true, deleteVideosInDB: false`
- Videos with downloaded files:
  `cleanUp: true, deleteVideoMappings: true, deleteVideosInDB: true`

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

- **Playlist bootstrap fails when early items are unavailable (Backend Bug #1)**
  — Playlists where the first N items are private or deleted fail to bootstrap
  even though valid items exist further down the list. The URL
  `https://www.youtube.com/playlist?list=PLwLSw1_eDZl3mojgeqUHyMpTt3lQ6ogmJ`
  (first 13 items unavailable) is a confirmed reproduction case. Suite 11
  currently uses this URL as a failure trigger; once the bug is fixed, Suite 11
  must be updated with a different failure URL and a new TC added to confirm the
  playlist bootstraps successfully with a tolerant early-item strategy.

- **Important events should appear in the notification center (Backend Bug #4)**
  — Coverage of snackbar and notification-center events is inconsistent across
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
  WebSocket streaming correctness when several URLs are submitted
  simultaneously.
- **`sortOrder` compaction on mid-list deletion** — Verify that deleting a
  playlist that is not last in the list correctly decrements `sortOrder` for all
  higher-sorted playlists, leaving no gaps.
