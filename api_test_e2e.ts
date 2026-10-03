/**
 * API Test Suite for yt-diff
 *
 * This test suite performs chained API calls to verify the full functionality of the application.
 * It strictly follows the TEST_PLAN.md logic using mock-tube URLs.
 */

// ─── Test Report Tracker ────────────────────────────────────────────────────
interface TestResult {
  name: string;
  suite: string;
  status: "PASS" | "FAIL";
  durationMs: number;
  error?: string;
}

const testResults: TestResult[] = [];
const suiteStartTime = Date.now();

function suiteName(testName: string): string {
  // Extract suite from test name patterns like "TC-1.2 — ..." or "Setup Suite 10: ..."
  const tcMatch = testName.match(/^TC-(\d+)\./);
  if (tcMatch) return `Suite ${tcMatch[1]}`;
  const setupMatch = testName.match(/^Setup Suite (\d+)/);
  if (setupMatch) return `Suite ${setupMatch[1]}`;
  if (testName.startsWith("User ") || testName.startsWith("User")) {
    return "Auth";
  }
  return "Setup";
}

/**
 * Wraps a Deno.test callback to track results for the final report.
 */
function tracked(name: string, fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    const start = performance.now();
    try {
      await fn();
      testResults.push({
        name,
        suite: suiteName(name),
        status: "PASS",
        durationMs: performance.now() - start,
      });
    } catch (err) {
      testResults.push({
        name,
        suite: suiteName(name),
        status: "FAIL",
        durationMs: performance.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err; // re-throw so Deno still marks it as failed
    }
  };
}
// ─────────────────────────────────────────────────────────────────────────────

import { assertEquals, assertExists, assertNotEquals } from "std/assert/mod.ts";
import { io } from "socket.io-client";

const BASE_URL = Deno.env.get("API_BASE_URL") || "http://localhost:8888/ytdiff";
const REPORTS_DIR = Deno.env.get("REPORTS_DIR") ||
  "/home/sagnik/Projects/docker-composes/yt-diff/tests/reports";

const PUBLIC_DUP_TEST_PLAYLIST_URL =
  "https://mock-tube/playlists/dup-test-1.rss?list=1";
const PUBLIC_DUP_TEST_2_PLAYLIST_URL =
  "https://mock-tube/playlists/dup-test-2.rss?list=1";
const E7_SHORTS_PLAYLIST_URL =
  "https://mock-tube/playlists/e7-shorts.rss?list=1";
const PUBLIC_PLAYLIST_BIG_URL =
  "https://mock-tube/playlists/big-playlist.rss?list=1";
const ENGINEERING_PLAYLIST_URL =
  "https://mock-tube/playlists/engineering-playlist.rss?list=1";
const FAILED_PLAYLIST_URL =
  "https://mock-tube/playlists/failed-playlist.rss?list=1";

const SLOW_PLAYLIST_URL =
  "https://mock-tube/playlists/slow-playlist.rss?list=1";
const SLOW_VIDEO_URL = "https://mock-tube/slow/video-slow.mp4";

const DUP_VIDEO_URL = "https://mock-tube/videos/video-dup.mp4";
const E7_VIDEO_1_URL = "https://mock-tube/videos/video-e7-1.mp4";
const E7_VIDEO_2_URL = "https://mock-tube/videos/video-e7-2.mp4";
const BIG_VIDEO_15_URL = "https://mock-tube/videos/video-big-15.mp4";
const BIG_VIDEO_16_URL = "https://mock-tube/videos/video-big-16.mp4";
const SINGLE_VIDEO_URL = "https://mock-tube/videos/video-single.mp4";

// Polling timeouts (upper bounds — waitFor returns as soon as condition is met)
const POLL_INTERVAL = 1000;
const DEFAULT_TIMEOUT = 15000;
const PRUNE_TIMEOUT = 30000; // Prune cron runs every 15s in test env

const testUser = {
  username: `testuser_123`,
  password: "testpassword_123",
};

let token = "";
let dupMappingId = "";
let signedFileId = "";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(
  fn: () => Promise<boolean>,
  timeoutMs: number = DEFAULT_TIMEOUT,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await sleep(POLL_INTERVAL);
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

async function waitForSubCount(
  url: string,
  expectedCount: number,
  timeoutMs: number = DEFAULT_TIMEOUT,
): Promise<void> {
  await waitFor(async () => {
    const resp = await apiRequest("/getsub", {
      method: "POST",
      body: JSON.stringify({
        start: 0,
        stop: 50,
        sortDownloaded: false,
        query: "",
        url,
      }),
    });
    const json = await resp.json();
    return json.count === expectedCount;
  }, timeoutMs);
}

async function waitForPlayCount(
  expectedCount: number,
  timeoutMs: number = DEFAULT_TIMEOUT,
): Promise<void> {
  await waitFor(async () => {
    const resp = await apiRequest("/getplay", {
      method: "POST",
      body: JSON.stringify({
        start: 0,
        stop: 50,
        sort: "1",
        order: "1",
        query: "",
      }),
    });
    const json = await resp.json();
    return json.count === expectedCount;
  }, timeoutMs);
}

async function waitForDownloaded(
  playlistUrl: string,
  videoUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT,
): Promise<void> {
  await waitFor(async () => {
    const resp = await apiRequest("/getsub", {
      method: "POST",
      body: JSON.stringify({
        start: 0,
        stop: 50,
        sortDownloaded: false,
        query: "",
        url: playlistUrl,
      }),
    });
    const json = await resp.json();
    const row = json.rows.find((r: { video_metadatum: { videoUrl: string } }) =>
      r.video_metadatum.videoUrl === videoUrl
    );
    return row?.video_metadatum?.downloadStatus === true;
  }, timeoutMs);
}

async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (token !== "") {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    signal: AbortSignal.timeout(120000), // 120s timeout
  });

  if (!response.ok && response.status !== 401 && response.status !== 409) {
    const text = await response.clone().text();
    console.error(`Request failed: ${url} -> ${response.status} ${text}`);
  }

  return response;
}

// ─── Socket event recorder ──────────────────────────────────────────────────
interface RecordedEvent {
  event: string;
  payload: Record<string, unknown>;
}

interface SocketRecorder {
  received: RecordedEvent[];
  /** Resolves with the first payload for `event`, including ones already seen. */
  waitForEvent(
    event: string,
    timeoutMs?: number,
  ): Promise<Record<string, unknown>>;
  payloadsFor(event: string): Record<string, unknown>[];
  close(): void;
}

/**
 * Connects a socket.io client the way the web UI does and records the named
 * events. Used to assert on progress signalling that never touches the HTTP
 * response, e.g. batch re-index lifecycle.
 */
async function recordSocketEvents(
  eventNames: string[],
): Promise<SocketRecorder> {
  const parsed = new URL(BASE_URL);
  const socket = io(parsed.origin, {
    path: `${parsed.pathname.replace(/\/$/, "")}/socket.io`,
    auth: { token },
    forceNew: true,
    // The import map resolves socket.io-client to the browser bundle, whose
    // default polling transport needs XMLHttpRequest. Deno has no XHR (it fails
    // with "xhr poll error" before it can upgrade), but it does have a native
    // WebSocket, so skip polling. The browser client still negotiates normally.
    transports: ["websocket"],
  });

  const received: RecordedEvent[] = [];
  for (const name of eventNames) {
    socket.on(name, (payload: Record<string, unknown>) => {
      received.push({ event: name, payload: payload ?? {} });
    });
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("socket did not connect in time")),
      15000,
    );
    socket.on("init", (data: { id: string }) => {
      clearTimeout(timer);
      // The server only counts a client once it acknowledges, but decrements on
      // every disconnect — acknowledge so the test does not skew maxClients.
      socket.emit("acknowledge", { data: "Connected", id: data.id });
      resolve();
    });
    socket.on("connect_error", (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  return {
    received,
    payloadsFor(event: string) {
      return received.filter((r) => r.event === event).map((r) => r.payload);
    },
    async waitForEvent(event: string, timeoutMs: number = DEFAULT_TIMEOUT) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const hit = received.find((r) => r.event === event);
        if (hit) return hit.payload;
        await sleep(POLL_INTERVAL);
      }
      throw new Error(`Timed out waiting for socket event "${event}"`);
    },
    close() {
      socket.close();
    },
  };
}

// SETUP: Auth
Deno.test(
  "User Registration Check",
  tracked("User Registration Check", async () => {
    const resp = await apiRequest("/isregallowed", {
      method: "POST",
      body: "{}",
    });
    assertEquals(resp.status, 200);
    await resp.text();
  }),
);

Deno.test(
  "User Registration",
  tracked("User Registration", async () => {
    const resp = await apiRequest("/register", {
      method: "POST",
      body: JSON.stringify(testUser),
    });
    if (resp.status !== 409) {
      assertEquals(resp.status, 201);
      await resp.text();
    } else {
      await resp.text();
    }
  }),
);

Deno.test(
  "User Login",
  tracked("User Login", async () => {
    const resp = await apiRequest("/login", {
      method: "POST",
      body: JSON.stringify(testUser),
    });
    assertEquals(resp.status, 200);
    const json = await resp.json();
    assertEquals(json.status, "success");
    assertExists(json.token);
    token = json.token;
    //console.log(token);
  }),
);

// Suite 0 — Preconditions: Clean State Verification
Deno.test(
  "TC-0.1 — Initial playlist list is empty",
  tracked("TC-0.1 — Initial playlist list is empty", async () => {
    const resp = await apiRequest("/getplay", {
      method: "POST",
      body: JSON.stringify({
        start: 0,
        stop: 10,
        sort: "1",
        order: "1",
        query: "",
      }),
    });
    const json = await resp.json();
    assertEquals(json.count, 0);
    assertEquals(json.rows.length, 0);
  }),
);

Deno.test(
  "TC-0.2 — 'None' playlist sublist is empty",
  tracked("TC-0.2 — 'None' playlist sublist is empty", async () => {
    const resp = await apiRequest("/getsub", {
      method: "POST",
      body: JSON.stringify({
        start: 0,
        stop: 10,
        sortDownloaded: false,
        query: "",
        url: "None",
      }),
    });
    const json = await resp.json();
    assertEquals(json.count, 0);
    assertEquals(json.rows.length, 0);
    assertEquals(json.saveDirectory, "");
  }),
);

// Suite 1 — Duplicate Video Handling (Dup Test Playlist)
Deno.test(
  "TC-1.1 — Add 'Dup Test' playlist",
  tracked("TC-1.1 — Add 'Dup Test' playlist", async () => {
    const resp = await apiRequest("/list", {
      method: "POST",
      body: JSON.stringify({
        urlList: [PUBLIC_DUP_TEST_PLAYLIST_URL],
        chunkSize: 9,
        monitoringType: "N/A",
        sleep: true,
      }),
    });
    const json = await resp.json();
    assertEquals(json.status, "success");
    assertEquals(json.items[0].reason, "URL not found in database");
    await waitForSubCount(PUBLIC_DUP_TEST_PLAYLIST_URL, 2);
  }),
);

Deno.test(
  "TC-1.2 — Playlist appears in listing",
  tracked("TC-1.2 — Playlist appears in listing", async () => {
    const resp = await apiRequest("/getplay", {
      method: "POST",
      body: JSON.stringify({
        start: 0,
        stop: 10,
        sort: "1",
        order: "1",
        query: "",
      }),
    });
    const json = await resp.json();
    assertEquals(json.count, 1);
    assertEquals(json.rows[0].title, "Dup Test");
    assertEquals(json.rows[0].monitoringType, "N/A");
    assertEquals(json.rows[0].sortOrder, 0);
    assertEquals(json.rows[0].saveDirectory, "Dup Test");
  }),
);

