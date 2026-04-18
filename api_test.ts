/**
 * API Test Suite for yt-diff
 *
 * This test suite performs chained API calls to verify the full functionality of the application.
 * It is intended to be run against an isolated test environment (e.g., using docker-compose.test.yml).
 */

import { assertEquals, assertExists, assertNotEquals } from "std/assert/mod.ts";
//import { io } from "socket.io-client";

const BASE_URL = Deno.env.get("API_BASE_URL") || "http://localhost:8888/ytdiff";
const PUBLIC_DUP_TEST_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw"; // Dup Test - Used to test is a single video can appear in a playlist multiple times (Should have 2 identical items after listing)
const PUBLIC_DUP_TEST_2_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY"; // Dup Test 2 - Used to test is a single video can appear in a multiple playlists (Should have 1 item after listing)
const PRIVATE_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0q_UjwFCiXuMGL65KF0fzh"; // Old Songs - Shouldn't be accessible without cookies
const UNLISTED_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs"; // Unlisted Playlist - Listing should work
const DELETED_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj20sheGzOeQKRBT5zMIVA7C"; // Deleted Playlist - Shouldn't be accessible
const EMPTY_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2kdeNNaCk-I3fpf2jW0N25"; // Empty Playlist - Accessible but Listing should fail as we are unable to extract playlist deatils as no items are present.
const PUBLIC_VIDEO_URL = "https://www.youtube.com/watch?v=JWdTskHy9TE"; // Should be accessible - Don't download this video as it's long and will take a lot of time to download
const PUBLIC_VIDEO_URL_2 = "https://www.youtube.com/watch?v=PexSJ31niEI"; // Should be accessible - This is the video in both Dup Test and Dup Test 2 (Download this to see if the One-to-many mapping is working correctly)
const UNLISTED_VIDEO_URL = "https://www.youtube.com/watch?v=dPiPWbkebEo"; // Unlisted Video - Listing should work
const PRIVATE_VIDEO_URL = "https://www.youtube.com/watch?v=6jtxTHEa8CA"; // Shouldn't be accessible without cookies
const DELETED_VIDEO_URL = "https://www.youtube.com/watch?v=C1m9W1DBJJ0"; // Shouldn't be accessible
const testUser = {
  userName: `testuser_123`,
  password: "testpassword_123",
};

let token =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjMzMmE3ZTQ3LWY5NmItNDJjMi1hOTk1LTFkOGYxNjFkNmQ2MiIsImxhc3RQYXNzd29yZENoYW5nZVRpbWUiOiIyMDI2LTA0LTE4VDE4OjExOjIwLjU0OVoiLCJpYXQiOjE3NzY1MzU4OTAsImV4cCI6MTc3OTIxNDI5MH0.lI5gJUwo_tP7W_t-OdqHuY5syzkaC6zuH2X8rszquSY";
// Helper to wait
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// TODO: Need to connect to socket to verify socket based events

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
    body: JSON.stringify({
      start: 0,
      stop: 8,
      sortDownloaded: false,
      query: "",
      url: "None",
    }),
  });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  // {"count":0,"rows":[],"saveDirectory":""}
  assertEquals(json.rows.length, 0);
  assertEquals(json.count, 0);
  assertEquals(json.saveDirectory, "");
});

Deno.test("Initial Playlist State - POST /getplay", async () => {
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
  assertEquals(resp.status, 200);
  const json = await resp.json();
  // {"count":0,"rows":[]}
  assertEquals(json.rows.length, 0);
  assertEquals(json.count, 0);
});

Deno.test("Add Dup Test Playlist - POST /list", async () => {
  console.log("Adding playlist...");
  const resp = await apiRequest("/list", {
    method: "POST",
    body: JSON.stringify({
      urlList: [PUBLIC_DUP_TEST_PLAYLIST_URL],
      chunkSize: 9,
      monitoringType: "N/A",
      sleep: true,
    }),
  });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  // {"status":"success","message":"Listing initiated","items":[{"url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","type":"undetermined","currentMonitoringType":"N/A","reason":"URL not found in database"}]}
  assertEquals(json.status, "success");
  assertEquals(json.message, "Listing initiated");
  assertEquals(json.items.length, 1);
  assertEquals(json.items[0].url, PUBLIC_DUP_TEST_PLAYLIST_URL);
  assertEquals(json.items[0].type, "undetermined");
  assertEquals(json.items[0].currentMonitoringType, "N/A");
  assertEquals(json.items[0].reason, "URL not found in database");

  // Wait for the background listing to complete (it's a small playlist)
  console.log("Waiting 30s for listing to complete...");
  await sleep(30000);
});

