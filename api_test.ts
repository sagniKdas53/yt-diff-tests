/**
 * API Test Suite for yt-diff
 *
 * This test suite performs chained API calls to verify the full functionality of the application.
 * It is intended to be run against an isolated test environment (e.g., using docker-compose.test.yml).
 */

import { assertEquals, assertExists, assertNotEquals } from "std/assert/mod.ts";

const BASE_URL = Deno.env.get("API_BASE_URL") || "http://localhost:8888/ytdiff";
const TEST_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw"; // Dup Test
const TEST_PLAYLIST_URL_2 =
  "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY"; // Dup Test 2
const UNLISTED_VIDEO_URL = "https://www.youtube.com/watch?v=AjiJugg-9UQ";
const testUser = {
  userName: `testuser_123`,
  password: "testpassword_123",
};

let token =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImJkYzMxODA2LTFjZTEtNDE2Mi05OGRlLTk2MjI3ODUyNzQzMiIsImxhc3RQYXNzd29yZENoYW5nZVRpbWUiOiIyMDI2LTA0LTE4VDA4OjAwOjMxLjc5MloiLCJpYXQiOjE3NzY1MDAwMzIsImV4cCI6MTc3OTE3ODQzMn0.XfNayYgg36yk5t1BCbjcaNnXcrBZ4E0ZhmQIIAP3F7A";
// Helper to wait
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (token !== "") {
    headers.set("Authorization", `Bearer ${token}`);
  }

  console.log("headers", headers);

  const response = await fetch(url, {
    ...options,
    headers,
    signal: AbortSignal.timeout(15000), // 15s timeout
  });

  if (!response.ok && response.status !== 401 && response.status !== 409) {
    const text = await response.clone().text();
    console.error(`Request failed: ${url} -> ${response.status} ${text}`);
  }

  return response;
}