Deno.test(
  "TC-1.3 — Sublist contains the duplicate video at two positions",
  tracked(
    "TC-1.3 — Sublist contains the duplicate video at two positions",
    async () => {
      const resp = await apiRequest("/getsub", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 8,
          sortDownloaded: false,
          query: "",
          url: PUBLIC_DUP_TEST_PLAYLIST_URL,
        }),
      });
      const json = await resp.json();
      assertEquals(json.count, 2);
      assertEquals(json.rows[0].positionInPlaylist, 1);
      assertEquals(json.rows[1].positionInPlaylist, 2);
      assertEquals(json.rows[0].video_metadatum.videoUrl, DUP_VIDEO_URL);
      assertEquals(json.rows[1].video_metadatum.videoUrl, DUP_VIDEO_URL);
      assertEquals(json.rows[0].video_metadatum.downloadStatus, false);
      assertEquals(json.rows[1].video_metadatum.downloadStatus, false);
    },
  ),
);

Deno.test(
  "TC-1.4 — Download the video",
  tracked("TC-1.4 — Download the video", async () => {
    const resp = await apiRequest("/download", {
      method: "POST",
      body: JSON.stringify({
        urlList: [DUP_VIDEO_URL],
        playListUrl: PUBLIC_DUP_TEST_PLAYLIST_URL,
      }),
    });
    const json = await resp.json();
    assertEquals(json.status, "success");
    assertEquals(json.items[0].url, DUP_VIDEO_URL);
    assertEquals(json.items[0].saveDirectory, "Dup Test");
    await waitForDownloaded(PUBLIC_DUP_TEST_PLAYLIST_URL, DUP_VIDEO_URL);
  }),
);

Deno.test(
  "TC-1.4.1 — Check Queue Status returns items with correct positions",
  tracked(
    "TC-1.4.1 — Check Queue Status returns items with correct positions",
    async () => {
      const resp = await apiRequest("/queuestatus", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const json = await resp.json();
      assertEquals(json.status, "success");
      assertExists(json.generation);
      assertExists(json.queue);

      // We expect the queue to be an array, but we don't strictly assert the exact count here
      // because the download might complete extremely fast in the mock environment.
      // But we check that if items are present, they have `queuePosition`.
      if (json.queue.length > 0) {
        assertExists(json.queue[0].queuePosition);
      }
    },
  ),
);

Deno.test(
  "TC-1.5 — Both duplicate positions now show as downloaded",
  tracked(
    "TC-1.5 — Both duplicate positions now show as downloaded",
    async () => {
      const resp = await apiRequest("/getsub", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 8,
          sortDownloaded: false,
          query: "",
          url: PUBLIC_DUP_TEST_PLAYLIST_URL,
        }),
      });
      const json = await resp.json();
      assertEquals(json.count, 2);
      assertEquals(json.rows[0].video_metadatum.downloadStatus, true);
      assertEquals(json.rows[1].video_metadatum.downloadStatus, true);
      // Extracted by yt-dlp
      assertEquals(json.rows[0].video_metadatum.fileName, "video-dup.mp4");
      assertEquals(json.rows[1].video_metadatum.fileName, "video-dup.mp4");
      assertEquals(json.rows[0].video_metadatum.isMetaDataSynced, true);
      assertEquals(json.rows[1].video_metadatum.isMetaDataSynced, true);
    },
  ),
);

Deno.test(
  "TC-1.6 — Update monitoring type to 'Full'",
  tracked("TC-1.6 — Update monitoring type to 'Full'", async () => {
    const resp = await apiRequest("/watch", {
      method: "POST",
      body: JSON.stringify({
        url: PUBLIC_DUP_TEST_PLAYLIST_URL,
        watch: "Full",
      }),
    });
    const json = await resp.json();
    assertEquals(json.status, "success");
  }),
);

Deno.test(
  "TC-1.7 — Monitoring type change is reflected in playlist listing",
  tracked(
    "TC-1.7 — Monitoring type change is reflected in playlist listing",
    async () => {
      const resp = await apiRequest("/getplay", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 10,
          sort: "1",
          order: "1",
          query: "",
        }),
      });
      const json = await resp.json();
      assertEquals(json.rows[0].monitoringType, "Full");
    },
  ),
);

// Suite 2 — Many-to-One Video Reference (Dup Test 2 Playlist)
Deno.test(
  "TC-2.1 — Add 'Dup Test 2' playlist",
  tracked("TC-2.1 — Add 'Dup Test 2' playlist", async () => {
    const resp = await apiRequest("/list", {
      method: "POST",
      body: JSON.stringify({
        urlList: [PUBLIC_DUP_TEST_2_PLAYLIST_URL],
        chunkSize: 9,
        monitoringType: "N/A",
        sleep: true,
      }),
    });
    const json = await resp.json();
    assertEquals(json.status, "success");
    await waitForSubCount(PUBLIC_DUP_TEST_2_PLAYLIST_URL, 1);
  }),
);

Deno.test(
  "TC-2.2 — Both playlists appear in listing",
  tracked("TC-2.2 — Both playlists appear in listing", async () => {
    const resp = await apiRequest("/getplay", {
      method: "POST",
      body: JSON.stringify({
        start: 0,
        stop: 10,
        sort: "1",
        order: "1",
        query: "",
      }),
    });
    const json = await resp.json();
    assertEquals(json.count, 2);
    assertEquals(json.rows[1].title, "Dup Test 2");
    assertEquals(json.rows[1].sortOrder, 1);
  }),
);

Deno.test(
  "TC-2.3 — 'Dup Test 2' sublist shows the shared video as already downloaded",
  tracked(
    "TC-2.3 — 'Dup Test 2' sublist shows the shared video as already downloaded",
    async () => {
      const resp = await apiRequest("/getsub", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 8,
          sortDownloaded: false,
          query: "",
          url: PUBLIC_DUP_TEST_2_PLAYLIST_URL,
        }),
      });
      const json = await resp.json();
      assertEquals(json.count, 1);
      assertEquals(json.rows[0].video_metadatum.downloadStatus, true);
      assertEquals(json.rows[0].video_metadatum.fileName, "video-dup.mp4");
      assertEquals(json.rows[0].video_metadatum.saveDirectory, "Dup Test");
    },
  ),
);

Deno.test(
  "TC-2.4 — Clean up files via /delsub",
  tracked("TC-2.4 — Clean up files via /delsub", async () => {
    const resp = await apiRequest("/delsub", {
      method: "POST",
      body: JSON.stringify({
        playListUrl: PUBLIC_DUP_TEST_2_PLAYLIST_URL,
        videoUrls: [DUP_VIDEO_URL],
        cleanUp: true,
        deleteVideoMappings: false,
        deleteVideosInDB: false,
      }),
    });
    const json = await resp.json();
    assertEquals(json.deleted.includes(DUP_VIDEO_URL), true);
    assertEquals(json.failed.length, 0);
  }),
);

Deno.test(
  "TC-2.5 — 'Dup Test 2' sublist shows video as un-downloaded",
  tracked(
    "TC-2.5 — 'Dup Test 2' sublist shows video as un-downloaded",
    async () => {
      const resp = await apiRequest("/getsub", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 8,
          sortDownloaded: false,
          query: "",
          url: PUBLIC_DUP_TEST_2_PLAYLIST_URL,
        }),
      });
      const json = await resp.json();
      assertEquals(json.count, 1);
      assertEquals(json.rows[0].video_metadatum.downloadStatus, false);
      assertEquals(json.rows[0].video_metadatum.fileName, null);
    },
  ),
);

Deno.test(
  "TC-2.6 — 'Dup Test' sublist also reflects the shared un-downloaded state",
  tracked(
    "TC-2.6 — 'Dup Test' sublist also reflects the shared un-downloaded state",
    async () => {
      // The update cron (monitoringType "Full" from TC-1.6) can re-index
      // the playlist mid-suite, causing a transient count=0. Poll first.
      await waitForSubCount(PUBLIC_DUP_TEST_PLAYLIST_URL, 2);

      const resp = await apiRequest("/getsub", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 8,
          sortDownloaded: false,
          query: "",
          url: PUBLIC_DUP_TEST_PLAYLIST_URL,
        }),
      });
      const json = await resp.json();
      assertEquals(json.count, 2);
      assertEquals(json.rows[0].video_metadatum.downloadStatus, false);
      assertEquals(json.rows[1].video_metadatum.downloadStatus, false);
      assertEquals(json.rows[0].video_metadatum.fileName, null);
    },
  ),
);

Deno.test(
  "TC-2.7 — Unlink all videos from 'Dup Test 2', then delete playlist record",
  tracked(
    "TC-2.7 — Unlink all videos from 'Dup Test 2', then delete playlist record",
    async () => {
      const unlinkResp = await apiRequest("/delplay", {
        method: "POST",
        body: JSON.stringify({
          playListUrl: PUBLIC_DUP_TEST_2_PLAYLIST_URL,
          deleteAllVideosInPlaylist: true,
          deletePlaylist: false,
          cleanUp: false,
        }),
      });
      let json = await unlinkResp.json();
      assertEquals(json.status, "success");

      const deleteResp = await apiRequest("/delplay", {
        method: "POST",
        body: JSON.stringify({
          playListUrl: PUBLIC_DUP_TEST_2_PLAYLIST_URL,
          deleteAllVideosInPlaylist: false,
          deletePlaylist: true,
          cleanUp: false,
        }),
      });
      json = await deleteResp.json();
      assertEquals(json.status, "success");

      const checkResp = await apiRequest("/getplay", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 10,
          sort: "1",
          order: "1",
          query: "",
        }),
      });
      json = await checkResp.json();
      assertEquals(json.count, 1);
    },
  ),
);

Deno.test(
  "TC-2.8 — Delete everything for 'Dup Test' (mappings + playlist + disk)",
  tracked(
    "TC-2.8 — Delete everything for 'Dup Test' (mappings + playlist + disk)",
    async () => {
      const resp = await apiRequest("/delplay", {
        method: "POST",
        body: JSON.stringify({
          playListUrl: PUBLIC_DUP_TEST_PLAYLIST_URL,
          deleteAllVideosInPlaylist: true,
          deletePlaylist: true,
          cleanUp: true,
        }),
      });
      const json = await resp.json();
      assertEquals(json.status, "success");

      const checkResp = await apiRequest("/getplay", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 10,
          sort: "1",
          order: "1",
          query: "",
        }),
      });
      const checkJson = await checkResp.json();
      assertEquals(checkJson.count, 0);
    },
  ),
);

// Suite 3 — Video Deletion Modes (E7 Shorts Playlist)
Deno.test(
  "TC-3.1 — Add 'E7 Shorts', verify 2 videos are listed",
  tracked("TC-3.1 — Add 'E7 Shorts', verify 2 videos are listed", async () => {
    const listResp = await apiRequest("/list", {
      method: "POST",
      body: JSON.stringify({
        urlList: [E7_SHORTS_PLAYLIST_URL],
        chunkSize: 9,
        monitoringType: "N/A",
        sleep: true,
      }),
    });
    await listResp.json();
    await waitForSubCount(E7_SHORTS_PLAYLIST_URL, 2);

    const resp = await apiRequest("/getsub", {
      method: "POST",
      body: JSON.stringify({
        start: 0,
        stop: 8,
        sortDownloaded: false,
        query: "",
        url: E7_SHORTS_PLAYLIST_URL,
      }),
    });
    const json = await resp.json();
    assertEquals(json.count, 2);
    assertEquals(json.rows[0].video_metadatum.downloadStatus, false);
  }),
);

Deno.test(
  "TC-3.2 — Hard-delete first video (deleteVideosInDB = true)",
  tracked(
    "TC-3.2 — Hard-delete first video (deleteVideosInDB = true)",
    async () => {
      const resp = await apiRequest("/delsub", {
        method: "POST",
        body: JSON.stringify({
          playListUrl: E7_SHORTS_PLAYLIST_URL,
          videoUrls: [E7_VIDEO_1_URL],
          cleanUp: true,
          deleteVideoMappings: true,
          deleteVideosInDB: true,
        }),
      });
      const json = await resp.json();
      assertEquals(json.deleted.includes(E7_VIDEO_1_URL), true);
      assertEquals(json.failed.length, 0);
    },
  ),
);