Deno.test("Verify Dup Test Playlist Added - POST /getplay", async () => {
  console.log("Verifying playlist added...");
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
  assertEquals(resp.status, 200);
  const json = await resp.json();
  // {"count":1,"rows":[{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","title":"Dup Test","sortOrder":0,"monitoringType":"N/A","saveDirectory":"Dup Test","createdAt":"2026-04-18T12:00:01.860Z","updatedAt":"2026-04-18T12:00:01.860Z","lastUpdatedByScheduler":"2026-04-18T12:00:01.841Z"}]}
  assertExists(json.rows, "Response should have rows");
  assertEquals(json.count, 1);
  assertEquals(json.rows.length, 1);
  const testPlaylist = json.rows.find((p: Record<string, unknown>) =>
    p.playlistUrl === PUBLIC_DUP_TEST_PLAYLIST_URL
  );
  assertExists(
    testPlaylist,
    `Playlist ${PUBLIC_DUP_TEST_PLAYLIST_URL} should be present in results: ${
      JSON.stringify(json.rows)
    }`,
  );
  assertEquals(testPlaylist.title, "Dup Test");
  assertEquals(testPlaylist.sortOrder, 0);
  assertEquals(testPlaylist.monitoringType, "N/A");
  assertEquals(testPlaylist.saveDirectory, "Dup Test");
});