Deno.test("Unauthorized Access - POST /getplay", async () => {
  const resp = await fetch(`${BASE_URL}/getplay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assertEquals(resp.status, 401);
  await resp.text(); // Consume body to avoid leaks
});

Deno.test("Health Check - GET /ping", async () => {
  const resp = await apiRequest("/ping", { method: "GET" });
  assertEquals(resp.status, 200);
  const text = await resp.text();
  assertEquals(text, "pong");
});

Deno.test("Registration Check - POST /isregallowed", async () => {
  const resp = await apiRequest("/isregallowed", {
    method: "POST",
    body: "{}",
  });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  assertEquals(json.registrationAllowed, true);
});

Deno.test("User Registration - POST /register", async () => {
  const resp = await apiRequest("/register", {
    method: "POST",
    body: JSON.stringify(testUser),
  });
  assertEquals(resp.status, 201);
  const json = await resp.json();
  assertEquals(json.status, "success");
});

Deno.test("User Registration - Duplicate User - POST /register", async () => {
  const resp = await apiRequest("/register", {
    method: "POST",
    body: JSON.stringify(testUser),
  });
  assertEquals(resp.status, 409); // API returns 409 Conflict for existing users
  await resp.text();
});

Deno.test("User Login - POST /login", async () => {
  const resp = await apiRequest("/login", {
    method: "POST",
    body: JSON.stringify(testUser),
  });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  assertEquals(json.status, "success");
  assertExists(json.token);
  token = json.token;
  console.log("token", token);
});

Deno.test("User Login - Invalid Credentials - POST /login", async () => {
  const resp = await apiRequest("/login", {
    method: "POST",
    body: JSON.stringify({
      userName: testUser.userName,
      password: "wrongpassword",
    }),
  });
  assertEquals(resp.status, 401);
  await resp.text();
});

Deno.test("Verify Initial Sublist in None Playlist - POST /getsub", async () => {
  console.log("Verifying videos in playlist...");
  const resp = await apiRequest("/getsub", {
    method: "POST",
    body: JSON.stringify({ url: "None" }),
  });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  // Should be empty
  assertEquals(json.rows.length, 0);
});

Deno.test("Initial Playlist State - POST /getplay", async () => {
  const resp = await apiRequest("/getplay", { method: "POST", body: "{}" });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  // Standard display excludes system playlists (like "None")
  assertExists(json.rows);
  assertEquals(json.count, 0);
});

Deno.test("Add Dup Test Playlist - POST /list", async () => {
  console.log("Adding playlist...");
  const resp = await apiRequest("/list", {
    method: "POST",
    body: JSON.stringify({
      urlList: [TEST_PLAYLIST_URL],
      chunkSize: 9,
      monitoringType: "N/A",
      sleep: true,
    }),
  });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  assertEquals(json.status, "success");

  // Wait for the background listing to complete (it's a small playlist)
  console.log("Waiting 30s for listing to complete...");
  await sleep(30000);
});

Deno.test("Verify Dup Test Playlist Added - POST /getplay", async () => {
  console.log("Verifying playlist added...");
  const resp = await apiRequest("/getplay", { method: "POST", body: "{}" });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  assertExists(json.rows, "Response should have rows");
  const testPlaylist = json.rows.find((p: Record<string, unknown>) =>
    p.playlistUrl === TEST_PLAYLIST_URL
  );
  assertExists(
    testPlaylist,
    `Playlist ${TEST_PLAYLIST_URL} should be present in results: ${
      JSON.stringify(json.rows)
    }`,
  );
  assertEquals(testPlaylist.title, "Dup Test");
});

Deno.test("Verify Videos in Dup Test Playlist - POST /getsub", async () => {
  console.log("Verifying videos in playlist...");
  const resp = await apiRequest("/getsub", {
    method: "POST",
    body: JSON.stringify({ url: TEST_PLAYLIST_URL }),
  });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  assertExists(json.rows, "Response should have rows");
  assertNotEquals(
    json.rows.length,
    0,
    "Should have at least one video in Dup Test",
  );
  const firstVideo = json.rows[0].video_metadatum;
  assertExists(firstVideo, "Video metadata should be present");

  // Test /getfile
  const rawFileName = firstVideo.fileName;
  const fileName = (typeof rawFileName === "string" && rawFileName.length > 0)
    ? rawFileName
    : "placeholder.mp4";
  const saveDirectory = firstVideo.saveDirectory || "Dup Test";

  console.log("Testing /getfile with:", {
    saveDirectory,
    fileName,
    rawFileName,
  });
  const getFileResp = await apiRequest("/getfile", {
    method: "POST",
    body: JSON.stringify({
      saveDirectory,
      fileName,
    }),
  });
  // The file doesn't exist on disk in the test env, so we expect a 400 with "File could not be found"
  // but we've successfully reached the handler and passed validation.
  if (getFileResp.status !== 200 && getFileResp.status !== 400) {
    const errorText = await getFileResp.clone().text();
    console.error(`GetFile failed (${getFileResp.status}): ${errorText}`);
  }
  // If it's 400, verify the error message is about finding the file
  if (getFileResp.status === 400) {
    const errorJson = await getFileResp.clone().json();
    assertEquals(errorJson.message, "File could not be found");
  } else {
    assertEquals(getFileResp.status, 200);
  }
  if (getFileResp.status === 200) {
    const getFileJson = await getFileResp.json();
    assertExists(getFileJson.url, "Should return a signed URL");

    // Test /refreshfile
    console.log("Testing /refreshfile...");
    const fileId = getFileJson.url.split("fileId=")[1]?.split("&")[0];
    if (fileId) {
      const refreshResp = await apiRequest("/refreshfile", {
        method: "POST",
        body: JSON.stringify({ fileId }),
      });
      assertEquals(refreshResp.status, 200);
      const refreshJson = await refreshResp.json();
      assertExists(refreshJson.url, "Should return a refreshed signed URL");
    }
  }

  // Test /getfiles
  console.log("Testing /getfiles...");
  const getFilesResp = await apiRequest("/getfiles", {
    method: "POST",
    body: JSON.stringify({
      files: [{
        saveDirectory: firstVideo.saveDirectory || "",
        fileName: firstVideo.fileName || "placeholder.mp4",
      }],
    }),
  });
  assertEquals(getFilesResp.status, 200);
  const getFilesJson = await getFilesResp.json();
  assertEquals(getFilesJson.status, "success");
  assertExists(getFilesJson.files, "Should return batch signed URLs");
  assertEquals(Object.keys(getFilesJson.files).length, 1);

  // Test /delsub (Delete specific video from playlist)
  console.log("Testing /delsub...");
  const delSubResp = await apiRequest("/delsub", {
    method: "POST",
    body: JSON.stringify({
      playListUrl: TEST_PLAYLIST_URL,
      videoUrls: [firstVideo.videoUrl],
      deleteVideoMappings: true,
    }),
  });
  assertEquals(delSubResp.status, 200);
  const delSubJson = await delSubResp.json();
  assertExists(delSubJson.deleted);
});

Deno.test("Download 1st Video in Dup Test Playlist - POST /download", async () => {
  // We need to use a video that is already indexed to pass the DB check
  // Dynamic lookup of the playlist URL to avoid normalization mismatches
  const getPlayResp = await apiRequest("/getplay", {
    method: "POST",
    body: JSON.stringify({}),
  });
  const getPlayJson = await getPlayResp.json();

  // Filter out the system "None" playlist to get the one we just added
  const userPlaylist = getPlayJson.rows.find((p: any) =>
    p.playlistUrl !== "None"
  );
  if (!userPlaylist) {
    throw new Error(
      `No user playlist found in /getplay results. Available: ${
        getPlayJson.rows.map((p: any) => p.playlistUrl).join(", ")
      }`,
    );
  }
  const actualPlaylistUrl = userPlaylist.playlistUrl;

  // Polling for videos to be indexed (Listing is async)
  let playJson;
  for (let i = 0; i < 20; i++) { // Max 60 seconds (20 * 3s)
    const playResp = await apiRequest("/getsub", {
      method: "POST",
      body: JSON.stringify({ url: actualPlaylistUrl }),
    });
    playJson = await playResp.json();
    if (playJson.rows && playJson.rows.length > 0) {
      break;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  if (!playJson.rows || playJson.rows.length === 0) {
    throw new Error(
      `No videos found in playlist for download test after polling.`,
    );
  }

  const body = {
    "urlList": [playJson.rows[0].video_metadatum.videoUrl],
    "playListUrl": actualPlaylistUrl,
  };
  const resp = await apiRequest("/download", {
    method: "POST",
    body: JSON.stringify(body),
  });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  assertEquals(json.status, "success");
});

Deno.test("Update Monitoring for Dup Test Playlist - POST /watch", async () => {
  const resp = await apiRequest("/watch", {
    method: "POST",
    body: JSON.stringify({
      url: TEST_PLAYLIST_URL,
      watch: "Full",
    }),
  });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  assertEquals(json.status, "success");
});

Deno.test("Delete Non-existent Playlist - POST /delplay", async () => {
  const resp = await apiRequest("/delplay", {
    method: "POST",
    body: JSON.stringify({
      playListUrl: "https://example.com/non-existent-playlist",
      deletePlaylist: true,
    }),
  });
  assertEquals(resp.status, 404);
});

Deno.test("Delete Non-existent Video from Playlist - POST /delsub", async () => {
  // First ensure the playlist exists by using the test playlist (will be deleted in the next test)
  // Actually, the previous test deleted it if it was successful.
  // Wait, the tests are chained.
  // Let's use a non-existent playlist first.
  const resp = await apiRequest("/delsub", {
    method: "POST",
    body: JSON.stringify({
      playListUrl: "https://example.com/non-existent-playlist",
      videoUrls: ["https://example.com/video1"],
      deleteVideoMappings: true,
    }),
  });
  assertEquals(resp.status, 404);
});

Deno.test("Add Dup Test 2 Playlist - POST /list", async () => {
  console.log("Adding playlist...");
  const resp = await apiRequest("/list", {
    method: "POST",
    body: JSON.stringify({
      urlList: [TEST_PLAYLIST_URL_2],
      chunkSize: 9,
      monitoringType: "N/A",
      sleep: true,
    }),
  });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  assertEquals(json.status, "success");

  // Wait for the background listing to complete (it's a small playlist)
  console.log("Waiting 30s for listing to complete...");
  await sleep(30000);
});

Deno.test("Add an Unlisted video to None Playlist - POST /list", async () => {
  console.log("Adding playlist...");
  const resp = await apiRequest("/list", {
    method: "POST",
    body: JSON.stringify({
      urlList: [UNLISTED_VIDEO_URL],
      chunkSize: 9,
      monitoringType: "N/A",
      sleep: true,
    }),
  });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  assertEquals(json.status, "success");

  // Wait for the background listing to complete (it's a small playlist)
  console.log("Waiting 30s for listing to complete...");
  await sleep(30000);
});

Deno.test("Verify Sublist in None Playlist - POST /getsub", async () => {
  console.log("Verifying videos in playlist...");
  const resp = await apiRequest("/getsub", {
    method: "POST",
    body: JSON.stringify({ url: "None" }),
  });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  assertExists(json.rows, "Response should have rows");
  assertNotEquals(
    json.rows.length,
    0,
    "Should have at least one video in None",
  );
  const firstVideo = json.rows[0].video_metadatum;
  assertExists(firstVideo, "Video metadata should be present");
});

Deno.test("Playlist State after adding two playlists and one unlisted video - POST /getplay", async () => {
  const resp = await apiRequest("/getplay", { method: "POST", body: "{}" });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  // Standard display excludes system playlists (like "None")
  assertExists(json.rows);
  assertEquals(json.count, 2);
});

Deno.test("Delete Dup Test Playlist - POST /delplay", async () => {
  const resp = await apiRequest("/delplay", {
    method: "POST",
    body: JSON.stringify({
      playListUrl: TEST_PLAYLIST_URL,
      deleteAllVideosInPlaylist: false,
      deletePlaylist: true,
      cleanUp: false,
    }),
  });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  assertEquals(json.status, "success");
});

Deno.test("Verify Dup Test Playlist Deleted - POST /getplay", async () => {
  const resp = await apiRequest("/getplay", { method: "POST", body: "{}" });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  const testPlaylist = json.rows.find((p: Record<string, unknown>) =>
    p.playlistUrl === TEST_PLAYLIST_URL
  );
  assertEquals(testPlaylist, undefined, "Playlist should be deleted");
});

Deno.test("Delete Dup Test 2 Playlist - POST /delplay", async () => {
  const resp = await apiRequest("/delplay", {
    method: "POST",
    body: JSON.stringify({
      playListUrl: TEST_PLAYLIST_URL,
      deleteAllVideosInPlaylist: false,
      deletePlaylist: true,
      cleanUp: false,
    }),
  });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  assertEquals(json.status, "success");
});

Deno.test("Verify Dup Test 2 Playlist Deleted - POST /getplay", async () => {
  const resp = await apiRequest("/getplay", { method: "POST", body: "{}" });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  const testPlaylist = json.rows.find((p: Record<string, unknown>) =>
    p.playlistUrl === TEST_PLAYLIST_URL
  );
  assertEquals(testPlaylist, undefined, "Playlist should be deleted");
});

Deno.test("Final Playlist State - POST /getplay", async () => {
  const resp = await apiRequest("/getplay", { method: "POST", body: "{}" });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  // Standard display excludes system playlists (like "None")
  assertExists(json.rows);
  assertEquals(json.count, 0);
});