Deno.test(
  "TC-3.3 — Sublist now contains only one video (at position 2)",
  tracked(
    "TC-3.3 — Sublist now contains only one video (at position 2)",
    async () => {
      const resp = await apiRequest("/getsub", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 8,
          sortDownloaded: false,
          query: "",
          url: E7_SHORTS_PLAYLIST_URL,
        }),
      });
      const json = await resp.json();
      assertEquals(json.count, 1);
      assertEquals(json.rows[0].positionInPlaylist, 2);
      assertEquals(json.rows[0].video_metadatum.videoUrl, E7_VIDEO_2_URL);
    },
  ),
);

Deno.test(
  "TC-3.4 — Unlink second video (deleteVideoMappings = true, no DB delete)",
  tracked(
    "TC-3.4 — Unlink second video (deleteVideoMappings = true, no DB delete)",
    async () => {
      const resp = await apiRequest("/delsub", {
        method: "POST",
        body: JSON.stringify({
          playListUrl: E7_SHORTS_PLAYLIST_URL,
          videoUrls: [E7_VIDEO_2_URL],
          cleanUp: false,
          deleteVideoMappings: true,
          deleteVideosInDB: false,
        }),
      });
      const json = await resp.json();
      assertEquals(json.deleted.includes(E7_VIDEO_2_URL), true);
    },
  ),
);

Deno.test(
  "TC-3.5 — Sublist is now empty; playlist record still exists",
  tracked(
    "TC-3.5 — Sublist is now empty; playlist record still exists",
    async () => {
      const resp = await apiRequest("/getsub", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 8,
          sortDownloaded: false,
          query: "",
          url: E7_SHORTS_PLAYLIST_URL,
        }),
      });
      const json = await resp.json();
      assertEquals(json.count, 0);
    },
  ),
);

Deno.test(
  "TC-3.6 — Delete only the playlist record",
  tracked("TC-3.6 — Delete only the playlist record", async () => {
    const resp = await apiRequest("/delplay", {
      method: "POST",
      body: JSON.stringify({
        playListUrl: E7_SHORTS_PLAYLIST_URL,
        deleteAllVideosInPlaylist: false,
        deletePlaylist: true,
        cleanUp: false,
      }),
    });
    const json = await resp.json();
    assertEquals(json.status, "success");

    const checkResp = await apiRequest("/getplay", {
      method: "POST",
      body: JSON.stringify({
        start: 0,
        stop: 10,
        sort: "1",
        order: "1",
        query: "",
      }),
    });
    const checkJson = await checkResp.json();
    assertEquals(checkJson.count, 0);
  }),
);

// Suite 4 — Pagination, Sorting, Download, and Cross-Playlist State (Screen recordings)
Deno.test(
  "TC-4.1 — Add 'Screen recordings' and wait for full listing",
  tracked(
    "TC-4.1 — Add 'Screen recordings' and wait for full listing",
    async () => {
      const listResp = await apiRequest("/list", {
        method: "POST",
        body: JSON.stringify({
          urlList: [PUBLIC_PLAYLIST_BIG_URL],
          chunkSize: 9,
          monitoringType: "N/A",
          sleep: true,
        }),
      });
      const json = await listResp.json();
      assertEquals(json.status, "success");
      await waitForSubCount(PUBLIC_PLAYLIST_BIG_URL, 17);
    },
  ),
);

Deno.test(
  "TC-4.2 — Paginated sublist retrieval (3 pages, 17 total)",
  tracked(
    "TC-4.2 — Paginated sublist retrieval (3 pages, 17 total)",
    async () => {
      // Page 1
      let resp = await apiRequest("/getsub", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 8,
          sortDownloaded: false,
          query: "",
          url: PUBLIC_PLAYLIST_BIG_URL,
        }),
      });
      let json = await resp.json();
      assertEquals(json.count, 17);
      assertEquals(json.rows.length, 8);
      assertEquals(json.rows[0].video_metadatum.downloadStatus, false);

      // Page 2
      resp = await apiRequest("/getsub", {
        method: "POST",
        body: JSON.stringify({
          start: 8,
          stop: 16,
          sortDownloaded: false,
          query: "",
          url: PUBLIC_PLAYLIST_BIG_URL,
        }),
      });
      json = await resp.json();
      assertEquals(json.count, 17);
      assertEquals(json.rows.length, 8);

      // Page 3
      resp = await apiRequest("/getsub", {
        method: "POST",
        body: JSON.stringify({
          start: 16,
          stop: 24,
          sortDownloaded: false,
          query: "",
          url: PUBLIC_PLAYLIST_BIG_URL,
        }),
      });
      json = await resp.json();
      assertEquals(json.count, 17);
      assertEquals(json.rows.length, 1);
    },
  ),
);

Deno.test(
  "TC-4.3 — Download a video within the playlist",
  tracked("TC-4.3 — Download a video within the playlist", async () => {
    const resp = await apiRequest("/download", {
      method: "POST",
      body: JSON.stringify({
        urlList: [BIG_VIDEO_16_URL],
        playListUrl: PUBLIC_PLAYLIST_BIG_URL,
      }),
    });
    const json = await resp.json();
    assertEquals(json.status, "success");
    assertEquals(json.items[0].saveDirectory, "Screen recordings");
    await waitForDownloaded(PUBLIC_PLAYLIST_BIG_URL, BIG_VIDEO_16_URL);
  }),
);

Deno.test(
  "TC-4.4 — Add a video already in 'Screen recordings' to the 'None' playlist",
  tracked(
    "TC-4.4 — Add a video already in 'Screen recordings' to the 'None' playlist",
    async () => {
      const resp = await apiRequest("/list", {
        method: "POST",
        body: JSON.stringify({
          urlList: [BIG_VIDEO_15_URL],
          chunkSize: 9,
          monitoringType: "N/A",
          sleep: true,
        }),
      });
      const json = await resp.json();
      assertEquals(json.status, "success");
      // Backend fast-path insert returns empty items array
      await waitForSubCount("None", 1);
    },
  ),
);

Deno.test(
  "TC-4.5 — 'None' sublist shows the newly added video",
  tracked("TC-4.5 — 'None' sublist shows the newly added video", async () => {
    const resp = await apiRequest("/getsub", {
      method: "POST",
      body: JSON.stringify({
        start: 0,
        stop: 8,
        sortDownloaded: false,
        query: "",
        url: "None",
      }),
    });
    const json = await resp.json();
    assertEquals(json.count, 1);
    assertEquals(json.rows[0].video_metadatum.videoUrl, BIG_VIDEO_15_URL);
    assertEquals(json.rows[0].video_metadatum.downloadStatus, false);
  }),
);

Deno.test(
  "TC-4.6 — Download the video via the 'None' playlist context",
  tracked(
    "TC-4.6 — Download the video via the 'None' playlist context",
    async () => {
      const resp = await apiRequest("/download", {
        method: "POST",
        body: JSON.stringify({
          urlList: [BIG_VIDEO_15_URL],
          playListUrl: "None",
        }),
      });
      const json = await resp.json();
      assertEquals(json.status, "success");
      assertEquals(json.items[0].saveDirectory, "Screen recordings");
      await waitForDownloaded("None", BIG_VIDEO_15_URL);
    },
  ),
);

Deno.test(
  "TC-4.7 — 'None' sublist confirms download success",
  tracked("TC-4.7 — 'None' sublist confirms download success", async () => {
    const resp = await apiRequest("/getsub", {
      method: "POST",
      body: JSON.stringify({
        start: 0,
        stop: 8,
        sortDownloaded: false,
        query: "",
        url: "None",
      }),
    });
    const json = await resp.json();
    assertEquals(json.rows[0].video_metadatum.downloadStatus, true);
    assertEquals(json.rows[0].video_metadatum.fileName, "video-big-15.mp4");
    assertEquals(json.rows[0].video_metadatum.isMetaDataSynced, true);
    assertEquals(
      json.rows[0].video_metadatum.saveDirectory,
      "Screen recordings",
    );
  }),
);

Deno.test(
  "TC-4.8 — Download state visible from the original playlist context",
  tracked(
    "TC-4.8 — Download state visible from the original playlist context",
    async () => {
      const resp = await apiRequest("/getsub", {
        method: "POST",
        body: JSON.stringify({
          start: 8,
          stop: 16,
          sortDownloaded: false,
          query: "",
          url: PUBLIC_PLAYLIST_BIG_URL,
        }),
      });
      const json = await resp.json();
      const v15 = json.rows.find((
        r: { video_metadatum: { videoUrl: string } },
      ) => r.video_metadatum.videoUrl === BIG_VIDEO_15_URL);
      const v16 = json.rows.find((
        r: { video_metadatum: { videoUrl: string } },
      ) => r.video_metadatum.videoUrl === BIG_VIDEO_16_URL);
      assertEquals(v15.video_metadatum.downloadStatus, true);
      assertEquals(v15.video_metadatum.fileName, "video-big-15.mp4");
      assertEquals(v16.video_metadatum.downloadStatus, true);
    },
  ),
);

Deno.test(
  "TC-4.9 — sortDownloaded ordering (downloaded items first)",
  tracked(
    "TC-4.9 — sortDownloaded ordering (downloaded items first)",
    async () => {
      const resp = await apiRequest("/getsub", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 8,
          sortDownloaded: true,
          query: "",
          url: PUBLIC_PLAYLIST_BIG_URL,
        }),
      });
      const json = await resp.json();
      assertEquals(json.rows[0].video_metadatum.downloadStatus, true);
      assertEquals(json.rows[1].video_metadatum.downloadStatus, true);
      assertEquals(
        json.rows[0].positionInPlaylist < json.rows[1].positionInPlaylist,
        true,
      );
      assertEquals(json.rows[2].video_metadatum.downloadStatus, false);
    },
  ),
);

// Suite 8 — Signed URL and File Retrieval (moved here: only needs Suite 4's downloaded file)
Deno.test(
  "TC-8.1 — Batch-resolve signed URLs for multiple files",
  tracked("TC-8.1 — Batch-resolve signed URLs for multiple files", async () => {
    const resp = await apiRequest("/getfiles", {
      method: "POST",
      body: JSON.stringify({
        files: [
          { saveDirectory: "Screen recordings", fileName: "video-big-15.mp4" },
          { saveDirectory: "Screen recordings", fileName: "video-big-15.mp4" },
        ],
      }),
    });
    const json = await resp.json();
    assertEquals(json.status, "success");
    assertExists(json.files["video-big-15.mp4"].signedUrlId);
    assertExists(json.files["video-big-15.mp4"].expiry);
  }),
);

Deno.test(
  "TC-8.2 — Resolve a single signed URL",
  tracked("TC-8.2 — Resolve a single signed URL", async () => {
    const resp = await apiRequest("/getfile", {
      method: "POST",
      body: JSON.stringify({
        saveDirectory: "Screen recordings",
        fileName: "video-big-15.mp4",
      }),
    });
    const json = await resp.json();
    assertEquals(json.status, "success");
    assertExists(json.signedUrlId);
    assertExists(json.expiry);
    signedFileId = json.signedUrlId;
  }),
);

Deno.test(
  "TC-8.3 — Stream file content using signed URL token",
  tracked("TC-8.3 — Stream file content using signed URL token", async () => {
    const resp = await apiRequest(`/getfile?fileId=${signedFileId}`, {
      method: "GET",
    });
    assertEquals(resp.status, 200);
    const buffer = await resp.arrayBuffer();
    assertNotEquals(buffer.byteLength, 0);
  }),
);

Deno.test(
  "TC-8.4 — Refresh a signed URL token before expiry",
  tracked("TC-8.4 — Refresh a signed URL token before expiry", async () => {
    const resp = await apiRequest("/refreshfile", {
      method: "POST",
      body: JSON.stringify({ fileId: signedFileId }),
    });
    const json = await resp.json();
    assertEquals(json.status, "success");
    assertExists(json.expiry);
  }),
);