Deno.test("Verify that there are 2 videos in Dup Test Playlist - POST /getsub", async () => {
  console.log("Verifying videos in playlist...");
  const resp = await apiRequest("/getsub", {
    method: "POST",
    body: JSON.stringify(
      {
        start: 0,
        stop: 8,
        sortDownloaded: false,
        query: "",
        url: PUBLIC_DUP_TEST_PLAYLIST_URL,
      },
    ),
  });
  assertEquals(resp.status, 200);
  const json = await resp.json();
  // {"count":2,"rows":[{"positionInPlaylist":1,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","video_metadatum":{"title":"Run Immich through a docker container on Tailscale","videoId":"PexSJ31niEI","videoUrl":"https://www.youtube.com/watch?v=PexSJ31niEI","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/PexSJ31niEI/sddefault.jpg?sqp=-oaymwEmCIAFEOAD8quKqQMa8AEB-AHSBoAC4AOKAgwIABABGFkgWShZMA8=&rs=AOn4CLAcuWHiDO7IaUGPtoIc2p9V4odxhg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":2,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","video_metadatum":{"title":"Run Immich through a docker container on Tailscale","videoId":"PexSJ31niEI","videoUrl":"https://www.youtube.com/watch?v=PexSJ31niEI","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/PexSJ31niEI/sddefault.jpg?sqp=-oaymwEmCIAFEOAD8quKqQMa8AEB-AHSBoAC4AOKAgwIABABGFkgWShZMA8=&rs=AOn4CLAcuWHiDO7IaUGPtoIc2p9V4odxhg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}}],"saveDirectory":"Dup Test"}
  // Validate the above JSON structure
  assertEquals(json.count, 2);
  assertEquals(json.rows.length, 2);
  assertEquals(json.saveDirectory, "Dup Test");
  // Row 1
  assertEquals(json.rows[0].positionInPlaylist, 1);
  assertEquals(json.rows[0].playlistUrl, PUBLIC_DUP_TEST_PLAYLIST_URL);
  assertEquals(
    json.rows[0].video_metadatum.title,
    "Run Immich through a docker container on Tailscale",
  );
  assertEquals(json.rows[0].video_metadatum.videoId, "PexSJ31niEI");
  assertEquals(
    json.rows[0].video_metadatum.videoUrl,
    "https://www.youtube.com/watch?v=PexSJ31niEI",
  );
  assertEquals(json.rows[0].video_metadatum.downloadStatus, false);
  assertEquals(json.rows[0].video_metadatum.isAvailable, true);
  assertEquals(json.rows[0].video_metadatum.fileName, null);
  assertEquals(json.rows[0].video_metadatum.thumbNailFile, null);
  assertEquals(
    json.rows[0].video_metadatum.onlineThumbnail,
    "https://i.ytimg.com/vi/PexSJ31niEI/sddefault.jpg?sqp=-oaymwEmCIAFEOAD8quKqQMa8AEB-AHSBoAC4AOKAgwIABABGFkgWShZMA8=&rs=AOn4CLAcuWHiDO7IaUGPtoIc2p9V4odxhg",
  );
  assertEquals(json.rows[0].video_metadatum.subTitleFile, null);
  assertEquals(json.rows[0].video_metadatum.descriptionFile, null);
  assertEquals(json.rows[0].video_metadatum.isMetaDataSynced, false);
  assertEquals(json.rows[0].video_metadatum.saveDirectory, null);
  // Row 2
  assertEquals(json.rows[1].positionInPlaylist, 2);
  assertEquals(json.rows[1].playlistUrl, PUBLIC_DUP_TEST_PLAYLIST_URL);
  assertEquals(
    json.rows[1].video_metadatum.title,
    "Run Immich through a docker container on Tailscale",
  );
  assertEquals(json.rows[1].video_metadatum.videoId, "PexSJ31niEI");
  assertEquals(
    json.rows[1].video_metadatum.videoUrl,
    "https://www.youtube.com/watch?v=PexSJ31niEI",
  );
  assertEquals(json.rows[1].video_metadatum.downloadStatus, false);
  assertEquals(json.rows[1].video_metadatum.isAvailable, true);
  assertEquals(json.rows[1].video_metadatum.fileName, null);
  assertEquals(json.rows[1].video_metadatum.thumbNailFile, null);
  assertEquals(
    json.rows[1].video_metadatum.onlineThumbnail,
    "https://i.ytimg.com/vi/PexSJ31niEI/sddefault.jpg?sqp=-oaymwEmCIAFEOAD8quKqQMa8AEB-AHSBoAC4AOKAgwIABABGFkgWShZMA8=&rs=AOn4CLAcuWHiDO7IaUGPtoIc2p9V4odxhg",
  );
  assertEquals(json.rows[1].video_metadatum.subTitleFile, null);
  assertEquals(json.rows[1].video_metadatum.descriptionFile, null);
  assertEquals(json.rows[1].video_metadatum.isMetaDataSynced, false);
  assertEquals(json.rows[1].video_metadatum.saveDirectory, null);
});

// Done:
// -4. Get the inital playlist state
// Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Res: {"count":0,"rows":[]}
// -3. Get the inital "None" playlist state
// Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Res: {"count":0,"rows":[]}
// -2. Add the "Dup Test" playlist
// Req: {"urlList":["https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw"],"chunkSize":9,"monitoringType":"N/A","sleep":true}
// Res: {"status":"success","message":"Listing initiated","items":[{"url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","type":"undetermined","currentMonitoringType":"N/A","reason":"URL not found in database"}]}
// -1. Get the playlist to see if the first playlist got added
// Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Res: {"count":1,"rows":[{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","title":"Dup Test","sortOrder":0,"monitoringType":"N/A","saveDirectory":"Dup Test","createdAt":"2026-04-18T19:35:30.827Z","updatedAt":"2026-04-18T19:35:30.827Z","lastUpdatedByScheduler":"2026-04-18T19:35:30.825Z"}]}
// 0. Get the items in the sublist for "Dup Test"
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw"}
// Res: {"count":2,"rows":[{"positionInPlaylist":1,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","video_metadatum":{"title":"Run Immich through a docker container on Tailscale","videoId":"PexSJ31niEI","videoUrl":"https://www.youtube.com/watch?v=PexSJ31niEI","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/PexSJ31niEI/sddefault.jpg?sqp=-oaymwEmCIAFEOAD8quKqQMa8AEB-AHSBoAC4AOKAgwIABABGFkgWShZMA8=&rs=AOn4CLAcuWHiDO7IaUGPtoIc2p9V4odxhg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":2,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","video_metadatum":{"title":"Run Immich through a docker container on Tailscale","videoId":"PexSJ31niEI","videoUrl":"https://www.youtube.com/watch?v=PexSJ31niEI","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/PexSJ31niEI/sddefault.jpg?sqp=-oaymwEmCIAFEOAD8quKqQMa8AEB-AHSBoAC4AOKAgwIABABGFkgWShZMA8=&rs=AOn4CLAcuWHiDO7IaUGPtoIc2p9V4odxhg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}}],"saveDirectory":"Dup Test"}

