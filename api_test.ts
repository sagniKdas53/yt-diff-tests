/**
 * API Test Suite for yt-diff
 *
 * This test suite performs chained API calls to verify the full functionality of the application.
 * It is intended to be run against an isolated test environment (e.g., using docker-compose.test.yml).
 */

import { assertEquals, assertExists, assertNotEquals } from "std/assert/mod.ts";

const BASE_URL = Deno.env.get("API_BASE_URL") || "http://localhost:8888/ytdiff";
const TEST_PLAYLIST_URL =
  "https://www.youtube.com/watch?v=PexSJ31niEI&list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw"; // Dup Test
const testUser = {
  userName: `testuser_${Math.random().toString(36).substring(2, 8)}`,
  password: "testpassword123",
};

let token = "";

// Helper to wait
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
    signal: AbortSignal.timeout(15000), // 15s timeout
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Request failed: ${url} -> ${response.status} ${text}`);
  }

  return response;
}

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
});

Deno.test("Initial Playlist State - POST /getplay", async () => {
  const resp = await apiRequest("/getplay", { method: "POST", body: "{}" });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  // Standard display excludes system playlists (like "None")
  assertExists(json.rows);
  assertEquals(json.count, 0);
});

Deno.test("Add Playlist - POST /list", async () => {
  console.log("Adding playlist...");
  const resp = await apiRequest("/list", {
    method: "POST",
    body: JSON.stringify({
      urlList: [TEST_PLAYLIST_URL],
      monitoringType: "None",
    }),
  });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  assertEquals(json.status, "success");

  // Wait for the background listing to complete (it's a small playlist)
  console.log("Waiting 30s for listing to complete...");
  await sleep(30000);
});

Deno.test("Verify Playlist Added - POST /getplay", async () => {
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

Deno.test("Verify Videos in Playlist - POST /getsub", async () => {
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
});

Deno.test("Update Monitoring - POST /watch", async () => {
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

Deno.test("Delete Playlist - POST /delplay", async () => {
  const resp = await apiRequest("/delplay", {
    method: "POST",
    body: JSON.stringify({
      playListUrl: TEST_PLAYLIST_URL,
      deleteAllVideosInPlaylist: true,
      deletePlaylist: true,
      cleanUp: true,
    }),
  });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  assertEquals(json.status, "success");
});

Deno.test("Verify Playlist Deleted - POST /getplay", async () => {
  const resp = await apiRequest("/getplay", { method: "POST", body: "{}" });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  const testPlaylist = json.rows.find((p: Record<string, unknown>) =>
    p.playlistUrl === TEST_PLAYLIST_URL
  );
  assertEquals(testPlaylist, undefined, "Playlist should be deleted");
});