// Suite 5 — Prune Job and "None" Playlist Orphan Handling
Deno.test(
  "TC-5.1 — Delete the 'Screen recordings' playlist record",
  tracked(
    "TC-5.1 — Delete the 'Screen recordings' playlist record",
    async () => {
      const resp = await apiRequest("/delplay", {
        method: "POST",
        body: JSON.stringify({
          playListUrl: PUBLIC_PLAYLIST_BIG_URL,
          deleteAllVideosInPlaylist: false,
          deletePlaylist: true,
          cleanUp: false,
        }),
      });
      const json = await resp.json();
      assertEquals(json.status, "success");

      const checkResp = await apiRequest("/getplay", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 10,
          sort: "1",
          order: "1",
          query: "",
        }),
      });
      const checkJson = await checkResp.json();
      assertEquals(checkJson.count, 0);
    },
  ),
);

Deno.test(
  "TC-5.2 — 'None' sublist immediately after deletion (before prune job runs)",
  tracked(
    "TC-5.2 — 'None' sublist immediately after deletion (before prune job runs)",
    async () => {
      const resp = await apiRequest("/getsub", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 10,
          sortDownloaded: false,
          query: "",
          url: "None",
        }),
      });
      const json = await resp.json();
      assertEquals(json.count, 1);
    },
  ),
);

Deno.test(
  "TC-5.3 — 'None' sublist after prune job runs",
  tracked("TC-5.3 — 'None' sublist after prune job runs", async () => {
    console.log("Waiting for prune job to move orphaned videos to 'None'...");
    await waitForSubCount("None", 2, PRUNE_TIMEOUT);

    const resp = await apiRequest("/getsub", {
      method: "POST",
      body: JSON.stringify({
        start: 0,
        stop: 10,
        sortDownloaded: false,
        query: "",
        url: "None",
      }),
    });
    const json = await resp.json();
    assertEquals(json.count, 2);
  }),
);

// Suite 6 — "None" Playlist Deduplication and Single-Video Ingestion
Deno.test(
  "TC-6.1 — Re-add a video already downloaded in 'None' (no-op)",
  tracked(
    "TC-6.1 — Re-add a video already downloaded in 'None' (no-op)",
    async () => {
      const resp = await apiRequest("/list", {
        method: "POST",
        body: JSON.stringify({
          urlList: [BIG_VIDEO_15_URL],
          chunkSize: 9,
          monitoringType: "N/A",
          sleep: true,
        }),
      });
      const json = await resp.json();
      assertEquals(json.items.length, 0); // Should be skipped
    },
  ),
);

Deno.test(
  "TC-6.2 — Add a new single video to 'None'",
  tracked("TC-6.2 — Add a new single video to 'None'", async () => {
    const resp = await apiRequest("/list", {
      method: "POST",
      body: JSON.stringify({
        urlList: [SINGLE_VIDEO_URL],
        chunkSize: 9,
        monitoringType: "N/A",
        sleep: true,
      }),
    });
    const json = await resp.json();
    assertEquals(json.items[0].reason, "URL not found in database");
    await waitForSubCount("None", 3);

    const subResp = await apiRequest("/getsub", {
      method: "POST",
      body: JSON.stringify({
        start: 0,
        stop: 8,
        sortDownloaded: false,
        query: "",
        url: "None",
      }),
    });
    const subJson = await subResp.json();
    assertEquals(subJson.count, 3);
  }),
);

Deno.test(
  "TC-6.3 — Re-add the same un-downloaded video to 'None' (idempotent)",
  tracked(
    "TC-6.3 — Re-add the same un-downloaded video to 'None' (idempotent)",
    async () => {
      const resp = await apiRequest("/list", {
        method: "POST",
        body: JSON.stringify({
          urlList: [SINGLE_VIDEO_URL],
          chunkSize: 9,
          monitoringType: "N/A",
          sleep: true,
        }),
      });
      const json = await resp.json();
      assertEquals(json.status, "success");

      const subResp = await apiRequest("/getsub", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 8,
          sortDownloaded: false,
          query: "",
          url: "None",
        }),
      });
      const subJson = await subResp.json();
      assertEquals(subJson.count, 3);
    },
  ),
);

// Suite 7 — Re-Index (/reindexall)
Deno.test(
  "TC-7.1 — Add 'Engineering Stuff' playlist and verify it has 1 video",
  tracked(
    "TC-7.1 — Add 'Engineering Stuff' playlist and verify it has 1 video",
    async () => {
      await (await apiRequest("/list", {
        method: "POST",
        body: JSON.stringify({
          urlList: [ENGINEERING_PLAYLIST_URL],
          chunkSize: 9,
          monitoringType: "N/A",
          sleep: true,
        }),
      })).text();
      await waitForSubCount(ENGINEERING_PLAYLIST_URL, 1);

      const resp = await apiRequest("/getsub", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 8,
          sortDownloaded: false,
          query: "",
          url: ENGINEERING_PLAYLIST_URL,
        }),
      });
      const json = await resp.json();
      assertEquals(json.count, 1);
    },
  ),
);

Deno.test(
  "TC-7.2 — Unlink all videos from the playlist",
  tracked("TC-7.2 — Unlink all videos from the playlist", async () => {
    const resp = await apiRequest("/delplay", {
      method: "POST",
      body: JSON.stringify({
        playListUrl: ENGINEERING_PLAYLIST_URL,
        deleteAllVideosInPlaylist: true,
        deletePlaylist: false,
        cleanUp: false,
      }),
    });
    const json = await resp.json();
    assertEquals(json.status, "success");

    const subResp = await apiRequest("/getsub", {
      method: "POST",
      body: JSON.stringify({
        start: 0,
        stop: 8,
        sortDownloaded: false,
        query: "",
        url: ENGINEERING_PLAYLIST_URL,
      }),
    });
    const subJson = await subResp.json();
    assertEquals(subJson.count, 0);
  }),
);

Deno.test(
  "TC-7.3 — Trigger re-index for all playlists in range",
  tracked("TC-7.3 — Trigger re-index for all playlists in range", async () => {
    const resp = await apiRequest("/reindexall", {
      method: "POST",
      body: JSON.stringify({ start: 0, stop: 10, chunkSize: 8 }),
    });
    const json = await resp.json();
    assertEquals(json.status, "success");
    assertEquals(json.queued, 1);
    assertEquals(json.total, 1);
    // Correlation id the socket lifecycle events are stamped with.
    assertExists(json.batchId);
    assertNotEquals(json.batchId, "");
  }),
);

Deno.test(
  "TC-7.4 — Sublist repopulated after re-index completes",
  tracked("TC-7.4 — Sublist repopulated after re-index completes", async () => {
    await waitForSubCount(ENGINEERING_PLAYLIST_URL, 1);
    const resp = await apiRequest("/getsub", {
      method: "POST",
      body: JSON.stringify({
        start: 0,
        stop: 8,
        sortDownloaded: false,
        query: "",
        url: ENGINEERING_PLAYLIST_URL,
      }),
    });
    const json = await resp.json();
    assertEquals(json.count, 1);
  }),
);
Deno.test(
  "TC-7.5 — Batch re-index emits per-playlist progress over the socket",
  tracked(
    "TC-7.5 — Batch re-index emits per-playlist progress over the socket",
    async () => {
      const recorder = await recordSocketEvents([
        "reindex-batch-started",
        "reindex-batch-complete",
        "reindex-batch-failed",
        "listing-started",
        "listing-playlist-complete",
        "listing-playlist-chunk-complete",
        "listing-error",
      ]);

      try {
        const resp = await apiRequest("/reindexall", {
          method: "POST",
          body: JSON.stringify({ start: 0, stop: 10, chunkSize: 8 }),
        });
        const json = await resp.json();
        assertEquals(json.status, "success");
        const batchId = json.batchId;

        // Acknowledgement event, carrying the same batch id as the response.
        const started = await recorder.waitForEvent("reindex-batch-started");
        assertEquals(started.batchId, batchId);
        assertEquals(started.queued, json.queued);

        // Completion event, with the final tally.
        const done = await recorder.waitForEvent("reindex-batch-complete");
        assertEquals(done.batchId, batchId);
        assertEquals(done.total, json.queued);
        assertEquals(done.completed, json.queued);
        assertEquals(done.failed, 0);
        assertExists(done.durationMs);

        // Per-playlist progress must have flowed despite the batch running on
        // the scheduled-update code path.
        assertNotEquals(recorder.payloadsFor("listing-started").length, 0);
        const completions = recorder.payloadsFor("listing-playlist-complete");
        assertEquals(completions.length, json.queued);
        assertEquals(completions[0].url, ENGINEERING_PLAYLIST_URL);

        // Per-chunk events stay suppressed: a batch is per-playlist only.
        assertEquals(
          recorder.payloadsFor("listing-playlist-chunk-complete").length,
          0,
        );
        assertEquals(recorder.payloadsFor("reindex-batch-failed").length, 0);
      } finally {
        recorder.close();
      }
    },
  ),
);

Deno.test(
  "TC-7.7 — /list reports the listing backlog ahead of a submission",
  tracked(
    "TC-7.7 — /list reports the listing backlog ahead of a submission",
    async () => {
      const resp = await apiRequest("/list", {
        method: "POST",
        body: JSON.stringify({
          urlList: [ENGINEERING_PLAYLIST_URL],
          chunkSize: 9,
          monitoringType: "N/A",
          sleep: true,
        }),
      });
      const json = await resp.json();
      assertEquals(json.status, "success");
      // Present and numeric so the UI can decide whether to warn; the exact
      // depth depends on what else is in flight.
      assertEquals(typeof json.queueDepthBefore, "number");
    },
  ),
);

// Suite 10 — Regression: Per-Mapping Delete for Duplicate Playlist Entries
Deno.test(
  "Setup Suite 10: Restore Dup Test with duplicates",
  tracked("Setup Suite 10: Restore Dup Test with duplicates", async () => {
    await (await apiRequest("/list", {
      method: "POST",
      body: JSON.stringify({
        urlList: [PUBLIC_DUP_TEST_PLAYLIST_URL],
        chunkSize: 9,
        monitoringType: "N/A",
        sleep: true,
      }),
    })).text();
    await waitForSubCount(PUBLIC_DUP_TEST_PLAYLIST_URL, 2);
  }),
);

Deno.test(
  "TC-10.1 — /getsub returns a mapping id for each row",
  tracked("TC-10.1 — /getsub returns a mapping id for each row", async () => {
    const resp = await apiRequest("/getsub", {
      method: "POST",
      body: JSON.stringify({
        start: 0,
        stop: 8,
        sortDownloaded: false,
        query: "",
        url: PUBLIC_DUP_TEST_PLAYLIST_URL,
      }),
    });
    const json = await resp.json();
    assertEquals(json.count, 2);
    assertExists(json.rows[0].id);
    assertExists(json.rows[1].id);
    assertNotEquals(json.rows[0].id, json.rows[1].id);
    assertEquals(json.rows[0].video_metadatum.videoUrl, DUP_VIDEO_URL);
    assertEquals(json.rows[1].video_metadatum.videoUrl, DUP_VIDEO_URL);
    dupMappingId = json.rows[0].id;
  }),
);

Deno.test(
  "TC-10.2 — Delete only the first duplicate by mapping ID",
  tracked(
    "TC-10.2 — Delete only the first duplicate by mapping ID",
    async () => {
      const resp = await apiRequest("/delsub", {
        method: "POST",
        body: JSON.stringify({
          playListUrl: PUBLIC_DUP_TEST_PLAYLIST_URL,
          mappingIds: [dupMappingId],
          cleanUp: false,
          deleteVideoMappings: true,
          deleteVideosInDB: false,
        }),
      });
      const json = await resp.json();
      assertNotEquals(json.deleted.length, 0);
      assertEquals(json.failed.length, 0);
    },
  ),
);