// Planned:
// 1. Download the first video but because both the videos in the Dup Test playlist are same downloading one downloads both videos.
// Download Req: {"urlList":["https://www.youtube.com/watch?v=PexSJ31niEI"],"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw"}
// Download Res: {"status":"success","message":"Downloads initiated","items":[{"url":"https://www.youtube.com/watch?v=PexSJ31niEI","title":"Run Immich through a docker container on Tailscale","saveDirectory":"Dup Test","videoId":"PexSJ31niEI"}]}
// 2. Get the subList again after download and assert that the download is done and assert all the new fields
// SubList Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw"}
// SubList Res: {"count":2,"rows":[{"positionInPlaylist":1,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","video_metadatum":{"title":"Run Immich through a docker container on Tailscale","videoId":"PexSJ31niEI","videoUrl":"https://www.youtube.com/watch?v=PexSJ31niEI","downloadStatus":true,"isAvailable":true,"fileName":"PexSJ31niEI.mkv","thumbNailFile":"PexSJ31niEI.webp","onlineThumbnail":"https://i.ytimg.com/vi/PexSJ31niEI/sddefault.jpg?sqp=-oaymwEmCIAFEOAD8quKqQMa8AEB-AHSBoAC4AOKAgwIABABGFkgWShZMA8=&rs=AOn4CLAcuWHiDO7IaUGPtoIc2p9V4odxhg","subTitleFile":null,"descriptionFile":"PexSJ31niEI.description","isMetaDataSynced":true,"saveDirectory":"Dup Test"}},{"positionInPlaylist":2,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","video_metadatum":{"title":"Run Immich through a docker container on Tailscale","videoId":"PexSJ31niEI","videoUrl":"https://www.youtube.com/watch?v=PexSJ31niEI","downloadStatus":true,"isAvailable":true,"fileName":"PexSJ31niEI.mkv","thumbNailFile":"PexSJ31niEI.webp","onlineThumbnail":"https://i.ytimg.com/vi/PexSJ31niEI/sddefault.jpg?sqp=-oaymwEmCIAFEOAD8quKqQMa8AEB-AHSBoAC4AOKAgwIABABGFkgWShZMA8=&rs=AOn4CLAcuWHiDO7IaUGPtoIc2p9V4odxhg","subTitleFile":null,"descriptionFile":"PexSJ31niEI.description","isMetaDataSynced":true,"saveDirectory":"Dup Test"}}],"saveDirectory":"Dup Test"}
// 3. Get Files
// Get Files Req: {"files":[{"saveDirectory":"Dup Test","fileName":"PexSJ31niEI.webp"},{"saveDirectory":"Dup Test","fileName":"PexSJ31niEI.webp"}]}
// Get Files Res: {"status":"success","files":{"PexSJ31niEI.webp":"51eab7a2-04ba-4ed8-bd03-3849f507ee5c"}}
// 4. Get File
// Get File Req: {"saveDirectory":"Dup Test","fileName":"PexSJ31niEI.mkv"}
// Get File Res: {"status":"success","signedUrlId":"c83617d3-c6ab-486f-a918-6040a6709f92","expiry":1776520862781}
// 5. Get a file content
// Get File Req: GET http://localhost:8888/ytdiff/getfile?fileId=b1d4e25f-475f-47fe-bed8-2d68a277c134
// Get File Res: The Raw File
// 6. Refresh File - Forgot How this works, I'll get back to this later
// Refresh File Req:
// Refresh File Res:
// 7. Change the monitoring type of a playlist
// Watch Req: {"url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","watch":"Full"}
// Watch Res: {"status":"success","message":"Monitoring type updated successfully"}
// 8. Get the playlists again to see the change in the monitting type
// Get Play Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Get Play Res: {"count":1,"rows":[{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","title":"Dup Test","sortOrder":0,"monitoringType":"Full","saveDirectory":"Dup Test","createdAt":"2026-04-18T12:34:21.994Z","updatedAt":"2026-04-18T12:34:21.994Z","lastUpdatedByScheduler":"2026-04-18T12:34:21.990Z"}]}
// 9. Add the "Dup Test 2" playlist
// Req: {"urlList":["https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY"],"chunkSize":9,"monitoringType":"N/A","sleep":true}
// Res: {"status":"success","message":"Listing initiated","items":[{"url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY","type":"undetermined","currentMonitoringType":"N/A","reason":"URL not found in database"}]}
// 10. Get playlists again to see the new playlist "Dup Test 2" in the list
// Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Res: {"count":2,"rows":[{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","title":"Dup Test","sortOrder":0,"monitoringType":"N/A","saveDirectory":"Dup Test","createdAt":"2026-04-18T18:12:12.091Z","updatedAt":"2026-04-18T18:12:12.091Z","lastUpdatedByScheduler":"2026-04-18T18:12:12.086Z"},{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY","title":"Dup Test 2","sortOrder":1,"monitoringType":"N/A","saveDirectory":"Dup Test 2","createdAt":"2026-04-18T18:24:44.669Z","updatedAt":"2026-04-18T18:24:44.669Z","lastUpdatedByScheduler":"2026-04-18T18:24:44.667Z"}]}
// 11. Get the sublist for the "Dup Test 2" playlist - Assert that the files here are downloaded this means that many to one connection is working
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY"}
// Res: {"count":1,"rows":[{"positionInPlaylist":1,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY","video_metadatum":{"title":"Run Immich through a docker container on Tailscale","videoId":"PexSJ31niEI","videoUrl":"https://www.youtube.com/watch?v=PexSJ31niEI","downloadStatus":true,"isAvailable":true,"fileName":"PexSJ31niEI.mkv","thumbNailFile":"PexSJ31niEI.webp","onlineThumbnail":"https://i.ytimg.com/vi/PexSJ31niEI/sddefault.jpg?sqp=-oaymwEmCIAFEOAD8quKqQMa8AEB-AHSBoAC4AOKAgwIABABGFkgWShZMA8=&rs=AOn4CLAcuWHiDO7IaUGPtoIc2p9V4odxhg","subTitleFile":null,"descriptionFile":"PexSJ31niEI.description","isMetaDataSynced":true,"saveDirectory":"Dup Test"}}],"saveDirectory":"Dup Test 2"}
// 12. Delete the downloaded files for the only item in the Dup Test 2 playlist - /delsub (This will only delete the files the video and the mappings stay as it is)
// Req: {"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY","videoUrls":["https://www.youtube.com/watch?v=PexSJ31niEI"],"cleanUp":true,"deleteVideoMappings":false,"deleteVideosInDB":false}
// Res: {"message":"Processed 1 video(s) from playlist Dup Test 2","deleted":["https://www.youtube.com/watch?v=PexSJ31niEI"],"failed":[],"cleanUp":true,"deleteVideoMappings":false,"deleteVideosInDB":false}
// 13. Get the sublist for the "Dup Test 2" playlist again to verify that the files are deleted - Assert that the files are deleted this means that only the files were deleted and the video and the mappings stay as it is
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY"}
// Res: {"count":1,"rows":[{"positionInPlaylist":1,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY","video_metadatum":{"title":"Run Immich through a docker container on Tailscale","videoId":"PexSJ31niEI","videoUrl":"https://www.youtube.com/watch?v=PexSJ31niEI","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/PexSJ31niEI/sddefault.jpg?sqp=-oaymwEmCIAFEOAD8quKqQMa8AEB-AHSBoAC4AOKAgwIABABGFkgWShZMA8=&rs=AOn4CLAcuWHiDO7IaUGPtoIc2p9V4odxhg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":true,"saveDirectory":null}}],"saveDirectory":"Dup Test 2"}
// 14. Get the sublist for "Dup Test" playlist - the videos here should also be undownloaded - proving that many to one connection is working
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw"}
// Res: {"count":2,"rows":[{"positionInPlaylist":1,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","video_metadatum":{"title":"Run Immich through a docker container on Tailscale","videoId":"PexSJ31niEI","videoUrl":"https://www.youtube.com/watch?v=PexSJ31niEI","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/PexSJ31niEI/sddefault.jpg?sqp=-oaymwEmCIAFEOAD8quKqQMa8AEB-AHSBoAC4AOKAgwIABABGFkgWShZMA8=&rs=AOn4CLAcuWHiDO7IaUGPtoIc2p9V4odxhg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":true,"saveDirectory":null}},{"positionInPlaylist":2,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","video_metadatum":{"title":"Run Immich through a docker container on Tailscale","videoId":"PexSJ31niEI","videoUrl":"https://www.youtube.com/watch?v=PexSJ31niEI","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/PexSJ31niEI/sddefault.jpg?sqp=-oaymwEmCIAFEOAD8quKqQMa8AEB-AHSBoAC4AOKAgwIABABGFkgWShZMA8=&rs=AOn4CLAcuWHiDO7IaUGPtoIc2p9V4odxhg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":true,"saveDirectory":null}}],"saveDirectory":"Dup Test"}
// 15. Add the unlisted playlist "E7 Shorts"
// Req: {"urlList":["https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs"],"chunkSize":9,"monitoringType":"N/A","sleep":true}
// Res: {"status":"success","message":"Listing initiated","items":[{"url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","type":"undetermined","currentMonitoringType":"N/A","reason":"URL not found in database"}]}
// 16. Get playlists again to see the new playlist "E7 Shorts" in the list
// Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Res: {"count":3,"rows":[{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","title":"Dup Test","sortOrder":0,"monitoringType":"N/A","saveDirectory":"Dup Test","createdAt":"2026-04-18T18:12:12.091Z","updatedAt":"2026-04-18T18:12:12.091Z","lastUpdatedByScheduler":"2026-04-18T18:12:12.086Z"},{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY","title":"Dup Test 2","sortOrder":1,"monitoringType":"N/A","saveDirectory":"Dup Test 2","createdAt":"2026-04-18T18:24:44.669Z","updatedAt":"2026-04-18T18:24:44.669Z","lastUpdatedByScheduler":"2026-04-18T18:24:44.667Z"},{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","title":"E7 Shorts","sortOrder":2,"monitoringType":"N/A","saveDirectory":"E7 Shorts","createdAt":"2026-04-18T19:04:44.846Z","updatedAt":"2026-04-18T19:04:44.846Z","lastUpdatedByScheduler":"2026-04-18T19:04:44.844Z"}]}
// 17. Get the sublist for "E7 Shorts" playlist - there should be 2 items
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs"}
// Res: {"count":2,"rows":[{"positionInPlaylist":1,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","video_metadatum":{"title":"Good Pets Epic Seven","videoId":"kr2lsFN_aM8","videoUrl":"https://www.youtube.com/watch?v=kr2lsFN_aM8","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/kr2lsFN_aM8/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":2,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","video_metadatum":{"title":"Screenrecording 20201222 143136 com stove epic7 google","videoId":"h0OdOdLtuQM","videoUrl":"https://www.youtube.com/watch?v=h0OdOdLtuQM","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/h0OdOdLtuQM/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}}],"saveDirectory":"E7 Shorts"}
// 18. Delete the first item in the "E7 Shorts" playlist with delete everthing mode - /delsub
// Req: {"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","videoUrls":["https://www.youtube.com/watch?v=kr2lsFN_aM8"],"cleanUp":true,"deleteVideoMappings":true,"deleteVideosInDB":true}
// Res: {"message":"Processed 1 video(s) from playlist E7 Shorts","deleted":["https://www.youtube.com/watch?v=kr2lsFN_aM8"],"failed":[],"cleanUp":true,"deleteVideoMappings":true,"deleteVideosInDB":true}
// 19. Get the sublist again to see that there is only one item
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs"}
// Res: {"count":1,"rows":[{"positionInPlaylist":2,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","video_metadatum":{"title":"Screenrecording 20201222 143136 com stove epic7 google","videoId":"h0OdOdLtuQM","videoUrl":"https://www.youtube.com/watch?v=h0OdOdLtuQM","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/h0OdOdLtuQM/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}}],"saveDirectory":"E7 Shorts"}
// 20. Delete the first item in the "E7 Shorts" playlist with unlink mode - /delsub
// Req: {"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","videoUrls":["https://www.youtube.com/watch?v=h0OdOdLtuQM"],"cleanUp":false,"deleteVideoMappings":true,"deleteVideosInDB":false}
// Res: {"message":"Processed 1 video(s) from playlist E7 Shorts","deleted":["https://www.youtube.com/watch?v=h0OdOdLtuQM"],"failed":[],"cleanUp":false,"deleteVideoMappings":true,"deleteVideosInDB":false}
// 21. Get the sublist again to see that there is no item left in the playlist
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs"}
// Res: {"count":0,"rows":[],"saveDirectory":"E7 Shorts"}
// 22. Delete only the playlist "E7 Shorts"
// Req: {"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","deleteAllVideosInPlaylist":false,"deletePlaylist":true,"cleanUp":false}
// Res: {"status":"success","message":"Deleted playlist E7 Shorts","cleanUp":false,"deletePlaylist":true,"deleteAllVideosInPlaylist":false}
// 23. Get the playlists again to see that there is only two playlists left
// Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Res: {"count":2,"rows":[{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","title":"Dup Test","sortOrder":0,"monitoringType":"N/A","saveDirectory":"Dup Test","createdAt":"2026-04-18T18:12:12.091Z","updatedAt":"2026-04-18T18:12:12.091Z","lastUpdatedByScheduler":"2026-04-18T18:12:12.086Z"},{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY","title":"Dup Test 2","sortOrder":1,"monitoringType":"N/A","saveDirectory":"Dup Test 2","createdAt":"2026-04-18T18:24:44.669Z","updatedAt":"2026-04-18T18:24:44.669Z","lastUpdatedByScheduler":"2026-04-18T18:24:44.667Z"}]}
// 24. Unlink the videos in "Dup Test 2" - /delplay
// Req: {"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY","deleteAllVideosInPlaylist":true,"deletePlaylist":false,"cleanUp":false}
// Res: {"status":"success","message":"Removed all video references from playlist Dup Test 2","cleanUp":false,"deletePlaylist":false,"deleteAllVideosInPlaylist":true}
// 25. Get the sublist for "Dup Test 2" to see that there is no item left in the playlist
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY"}
// Res: {"count":0,"rows":[],"saveDirectory":"Dup Test 2"}
// 26. Delete only the playlist "Dup Test 2" - /delplay
// Req: {"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY","deleteAllVideosInPlaylist":false,"deletePlaylist":true,"cleanUp":false}
// Res: {"status":"success","message":"Deleted playlist Dup Test 2","cleanUp":false,"deletePlaylist":true,"deleteAllVideosInPlaylist":false}
// 27. Get the playlists again to see that there is only one playlist left
// Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Res: {"count":1,"rows":[{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","title":"Dup Test","sortOrder":0,"monitoringType":"N/A","saveDirectory":"Dup Test","createdAt":"2026-04-18T18:12:12.091Z","updatedAt":"2026-04-18T18:12:12.091Z","lastUpdatedByScheduler":"2026-04-18T18:12:12.086Z"}]}
// Note: Deleting a video from the DB directly is not possible, all of the delete operations just delete the associations of videos in the playlists not the videos themselves, a background process is responsible for deleting the actual videos from the db
//       If the video is not downloaded then it gets pruned if it is then it gets moved to the end of the "None" playlist