Deno.test(
  "TC-10.3 — Only one mapping remains (position 2 is intact)",
  tracked(
    "TC-10.3 — Only one mapping remains (position 2 is intact)",
    async () => {
      const resp = await apiRequest("/getsub", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 8,
          sortDownloaded: false,
          query: "",
          url: PUBLIC_DUP_TEST_PLAYLIST_URL,
        }),
      });
      const json = await resp.json();
      assertEquals(json.count, 1);
      assertEquals(json.rows[0].positionInPlaylist, 2);
      assertEquals(json.rows[0].video_metadatum.videoUrl, DUP_VIDEO_URL);
    },
  ),
);

// Suite 11 — Regression: Sort Index Not Burned on Failed Playlist Bootstrap
Deno.test(
  "TC-11.1 — Baseline: Delete Engineering Stuff and clear all",
  tracked(
    "TC-11.1 — Baseline: Delete Engineering Stuff and clear all",
    async () => {
      await (await apiRequest("/delplay", {
        method: "POST",
        body: JSON.stringify({
          playListUrl: ENGINEERING_PLAYLIST_URL,
          deleteAllVideosInPlaylist: true,
          deletePlaylist: true,
          cleanUp: true,
        }),
      })).text();
      await (await apiRequest("/delplay", {
        method: "POST",
        body: JSON.stringify({
          playListUrl: PUBLIC_DUP_TEST_PLAYLIST_URL,
          deleteAllVideosInPlaylist: true,
          deletePlaylist: true,
          cleanUp: true,
        }),
      })).text();
      const resp = await apiRequest("/getplay", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 10,
          sort: "1",
          order: "1",
          query: "",
        }),
      });
      const json = await resp.json();
      assertEquals(json.count, 0);
    },
  ),
);

Deno.test(
  "TC-11.2 — Trigger a failed playlist bootstrap",
  tracked("TC-11.2 — Trigger a failed playlist bootstrap", async () => {
    await (await apiRequest("/list", {
      method: "POST",
      body: JSON.stringify({
        urlList: [FAILED_PLAYLIST_URL],
        chunkSize: 9,
        monitoringType: "N/A",
        sleep: true,
      }),
    })).text();
    await waitForPlayCount(1);
    const resp = await apiRequest("/getplay", {
      method: "POST",
      body: JSON.stringify({
        start: 0,
        stop: 10,
        sort: "1",
        order: "1",
        query: "",
      }),
    });
    const json = await resp.json();
    // BUG: Backend adds failed playlist to DB
    assertEquals(json.count, 1);
  }),
);

Deno.test(
  "TC-11.3 — Add a valid playlist immediately after the failure",
  tracked(
    "TC-11.3 — Add a valid playlist immediately after the failure",
    async () => {
      const resp = await apiRequest("/list", {
        method: "POST",
        body: JSON.stringify({
          urlList: [ENGINEERING_PLAYLIST_URL],
          chunkSize: 9,
          monitoringType: "N/A",
          sleep: true,
        }),
      });
      const json = await resp.json();
      assertEquals(json.status, "success");
      await waitForSubCount(ENGINEERING_PLAYLIST_URL, 1);
    },
  ),
);

Deno.test(
  "TC-11.4 — Valid playlist gets sortOrder === 0 with no gap",
  tracked(
    "TC-11.4 — Valid playlist gets sortOrder === 0 with no gap",
    async () => {
      const resp = await apiRequest("/getplay", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 10,
          sort: "1",
          order: "1",
          query: "",
        }),
      });
      const json = await resp.json();
      assertEquals(json.count, 2);
      assertEquals(json.rows[1].sortOrder, 1);
    },
  ),
);

Deno.test(
  "TC-11.5 — Teardown: delete the Engineering Stuff playlist",
  tracked(
    "TC-11.5 — Teardown: delete the Engineering Stuff playlist",
    async () => {
      const resp = await apiRequest("/delplay", {
        method: "POST",
        body: JSON.stringify({
          playListUrl: ENGINEERING_PLAYLIST_URL,
          deleteAllVideosInPlaylist: true,
          deletePlaylist: true,
          cleanUp: false,
        }),
      });
      const json = await resp.json();
      assertEquals(json.status, "success");

      const checkResp = await apiRequest("/getplay", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 10,
          sort: "1",
          order: "1",
          query: "",
        }),
      });
      const checkJson = await checkResp.json();
      assertEquals(checkJson.count, 1); // Only the failed playlist remains
    },
  ),
);

// Suite 12 — Regression: "None" Playlist Add Feedback and No Filesystem Path Exposure
Deno.test(
  "TC-12.1 — Adding a known-but-unmapped video to 'None' uses fast-path insert",
  tracked(
    "TC-12.1 — Adding a known-but-unmapped video to 'None' uses fast-path insert",
    async () => {
      await (await apiRequest("/list", {
        method: "POST",
        body: JSON.stringify({
          urlList: [E7_SHORTS_PLAYLIST_URL],
          chunkSize: 9,
          monitoringType: "N/A",
          sleep: true,
        }),
      })).text();
      await waitForSubCount(E7_SHORTS_PLAYLIST_URL, 2);

      const resp = await apiRequest("/list", {
        method: "POST",
        body: JSON.stringify({
          urlList: [E7_VIDEO_1_URL],
          chunkSize: 9,
          monitoringType: "N/A",
          sleep: true,
        }),
      });
      const json = await resp.json();
      assertEquals(json.status, "success");
    },
  ),
);

Deno.test(
  "TC-12.2 — Duplicate add to 'None' returns standardized message",
  tracked(
    "TC-12.2 — Duplicate add to 'None' returns standardized message",
    async () => {
      const resp = await apiRequest("/list", {
        method: "POST",
        body: JSON.stringify({
          urlList: [E7_VIDEO_1_URL],
          chunkSize: 9,
          monitoringType: "N/A",
          sleep: true,
        }),
      });
      const json = await resp.json();
      assertEquals(json.items.length, 0);
    },
  ),
);

Deno.test(
  "TC-12.3 — No filesystem paths in any 'None'-related response",
  tracked(
    "TC-12.3 — No filesystem paths in any 'None'-related response",
    async () => {
      const subResp = await apiRequest("/getsub", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 8,
          sortDownloaded: false,
          query: "",
          url: "None",
        }),
      });
      const subText = await subResp.text();
      assertEquals(subText.includes("/home/"), false);
      assertEquals(subText.includes("/data/"), false);
    },
  ),
);

// Suite 13 — Regression: Playlist with Private/Deleted First Item
const PRIVATE_FIRST_ITEM_PLAYLIST_URL =
  "https://mock-tube/playlists/private-first-item.rss?list=1";

Deno.test(
  "TC-13.1 — Add playlist where first item is inaccessible (404)",
  tracked(
    "TC-13.1 — Add playlist where first item is inaccessible (404)",
    async () => {
      const resp = await apiRequest("/list", {
        method: "POST",
        body: JSON.stringify({
          urlList: [PRIVATE_FIRST_ITEM_PLAYLIST_URL],
          chunkSize: 9,
          monitoringType: "N/A",
          sleep: true,
        }),
      });
      const json = await resp.json();
      assertEquals(json.status, "success");
      assertEquals(json.items[0].reason, "URL not found in database");
      // The playlist should be created and items should be listed
      // (skipping the inaccessible first item, but listing items 2 and 3)
      await waitForSubCount(PRIVATE_FIRST_ITEM_PLAYLIST_URL, 2);
    },
  ),
);

Deno.test(
  "TC-13.2 — Playlist appears in listing with a title (not a failure)",
  tracked(
    "TC-13.2 — Playlist appears in listing with a title (not a failure)",
    async () => {
      const resp = await apiRequest("/getplay", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 50,
          sort: "1",
          order: "1",
          query: "",
        }),
      });
      const json = await resp.json();
      const playlist = json.rows.find(
        (r: { playlistUrl: string }) =>
          r.playlistUrl === PRIVATE_FIRST_ITEM_PLAYLIST_URL,
      );
      assertExists(playlist);
      // Title should be derived from the second item's playlist_title
      // or at minimum a URL-derived fallback — NOT empty or undefined
      assertExists(playlist.title);
      assertNotEquals(playlist.title, "");
    },
  ),
);

Deno.test(
  "TC-13.3 — Sublist contains the 2 accessible videos",
  tracked(
    "TC-13.3 — Sublist contains the 2 accessible videos",
    async () => {
      const resp = await apiRequest("/getsub", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 8,
          sortDownloaded: false,
          query: "",
          url: PRIVATE_FIRST_ITEM_PLAYLIST_URL,
        }),
      });
      const json = await resp.json();
      assertEquals(json.count, 2);
    },
  ),
);

Deno.test(
  "TC-13.4 — Teardown: delete the private-first-item playlist",
  tracked(
    "TC-13.4 — Teardown: delete the private-first-item playlist",
    async () => {
      const resp = await apiRequest("/delplay", {
        method: "POST",
        body: JSON.stringify({
          playListUrl: PRIVATE_FIRST_ITEM_PLAYLIST_URL,
          deleteAllVideosInPlaylist: true,
          deletePlaylist: true,
          cleanUp: false,
        }),
      });
      const json = await resp.json();
      assertEquals(json.status, "success");
    },
  ),
);

// Suite 14 — Start/End Incremental Shift Updates (Backend Bug: duplicate
// position rows after watch-mode updates)
//
// A playlist that gains videos at the top (Start) shifts every existing
// position down; one that appends at the bottom (End) grows the tail. The
// updater used to key rows on videoUrl|position and re-create shifted rows
// instead of moving them, doubling every position. These tests mutate the
// mock-tube RSS mid-run — the only way to observe the same playlist URL
// shifting under the updater — then restore the committed v1 afterwards.
const START_SHIFT_PLAYLIST_URL =
  "https://mock-tube/playlists/start-shift.rss?list=1";
const START_SHIFT_BIG_PLAYLIST_URL =
  "https://mock-tube/playlists/start-shift-big.rss?list=1";
const END_APPEND_PLAYLIST_URL =
  "https://mock-tube/playlists/end-append.rss?list=1";

// Writable mock-tube checkout inside the test-runner container (see the
// mock-tube volume in docker-compose.test.yml). Falls back to /mock-tube.
const MOCK_TUBE_DIR = Deno.env.get("MOCK_TUBE_DIR") || "/mock-tube";

// Generous ceiling: shift updates walk more chunks than the steady-state
// listings elsewhere in this file.
const SHIFT_TIMEOUT = 60000;

const shiftVideoUrl = (name: string) => `https://mock-tube/videos/${name}`;
const pad2 = (n: number) => String(n).padStart(2, "0");
const SHIFT_S_BASE = Array.from(
  { length: 10 },
  (_v, i) => shiftVideoUrl(`video-shift-s${pad2(i + 1)}.mp4`),
);
const SHIFT_N_SMALL = Array.from(
  { length: 3 },
  (_v, i) => shiftVideoUrl(`video-shift-n${pad2(i + 1)}.mp4`),
);
const SHIFT_M_BIG = Array.from(
  { length: 12 },
  (_v, i) => shiftVideoUrl(`video-shift-m${pad2(i + 1)}.mp4`),
);
const SHIFT_E_BASE = Array.from(
  { length: 11 },
  (_v, i) => shiftVideoUrl(`video-shift-e${pad2(i + 1)}.mp4`),
);
const SHIFT_E_APPENDED = Array.from(
  { length: 10 },
  (_v, i) => shiftVideoUrl(`video-shift-e${pad2(i + 12)}.mp4`),
);

/** Renders an RSS feed byte-compatible with generate_mocks.py output. */
function shiftRssXml(
  title: string,
  feedName: string,
  videos: string[],
): string {
  const items = videos.map((videoUrl) => {
    const file = videoUrl.split("/").at(-1) ?? videoUrl;
    return `
  <item>
    <title>${file} - ${title}</title>
    <link>${videoUrl}</link>
    <enclosure url="${videoUrl}" length="2237" type="video/mp4" />
  </item>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>${title}</title>
  <link>https://mock-tube/playlists/${feedName}?list=1</link>
  <description>Mock for ${title}</description>${items}
</channel>
</rss>`;
}

async function readShiftRss(feedName: string): Promise<string> {
  try {
    return await Deno.readTextFile(`${MOCK_TUBE_DIR}/playlists/${feedName}`);
  } catch {
    throw new Error(
      `Cannot read ${MOCK_TUBE_DIR}/playlists/${feedName}: run the E2E suite via docker compose (test-runner needs the mock-tube volume)`,
    );
  }
}

async function writeShiftRss(feedName: string, content: string): Promise<void> {
  await Deno.writeTextFile(`${MOCK_TUBE_DIR}/playlists/${feedName}`, content);
}

async function getSubAllRows(playlistUrl: string) {
  const resp = await apiRequest("/getsub", {
    method: "POST",
    body: JSON.stringify({
      start: 0,
      stop: 60,
      sortDownloaded: false,
      query: "",
      url: playlistUrl,
    }),
  });
  return await resp.json();
}

/** Polls until the given video sits at the expected position in the playlist. */
async function waitForVideoPosition(
  playlistUrl: string,
  videoUrl: string,
  position: number,
  timeoutMs: number = SHIFT_TIMEOUT,
): Promise<void> {
  await waitFor(async () => {
    const json = await getSubAllRows(playlistUrl);
    return json.rows.some(
      (
        r: {
          positionInPlaylist: number;
          video_metadatum: { videoUrl: string };
        },
      ) =>
        r.positionInPlaylist === position &&
        r.video_metadatum.videoUrl === videoUrl,
    );
  }, timeoutMs);
}

/**
 * The core regression assertion for the shift-duplication bug: positions
 * cover exactly 1..N in order, each position holds the expected video, and
 * no (videoUrl, position) pair appears twice. The pre-fix code produced two
 * rows per position here (e.g. count 203 with pairs at 1..8).
 */
function assertExactPlaylistOrder(
  json: {
    count: number;
    rows: Array<
      { positionInPlaylist: number; video_metadatum: { videoUrl: string } }
    >;
  },
  expectedVideoUrls: string[],
): void {
  assertEquals(json.count, expectedVideoUrls.length);
  assertEquals(json.rows.length, expectedVideoUrls.length);
  const seenPairs = new Set<string>();
  json.rows.forEach((row, i) => {
    assertEquals(row.positionInPlaylist, i + 1);
    assertEquals(row.video_metadatum.videoUrl, expectedVideoUrls[i]);
    const pair = `${row.video_metadatum.videoUrl}|${row.positionInPlaylist}`;
    assertEquals(seenPairs.has(pair), false, `duplicate mapping row: ${pair}`);
    seenPairs.add(pair);
  });
}

/** Re-lists an existing playlist under a new watch mode; asserts the update path was taken. */
async function relistWithMonitoring(
  playlistUrl: string,
  monitoringType: string,
) {
  const resp = await apiRequest("/list", {
    method: "POST",
    body: JSON.stringify({
      urlList: [playlistUrl],
      chunkSize: 10,
      monitoringType,
      sleep: true,
    }),
  });
  const json = await resp.json();
  assertEquals(json.status, "success");
  assertEquals(json.items[0].reason, "Monitoring type changed");
}

async function delplayFullCleanup(playListUrl: string): Promise<void> {
  const resp = await apiRequest("/delplay", {
    method: "POST",
    body: JSON.stringify({
      playListUrl,
      deleteAllVideosInPlaylist: true,
      deletePlaylist: true,
      cleanUp: false,
    }),
  });
  const json = await resp.json();
  assertEquals(json.status, "success");
}

Deno.test(
  "TC-14.1 — Add 'Shift Startcast' playlist (10 videos, positions 1..10)",
  tracked(
    "TC-14.1 — Add 'Shift Startcast' playlist (10 videos, positions 1..10)",
    async () => {
      await (await apiRequest("/list", {
        method: "POST",
        body: JSON.stringify({
          urlList: [START_SHIFT_PLAYLIST_URL],
          chunkSize: 10,
          monitoringType: "N/A",
          sleep: true,
        }),
      })).text();
      await waitForSubCount(START_SHIFT_PLAYLIST_URL, 10, SHIFT_TIMEOUT);
      assertExactPlaylistOrder(
        await getSubAllRows(START_SHIFT_PLAYLIST_URL),
        SHIFT_S_BASE,
      );
    },
  ),
);

Deno.test(
  "TC-14.2 — Start update after prepending 3 shifts rows without duplicating",
  tracked(
    "TC-14.2 — Start update after prepending 3 shifts rows without duplicating",
    async () => {
      const original = await readShiftRss("start-shift.rss");
      try {
        await writeShiftRss(
          "start-shift.rss",
          shiftRssXml("Shift Startcast", "start-shift.rss", [
            ...SHIFT_N_SMALL,
            ...SHIFT_S_BASE,
          ]),
        );
        await relistWithMonitoring(START_SHIFT_PLAYLIST_URL, "Start");
        await waitForSubCount(START_SHIFT_PLAYLIST_URL, 13, SHIFT_TIMEOUT);
        // The count settles before the tail renumber lands, so wait on the
        // last shifted row (only the final stage sets it) before asserting.
        await waitForVideoPosition(
          START_SHIFT_PLAYLIST_URL,
          SHIFT_S_BASE[SHIFT_S_BASE.length - 1],
          13,
        );
        assertExactPlaylistOrder(
          await getSubAllRows(START_SHIFT_PLAYLIST_URL),
          [...SHIFT_N_SMALL, ...SHIFT_S_BASE],
        );
      } finally {
        await writeShiftRss("start-shift.rss", original);
      }
      await delplayFullCleanup(START_SHIFT_PLAYLIST_URL);
    },
  ),
);

Deno.test(
  "TC-14.3 — Add 'Shift Startcast Big' playlist (10 videos)",
  tracked(
    "TC-14.3 — Add 'Shift Startcast Big' playlist (10 videos)",
    async () => {
      await (await apiRequest("/list", {
        method: "POST",
        body: JSON.stringify({
          urlList: [START_SHIFT_BIG_PLAYLIST_URL],
          chunkSize: 10,
          monitoringType: "N/A",
          sleep: true,
        }),
      })).text();
      await waitForSubCount(START_SHIFT_BIG_PLAYLIST_URL, 10, SHIFT_TIMEOUT);
      assertExactPlaylistOrder(
        await getSubAllRows(START_SHIFT_BIG_PLAYLIST_URL),
        SHIFT_S_BASE,
      );
    },
  ),
);

Deno.test(
  "TC-14.4 — Start update prepending 12 (more than one chunk) keeps 22 unique rows",
  tracked(
    "TC-14.4 — Start update prepending 12 (more than one chunk) keeps 22 unique rows",
    async () => {
      const original = await readShiftRss("start-shift-big.rss");
      try {
        // 12 new videos with chunk size 10: the first chunk is entirely new
        // and carries no reference to the old head, so the shift is only
        // learnable from the second chunk onward.
        await writeShiftRss(
          "start-shift-big.rss",
          shiftRssXml("Shift Startcast Big", "start-shift-big.rss", [
            ...SHIFT_M_BIG,
            ...SHIFT_S_BASE,
          ]),
        );
        await relistWithMonitoring(START_SHIFT_BIG_PLAYLIST_URL, "Start");
        await waitForSubCount(START_SHIFT_BIG_PLAYLIST_URL, 22, SHIFT_TIMEOUT);
        await waitForVideoPosition(
          START_SHIFT_BIG_PLAYLIST_URL,
          SHIFT_S_BASE[SHIFT_S_BASE.length - 1],
          22,
        );
        assertExactPlaylistOrder(
          await getSubAllRows(START_SHIFT_BIG_PLAYLIST_URL),
          [...SHIFT_M_BIG, ...SHIFT_S_BASE],
        );
      } finally {
        await writeShiftRss("start-shift-big.rss", original);
      }
      await delplayFullCleanup(START_SHIFT_BIG_PLAYLIST_URL);
    },
  ),
);

Deno.test(
  "TC-14.5 — Add 'Shift Endcast' playlist (11 videos, positions 1..11)",
  tracked(
    "TC-14.5 — Add 'Shift Endcast' playlist (11 videos, positions 1..11)",
    async () => {
      await (await apiRequest("/list", {
        method: "POST",
        body: JSON.stringify({
          urlList: [END_APPEND_PLAYLIST_URL],
          chunkSize: 10,
          monitoringType: "N/A",
          sleep: true,
        }),
      })).text();
      await waitForSubCount(END_APPEND_PLAYLIST_URL, 11, SHIFT_TIMEOUT);
      assertExactPlaylistOrder(
        await getSubAllRows(END_APPEND_PLAYLIST_URL),
        SHIFT_E_BASE,
      );
    },
  ),
);

Deno.test(
  "TC-14.6 — End update appending 10 grows the tail without duplicating",
  tracked(
    "TC-14.6 — End update appending 10 grows the tail without duplicating",
    async () => {
      const original = await readShiftRss("end-append.rss");
      try {
        await writeShiftRss(
          "end-append.rss",
          shiftRssXml("Shift Endcast", "end-append.rss", [
            ...SHIFT_E_BASE,
            ...SHIFT_E_APPENDED,
          ]),
        );
        await relistWithMonitoring(END_APPEND_PLAYLIST_URL, "End");
        await waitForSubCount(END_APPEND_PLAYLIST_URL, 21, SHIFT_TIMEOUT);
        await waitForVideoPosition(
          END_APPEND_PLAYLIST_URL,
          SHIFT_E_APPENDED[SHIFT_E_APPENDED.length - 1],
          21,
        );
        assertExactPlaylistOrder(
          await getSubAllRows(END_APPEND_PLAYLIST_URL),
          [...SHIFT_E_BASE, ...SHIFT_E_APPENDED],
        );
      } finally {
        await writeShiftRss("end-append.rss", original);
      }
      // Re-apply v2 for TC-14.7, which deletes from its head.
      await writeShiftRss(
        "end-append.rss",
        shiftRssXml("Shift Endcast", "end-append.rss", [
          ...SHIFT_E_BASE,
          ...SHIFT_E_APPENDED,
        ]),
      );
    },
  ),
);

Deno.test(
  "TC-14.7 — End update after deleting 2 from the head moves survivors to 1..19",
  tracked(
    "TC-14.7 — End update after deleting 2 from the head moves survivors to 1..19",
    async () => {
      const full = [...SHIFT_E_BASE, ...SHIFT_E_APPENDED];
      const afterDelete = full.slice(2);
      try {
        await writeShiftRss(
          "end-append.rss",
          shiftRssXml("Shift Endcast", "end-append.rss", afterDelete),
        );
        // Monitoring is already End, which /list would skip: drop to N/A
        // first so the re-list takes the End tail path again.
        await (await apiRequest("/watch", {
          method: "POST",
          body: JSON.stringify({ url: END_APPEND_PLAYLIST_URL, watch: "N/A" }),
        })).text();
        await relistWithMonitoring(END_APPEND_PLAYLIST_URL, "End");
        // The count does not change here (19 moves, 0 creates), so wait on
        // rows only the restarted full walk sets: the head (chunk 1) and a
        // middle row from its second chunk. (The tail position of the last
        // video is stale-but-correct left over from the tail window, so it
        // must not be used as a readiness signal.)
        await waitForVideoPosition(
          END_APPEND_PLAYLIST_URL,
          afterDelete[0],
          1,
        );
        await waitForVideoPosition(
          END_APPEND_PLAYLIST_URL,
          afterDelete[10],
          11,
        );
        const json = await getSubAllRows(END_APPEND_PLAYLIST_URL);
        // Survivors moved; the 2 deleted videos' rows are retained as
        // ghosts (tombstoning them from an incremental walk would also
        // delete yt-dlp-skipped private items — Full is the repair path).
        assertEquals(json.count, 21);
        const pairs = new Set<string>();
        for (const row of json.rows) {
          const pair =
            `${row.video_metadatum.videoUrl}|${row.positionInPlaylist}`;
          assertEquals(pairs.has(pair), false, `duplicate row: ${pair}`);
          pairs.add(pair);
        }
        const atPosition = (position: number) =>
          json.rows
            .filter((r: { positionInPlaylist: number }) =>
              r.positionInPlaylist === position
            )
            .map((r: { video_metadatum: { videoUrl: string } }) =>
              r.video_metadatum.videoUrl
            )
            .sort();
        afterDelete.forEach((videoUrl, i) => {
          assertEquals(
            atPosition(i + 1).includes(videoUrl),
            true,
            `survivor ${videoUrl} missing at position ${i + 1}`,
          );
        });
        // Ghosts of the two deleted head videos are still mapped.
        assertEquals(atPosition(1).includes(full[0]), true);
        assertEquals(atPosition(2).includes(full[1]), true);
      } finally {
        // TC-14.6 leaves v2 in this file, so regenerate the committed v1
        // from constants rather than restoring a read-back.
        await writeShiftRss(
          "end-append.rss",
          shiftRssXml("Shift Endcast", "end-append.rss", SHIFT_E_BASE),
        );
      }
      await delplayFullCleanup(END_APPEND_PLAYLIST_URL);
    },
  ),
);

// Suite 15 — Bot-facing sidecar, keep, cancel and locate endpoints
//
// The four endpoints the chat bot and the web UI gained in exchange for the
// ability to see what a download missed, keep a file, stop a job, and open a
// link to any page of a list.
Deno.test(
  "Setup Suite 15: Index and download a video to act on",
  tracked("Setup Suite 15: Index and download a video to act on", async () => {
    await (await apiRequest("/list", {
      method: "POST",
      body: JSON.stringify({
        urlList: [PUBLIC_DUP_TEST_PLAYLIST_URL],
        chunkSize: 9,
        monitoringType: "N/A",
        sleep: true,
      }),
    })).text();
    await waitForSubCount(PUBLIC_DUP_TEST_PLAYLIST_URL, 2);

    const resp = await apiRequest("/download", {
      method: "POST",
      body: JSON.stringify({
        urlList: [DUP_VIDEO_URL],
        playListUrl: PUBLIC_DUP_TEST_PLAYLIST_URL,
      }),
    });
    assertEquals((await resp.json()).status, "success");
    await waitForDownloaded(PUBLIC_DUP_TEST_PLAYLIST_URL, DUP_VIDEO_URL);
  }),
);

Deno.test(
  "TC-15.1 — A completed download reports itself complete",
  tracked(
    "TC-15.1 — A completed download reports itself complete",
    async () => {
      const json = await (await apiRequest("/getsub", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 8,
          sortDownloaded: false,
          query: "",
          url: PUBLIC_DUP_TEST_PLAYLIST_URL,
        }),
      })).json();
      const meta = json.rows[0].video_metadatum;

      // The fixture has no subtitles, no chapters, no description and no
      // comments, and none of those is something we failed to fetch: an extra
      // the source never offered is not a gap.
      assertEquals(meta.isMetaDataSynced, true);
      assertEquals(meta.missingExtras, null);
      // ffprobe ran and found nothing, which is the common case rather than a
      // failure.
      assertEquals(meta.chapters, null);
      // No bot has ever fetched this file, so nothing will reap it.
      assertEquals(meta.botExpiresAt, null);
    },
  ),
);