// TODO: I don't like that we are re-using the same playlist for testing the duplicate videos and deletion, we should just delete Dup Test and get a clean slate for testing the deletion, pruning and moving to "None" playlist
// get another playlist with disticnt videos that get listed downloaded, fully cleaned up or just unlinked and then left for the scheduler to clean up and see the video getting moved to "None" playlist
// 28. Download the only video in "Dup Test" again
// Req: {"urlList":["https://www.youtube.com/watch?v=PexSJ31niEI"],"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw"}
// Res: {"status":"success","message":"Downloads initiated","items":[{"url":"https://www.youtube.com/watch?v=PexSJ31niEI","title":"Run Immich through a docker container on Tailscale","saveDirectory":"Dup Test","videoId":"PexSJ31niEI"}]}
// 29. Get the sublist again to see that the video is downloaded
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw"}
// Res: {"count":2,"rows":[{"positionInPlaylist":1,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","video_metadatum":{"title":"Run Immich through a docker container on Tailscale","videoId":"PexSJ31niEI","videoUrl":"https://www.youtube.com/watch?v=PexSJ31niEI","downloadStatus":true,"isAvailable":true,"fileName":"PexSJ31niEI.mkv","thumbNailFile":"PexSJ31niEI.webp","onlineThumbnail":"https://i.ytimg.com/vi/PexSJ31niEI/sddefault.jpg?sqp=-oaymwEmCIAFEOAD8quKqQMa8AEB-AHSBoAC4AOKAgwIABABGFkgWShZMA8=&rs=AOn4CLAcuWHiDO7IaUGPtoIc2p9V4odxhg","subTitleFile":null,"descriptionFile":"PexSJ31niEI.description","isMetaDataSynced":true,"saveDirectory":"Dup Test"}},{"positionInPlaylist":2,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","video_metadatum":{"title":"Run Immich through a docker container on Tailscale","videoId":"PexSJ31niEI","videoUrl":"https://www.youtube.com/watch?v=PexSJ31niEI","downloadStatus":true,"isAvailable":true,"fileName":"PexSJ31niEI.mkv","thumbNailFile":"PexSJ31niEI.webp","onlineThumbnail":"https://i.ytimg.com/vi/PexSJ31niEI/sddefault.jpg?sqp=-oaymwEmCIAFEOAD8quKqQMa8AEB-AHSBoAC4AOKAgwIABABGFkgWShZMA8=&rs=AOn4CLAcuWHiDO7IaUGPtoIc2p9V4odxhg","subTitleFile":null,"descriptionFile":"PexSJ31niEI.description","isMetaDataSynced":true,"saveDirectory":"Dup Test"}}],"saveDirectory":"Dup Test"}
// 30. Delete Everything for playlist "Dup Test" - /delplay
// Req: {"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","deleteAllVideosInPlaylist":true,"deletePlaylist":true,"cleanUp":true}
// Res: {"status":"success","message":"Removed all video references from playlist Dup Test and deleted playlist and cleaned up playlist directory (and marked 1 shared video(s) as un-downloaded)","cleanUp":true,"deletePlaylist":true,"deleteAllVideosInPlaylist":true}
// Note: At this point the "Run Immich through a docker container on Tailscale" video still is in DB, but since it's marked as un-downloaded it will be pruned by the scheduler
//       To see a video getting moved to "None" playlist we will need to add a playlist, download the video in it and then either unlink the videos in it or delete the playlist
// TODO: Implement the listing, downlodaing, deletion and pruning for the "None" playlist and then add a test case for it as well
// Make sure to test the scenario where adding the same video to a playlist and None work together
// If it's downloaded in one place it should be downloaded in the other place as well, if it's deleted in one place it should be deleted in the other place as well, if it's unlinked in one place it should be unlinked in the other place as well and if it's pruned in one place it should be pruned in the other place as well
// Also make sure that the scheduler is not pruning the video if it's still linked to a playlist even if it's marked as un-downloaded, the video should only be pruned when it's marked as un-downloaded and not linked to any playlist including None playlist
// If we try adding the the same video to "None" playlist twice it should not create duplicate mappings in None playlist (returns an error or ignores the request) I don't remember but it doesn't add a dupe entry to none
// And on a similar note if the video we are trying to add to "None" is already downloaded in the any playlist then it should send an alert letting us know that it's downloaded and skip addion to None