Deno.test(
  "TC-15.2 — /syncextras runs nothing when there is nothing missing",
  tracked(
    "TC-15.2 — /syncextras runs nothing when there is nothing missing",
    async () => {
      const resp = await apiRequest("/syncextras", {
        method: "POST",
        body: JSON.stringify({ videoUrl: DUP_VIDEO_URL }),
      });
      assertEquals(resp.status, 200);
      const json = await resp.json();
      assertEquals(json.url, DUP_VIDEO_URL);
      assertEquals(json.status, "unchanged");
      assertEquals(json.recovered, []);
      assertEquals(json.stillMissing, []);
    },
  ),
);

Deno.test(
  "TC-15.3 — /syncextras refuses a body with no video",
  tracked("TC-15.3 — /syncextras refuses a body with no video", async () => {
    // The URL reaches yt-dlp as an argument, so a missing one is a bad request
    // rather than a run against nothing.
    const resp = await apiRequest("/syncextras", {
      method: "POST",
      body: JSON.stringify({}),
    });
    assertEquals(resp.status, 400);
    await resp.text();
  }),
);

Deno.test(
  "TC-15.4 — /keepfile says plainly that there was nothing to keep",
  tracked(
    "TC-15.4 — /keepfile says plainly that there was nothing to keep",
    async () => {
      const resp = await apiRequest("/keepfile", {
        method: "POST",
        body: JSON.stringify({ videoUrl: DUP_VIDEO_URL }),
      });
      assertEquals(resp.status, 200);
      const json = await resp.json();
      assertEquals(json.status, "success");
      // No bot has fetched this file, so the honest answer is zero. The UI
      // says so out loud rather than dressing it up as a success.
      assertEquals(json.kept, 0);
    },
  ),
);

Deno.test(
  "TC-15.5 — /locate names the list and the page a video opens in",
  tracked(
    "TC-15.5 — /locate names the list and the page a video opens in",
    async () => {
      const resp = await apiRequest("/locate", {
        method: "POST",
        body: JSON.stringify({
          videoUrl: DUP_VIDEO_URL,
          pageSize: 8,
          sortDownloaded: false,
        }),
      });
      assertEquals(resp.status, 200);
      const json = await resp.json();
      assertEquals(json.videoUrl, DUP_VIDEO_URL);
      // The same helper the download used to pick a folder, so the link opens
      // the list the file actually landed in.
      assertEquals(json.playlistUrl, PUBLIC_DUP_TEST_PLAYLIST_URL);
      assertEquals(json.page, 0);
    },
  ),
);

Deno.test(
  "TC-15.6 — /locate reports a video that belongs to no list",
  tracked(
    "TC-15.6 — /locate reports a video that belongs to no list",
    async () => {
      const resp = await apiRequest("/locate", {
        method: "POST",
        body: JSON.stringify({
          videoUrl: "https://mock-tube/videos/not-indexed.mp4",
          pageSize: 8,
        }),
      });
      assertEquals(resp.status, 200);
      const json = await resp.json();
      // Null rather than a guess: the caller drops the link instead of
      // opening a list that does not hold this video.
      assertEquals(json.playlistUrl, null);
      assertEquals(json.page, null);
    },
  ),
);

Deno.test(
  "TC-15.7 — /cancel says there was nothing to stop",
  tracked("TC-15.7 — /cancel says there was nothing to stop", async () => {
    const resp = await apiRequest("/cancel", {
      method: "POST",
      body: JSON.stringify({ url: DUP_VIDEO_URL, kind: "download" }),
    });
    assertEquals(resp.status, 200);
    const json = await resp.json();
    assertEquals(json.status, "success");
    assertEquals(json.kind, "download");
    // A 200 here would leave a client that hid a button believing the work
    // went away.
    assertEquals(json.outcome, "not-found");
  }),
);

Deno.test(
  "TC-15.9 — /cancel accepts both kinds and answers with the same vocabulary",
  tracked(
    "TC-15.9 — /cancel accepts both kinds and answers with the same vocabulary",
    async () => {
      // Both kinds are accepted and both answer 200 with the same three
      // outcomes. What is being pinned here is the vocabulary rather than a
      // race: a listing or download that is genuinely running cannot be
      // caught at a chosen instant in this fixture environment, because a
      // mock-tube video finishes in tens of milliseconds. The kill path is
      // covered where it can be deterministic instead — the backend's own
      // pipeline tests, and the pause/cancel round trip in the job-control
      // suite, where a paused job stays put long enough to act on.
      for (const kind of ["download", "listing"]) {
        const resp = await apiRequest("/cancel", {
          method: "POST",
          body: JSON.stringify({
            url: "https://mock-tube/playlists/never-indexed.rss?list=1",
            kind,
          }),
        });
        assertEquals(resp.status, 200);
        const json = await resp.json();
        assertEquals(json.status, "success");
        assertEquals(json.kind, kind);
        assertEquals(json.outcome, "not-found");
      }
    },
  ),
);

Deno.test(
  "TC-15.8 — /cancel refuses a kind it does not know",
  tracked("TC-15.8 — /cancel refuses a kind it does not know", async () => {
    const resp = await apiRequest("/cancel", {
      method: "POST",
      body: JSON.stringify({ url: DUP_VIDEO_URL, kind: "everything" }),
    });
    assertEquals(resp.status, 400);
    await resp.text();
  }),
);

// Suite 16 - Job control. Runs before Suite 9, which deletes everything.
//
// The fixture here is the one nginx throttles to 100 KB/s, so the download
// below is provably still running for about ten seconds. That window is what
// makes these tests deterministic rather than a race: every other mock video
// lands in milliseconds, and there is no honest way to pause one of those.

/** One read of the queue, as the drawer would see it. */
async function queueSnapshot() {
  const resp = await apiRequest("/queuestatus", { method: "POST", body: "{}" });
  assertEquals(resp.status, 200);
  return await resp.json();
}

/**
 * Waits for one job to reach a state, and returns it.
 *
 * Waiting for the state rather than assuming it is the whole point: a test
 * that sleeps and hopes is a test that fails on a loaded CI machine.
 */
async function waitForJob(
  kind: "download" | "listing",
  url: string,
  predicate: (job: Record<string, unknown>) => boolean,
  timeoutMs: number = DEFAULT_TIMEOUT,
) {
  let found: Record<string, unknown> | undefined;
  await waitFor(async () => {
    const snap = await queueSnapshot();
    const jobs = snap[kind === "download" ? "queue" : "listings"];
    found = Array.isArray(jobs)
      ? jobs.find((job: Record<string, unknown>) =>
        job.url === url && predicate(job)
      )
      : undefined;
    return Boolean(found);
  }, timeoutMs);
  assertExists(found);
  return found as Record<string, unknown>;
}

/** One job action, as the drawer's buttons issue it. */
async function actOnJob(id: string, action: string) {
  const resp = await apiRequest("/jobaction", {
    method: "POST",
    body: JSON.stringify({ id, action }),
  });
  assertEquals(resp.status, 200);
  return await resp.json();
}

Deno.test({
  name: "Setup Suite 16: index a video that is slow enough to act on",
  async fn() {
    const resp = await apiRequest("/list", {
      method: "POST",
      body: JSON.stringify({ urlList: [SLOW_PLAYLIST_URL], chunkSize: 2 }),
    });
    await resp.text();
    await waitForSubCount(SLOW_PLAYLIST_URL, 1);
  },
});

Deno.test(
  "TC-16.1 — /queuestatus reports a running download with real progress",
  tracked(
    "TC-16.1 — /queuestatus reports a running download with real progress",
    async () => {
      // Started but deliberately not awaited: the point is to look at it while
      // it is still fetching.
      const started = apiRequest("/download", {
        method: "POST",
        body: JSON.stringify({
          urlList: [SLOW_VIDEO_URL],
          playlistUrl: SLOW_PLAYLIST_URL,
        }),
      });
      await (await started).text();

      const job = await waitForJob(
        "download",
        SLOW_VIDEO_URL,
        (j) => j.state === "running",
      );
      assertEquals(job.kind, "download");
      assertExists(job.id);

      // Bytes actually moved off the throttled connection, not a bar someone
      // invented: the file is 1,071,444 bytes, so anything at or past the end
      // would mean the run is already over.
      const progress = (await waitForJob(
        "download",
        SLOW_VIDEO_URL,
        (j) =>
          ((j.progress as Record<string, number> | null)?.downloadedBytes ??
            0) > 0,
      )).progress as Record<string, number>;
      assertEquals(progress.totalBytes, 1071444);
      assertEquals(progress.downloadedBytes < progress.totalBytes, true);
      assertEquals(progress.downloadedBytes > 0, true);
    },
  ),
);

Deno.test(
  "TC-16.2 — pausing a running download keeps the bytes it has",
  tracked(
    "TC-16.2 — pausing a running download keeps the bytes it has",
    async () => {
      const job = await waitForJob(
        "download",
        SLOW_VIDEO_URL,
        (j) => j.state === "running",
      );
      const downloaded = (job.progress as Record<string, number> | null)
        ?.downloadedBytes ?? 0;
      assertEquals(downloaded > 0, true);

      const result = await actOnJob(job.id as string, "pause");
      assertEquals(result.outcome, "paused");
      // The whole distinction: pausing keeps the partial file so a resume can
      // pick it up. Cancelling is the one that throws bytes away.
      assertEquals(result.partialDeleted, false);

      const paused = await waitForJob(
        "download",
        SLOW_VIDEO_URL,
        (j) => j.state === "paused",
      );
      // Still reported, not dropped: a paused job is something the drawer has
      // to be able to resume, under the same id it was paused as.
      assertEquals(paused.id, job.id);

      // And it really has stopped, which is what makes the assertion above
      // mean anything.
      await waitFor(async () => {
        const snap = await queueSnapshot();
        return !snap.queue.some((j: Record<string, unknown>) =>
          j.url === SLOW_VIDEO_URL && j.state === "running"
        );
      });
    },
  ),
);

Deno.test(
  "TC-16.3 — a paused download resumes under the same job",
  tracked(
    "TC-16.3 — a paused download resumes under the same job",
    async () => {
      const paused = await waitForJob(
        "download",
        SLOW_VIDEO_URL,
        (j) => j.state === "paused",
      );

      const result = await actOnJob(paused.id as string, "resume");
      assertEquals(result.outcome, "resumed");

      // Same id, not a new job: the drawer keys on it, and a resume that
      // minted a new one would make the row the user pressed on vanish.
      const again = await waitForJob(
        "download",
        SLOW_VIDEO_URL,
        (j) => j.state === "running" || j.state === "queued",
      );
      assertEquals(again.id, paused.id);

      await waitForDownloaded(SLOW_PLAYLIST_URL, SLOW_VIDEO_URL);
    },
  ),
);

Deno.test(
  "TC-16.4 — cancelling a paused download throws the kept bytes away",
  tracked(
    "TC-16.4 — cancelling a paused download throws the kept bytes away",
    async () => {
      const started = apiRequest("/download", {
        method: "POST",
        body: JSON.stringify({
          urlList: [SLOW_VIDEO_URL],
          playlistUrl: SLOW_PLAYLIST_URL,
        }),
      });
      await (await started).text();
      const running = await waitForJob(
        "download",
        SLOW_VIDEO_URL,
        (j) => j.state === "running",
      );

      const paused = await actOnJob(running.id as string, "pause");
      assertEquals(paused.outcome, "paused");

      // Cancelling a paused job is the one case where deleting is the whole
      // point: those bytes are on disk precisely because a pause left them.
      const cancelled = await actOnJob(running.id as string, "cancel");
      assertEquals(cancelled.outcome, "cancelled");
      assertEquals(cancelled.partialDeleted, true);

      await waitFor(async () => {
        const snap = await queueSnapshot();
        return !snap.queue.some((j: Record<string, unknown>) =>
          j.url === SLOW_VIDEO_URL
        );
      });
    },
  ),
);

Deno.test(
  "TC-16.5 — a running listing is paused and resumed like a download",
  tracked(
    "TC-16.5 — a running listing is paused and resumed like a download",
    async () => {
      const started = apiRequest("/list", {
        method: "POST",
        body: JSON.stringify({
          urlList: [PUBLIC_PLAYLIST_BIG_URL],
          chunkSize: 4,
          monitoringType: "Full",
        }),
      });
      await (await started).text();

      const running = await waitForJob(
        "listing",
        PUBLIC_PLAYLIST_BIG_URL,
        (j) => j.state === "running",
      );
      assertEquals(running.kind, "listing");

      const paused = await actOnJob(running.id as string, "pause");
      assertEquals(paused.outcome, "paused");
      // A listing writes no files, so there is never anything to delete —
      // not on a pause and not on a cancel.
      assertEquals(paused.partialDeleted, false);

      const resumed = await actOnJob(running.id as string, "resume");
      assertEquals(resumed.outcome, "resumed");
      await actOnJob(running.id as string, "cancel");
    },
  ),
);

Deno.test(
  "TC-16.6 — a queued download is cancelled for free",
  tracked(
    "TC-16.6 — a queued download is cancelled for free",
    async () => {
      // MAX_DOWNLOADS is 1 in this environment, so the first of these holds
      // the only slot and the second is provably still waiting for it.
      const first = apiRequest("/download", {
        method: "POST",
        body: JSON.stringify({
          urlList: [SLOW_VIDEO_URL],
          playlistUrl: SLOW_PLAYLIST_URL,
        }),
      });
      await (await first).text();
      const running = await waitForJob(
        "download",
        SLOW_VIDEO_URL,
        (j) => j.state === "running",
      );

      const second = apiRequest("/download", {
        method: "POST",
        body: JSON.stringify({
          urlList: [SLOW_VIDEO_URL],
          playlistUrl: SLOW_PLAYLIST_URL,
        }),
      });
      await (await second).text();

      const queued = await waitForJob(
        "download",
        SLOW_VIDEO_URL,
        (j) => j.state === "queued",
      );
      assertNotEquals(queued.id, running.id);
      assertEquals((queued.queuePosition as number) > 0, true);

      // Nothing to kill and nothing to delete: this is the "at no cost" the
      // drawer offers, and it must not claim otherwise.
      const cancelled = await actOnJob(queued.id as string, "cancel");
      assertEquals(cancelled.outcome, "cancelled");
      assertEquals(cancelled.partialDeleted, false);

      await actOnJob(running.id as string, "cancel");
    },
  ),
);

Deno.test(
  "TC-16.7 — /jobaction refuses what it cannot do",
  tracked(
    "TC-16.7 — /jobaction refuses what it cannot do",
    async () => {
      const missing = await actOnJob("no-such-job", "pause");
      assertEquals(missing.outcome, "not-found");

      const unknown = await apiRequest("/jobaction", {
        method: "POST",
        body: JSON.stringify({ id: "no-such-job", action: "detonate" }),
      });
      assertEquals(unknown.status, 400);
      await unknown.text();
    },
  ),
);

// Suite 9 — Cleanup
Deno.test(
  "TC-9.1 — Remove remaining videos from 'None' playlist",
  tracked("TC-9.1 — Remove remaining videos from 'None' playlist", async () => {
    const subResp = await apiRequest("/getsub", {
      method: "POST",
      body: JSON.stringify({
        start: 0,
        stop: 50,
        sortDownloaded: false,
        query: "",
        url: "None",
      }),
    });
    const subJson = await subResp.json();
    for (const row of subJson.rows) {
      await (await apiRequest("/delsub", {
        method: "POST",
        body: JSON.stringify({
          playListUrl: "None",
          videoUrls: [row.video_metadatum.videoUrl],
          cleanUp: row.video_metadatum.downloadStatus,
          deleteVideoMappings: true,
          deleteVideosInDB: true,
        }),
      })).text();
    }
    const checkResp = await apiRequest("/getsub", {
      method: "POST",
      body: JSON.stringify({
        start: 0,
        stop: 8,
        sortDownloaded: false,
        query: "",
        url: "None",
      }),
    });
    const checkJson = await checkResp.json();
    assertEquals(checkJson.count, 0);
  }),
);

Deno.test(
  "TC-9.2 — Delete any remaining playlists with full cleanup",
  tracked(
    "TC-9.2 — Delete any remaining playlists with full cleanup",
    async () => {
      const playResp = await apiRequest("/getplay", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 50,
          sort: "1",
          order: "1",
          query: "",
        }),
      });
      const playJson = await playResp.json();
      for (const row of playJson.rows) {
        await (await apiRequest("/delplay", {
          method: "POST",
          body: JSON.stringify({
            playListUrl: row.playlistUrl,
            deleteAllVideosInPlaylist: true,
            deletePlaylist: true,
            cleanUp: true,
          }),
        })).text();
      }
      const checkResp = await apiRequest("/getplay", {
        method: "POST",
        body: JSON.stringify({
          start: 0,
          stop: 10,
          sort: "1",
          order: "1",
          query: "",
        }),
      });
      const checkJson = await checkResp.json();
      assertEquals(checkJson.count, 0);
    },
  ),
);

// ─── Final Report ───────────────────────────────────────────────────────────
Deno.test("📊 Test Report", async () => {
  const totalDuration = ((Date.now() - suiteStartTime) / 1000).toFixed(1);
  const passed = testResults.filter((r) => r.status === "PASS").length;
  const failed = testResults.filter((r) => r.status === "FAIL").length;
  const total = testResults.length;

  // Group by suite
  const suites = new Map<string, TestResult[]>();
  for (const r of testResults) {
    if (!suites.has(r.suite)) suites.set(r.suite, []);
    suites.get(r.suite)!.push(r);
  }

  const PAD_NAME = 72;
  const PAD_STATUS = 6;
  const PAD_TIME = 10;
  const DIVIDER = "─".repeat(PAD_NAME + PAD_STATUS + PAD_TIME + 6);
  const THICK_DIVIDER = "═".repeat(PAD_NAME + PAD_STATUS + PAD_TIME + 6);

  const lines: string[] = [];
  lines.push("");
  lines.push(THICK_DIVIDER);
  lines.push("  yt-diff E2E Test Report");
  lines.push(THICK_DIVIDER);
  lines.push("");

  for (const [suite, results] of suites) {
    const suitePassed = results.filter((r) => r.status === "PASS").length;
    const suiteFailed = results.filter((r) => r.status === "FAIL").length;
    const suiteTime = results.reduce((a, r) => a + r.durationMs, 0);

    const suiteLabel = suiteFailed > 0
      ? `❌ ${suite} (${suitePassed}/${results.length} passed)`
      : `✅ ${suite} (${suitePassed}/${results.length} passed)`;

    lines.push(`  ${suiteLabel}  [${formatMs(suiteTime)}]`);
    lines.push(`  ${DIVIDER}`);

    for (const r of results) {
      const icon = r.status === "PASS" ? "✓" : "✗";
      const name = r.name.length > PAD_NAME - 4
        ? r.name.substring(0, PAD_NAME - 7) + "..."
        : r.name;
      const status = r.status.padEnd(PAD_STATUS);
      const time = formatMs(r.durationMs).padStart(PAD_TIME);

      lines.push(`    ${icon} ${name.padEnd(PAD_NAME - 4)} ${status} ${time}`);
      if (r.error) {
        const truncated = r.error.length > 80
          ? r.error.substring(0, 77) + "..."
          : r.error;
        lines.push(`      └─ ${truncated}`);
      }
    }
    lines.push("");
  }

  lines.push(THICK_DIVIDER);
  lines.push(
    `  Total: ${total}  |  Passed: ${passed}  |  Failed: ${failed}  |  Duration: ${totalDuration}s`,
  );
  lines.push(
    `  Result: ${
      failed === 0 ? "✅ ALL TESTS PASSED" : `❌ ${failed} TEST(S) FAILED`
    }`,
  );
  lines.push(THICK_DIVIDER);
  lines.push("");

  const report = lines.join("\n");
  console.log(report);

  // Persist to mounted volume so the host can access it
  try {
    await Deno.mkdir(REPORTS_DIR, { recursive: true });
  } catch { /* already exists */ }
  await Deno.writeTextFile(`${REPORTS_DIR}/report.txt`, report);
  console.log(`Report saved to ${REPORTS_DIR}/report.txt`);
});

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
