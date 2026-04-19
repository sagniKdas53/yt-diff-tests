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
const PUBLIC_PLAYLIST_BIG_URL =
  "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh"; // A playlist with 17 items, used to test pagination, download and pruning
const PRIVATE_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0q_UjwFCiXuMGL65KF0fzh"; // Old Songs - Shouldn't be accessible without cookies
const UNLISTED_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs"; // Unlisted Playlist - Listing should work
const DELETED_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj20sheGzOeQKRBT5zMIVA7C"; // Deleted Playlist - Shouldn't be accessible
const EMPTY_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2kdeNNaCk-I3fpf2jW0N25"; // Empty Playlist - Accessible but Listing should fail as we are unable to extract playlist deatils as no items are present.
const PUBLIC_ENGINEERING_STUFF_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2TwKOK-_dXvPlzs1DktqFX"; /// Currently has one vid will probably add more in future only used for re-indexing so seems wasteful
const PUBLIC_VIDEO_URL = "https://www.youtube.com/watch?v=JWdTskHy9TE"; // Should be accessible - Use this for Multi Mapping in None and Playlist
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
// 28. Delete Everything for playlist "Dup Test" - /delplay
// Req: {"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","deleteAllVideosInPlaylist":true,"deletePlaylist":true,"cleanUp":true}
// Res: {"status":"success","message":"Removed all video references from playlist Dup Test and deleted playlist and cleaned up playlist directory (and marked 1 shared video(s) as un-downloaded)","cleanUp":true,"deletePlaylist":true,"deleteAllVideosInPlaylist":true}
// 29. Get the playlists again to see that there are no playlists left
// Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Res: {"count":0,"rows":[],"saveDirectory":""}
// 30. Add the Screen Recordings Plyalist
// Req: {"urlList":["https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh"],"chunkSize":9,"monitoringType":"N/A","sleep":true}
// Res: {"status":"success","message":"Listing initiated","items":[{"url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","type":"undetermined","currentMonitoringType":"N/A","reason":"URL not found in database"}]}
// 31. Get Playlists there should be only one one
// Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Res: {"count":1,"rows":[{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","title":"Screen recordings","sortOrder":0,"monitoringType":"N/A","saveDirectory":"Screen recordings","createdAt":"2026-04-19T06:39:11.698Z","updatedAt":"2026-04-19T06:39:11.698Z","lastUpdatedByScheduler":"2026-04-19T06:39:11.696Z"}]}
// Wait 3 mins for the big list to complete listing there should be 17 items before proceeding
// 32. Get Sublist for Screen Recodings - This will take three calls as there are 17 items
// Req 1: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh"}
// Res 1: {"count":17,"rows":[{"positionInPlaylist":1,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"epic7 choosing a free ML 5 star #epicseven","videoId":"CHfrhqF79JE","videoUrl":"https://www.youtube.com/watch?v=CHfrhqF79JE","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/CHfrhqF79JE/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":2,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Playing Wuthering Waves on a Mobile phone is a challenge and I love it","videoId":"IRPQqOSGlhE","videoUrl":"https://www.youtube.com/watch?v=IRPQqOSGlhE","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/IRPQqOSGlhE/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":3,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Honkai Star Rail Divergent Universe Without Any Blessings #honkaistarrail #gacha #stupid","videoId":"_RctoqTNOxY","videoUrl":"https://www.youtube.com/watch?v=_RctoqTNOxY","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/_RctoqTNOxY/sddefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":4,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Arknights Endfield Exp Farm AFK","videoId":"0CEIEYgbxiY","videoUrl":"https://www.youtube.com/watch?v=0CEIEYgbxiY","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/0CEIEYgbxiY/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":5,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Wuthering Waves 3.0 farming with old characters","videoId":"jIshu4rDzSI","videoUrl":"https://www.youtube.com/watch?v=jIshu4rDzSI","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/jIshu4rDzSI/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":6,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Varesa Pulls","videoId":"y6LfDaFl4yE","videoUrl":"https://www.youtube.com/watch?v=y6LfDaFl4yE","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/y6LfDaFl4yE/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":7,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Honkai Star Rail Unknown Domain Conundrum 1 Break Effect Team Specters Run","videoId":"Bwrhs5A7St0","videoUrl":"https://www.youtube.com/watch?v=Bwrhs5A7St0","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/Bwrhs5A7St0/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":8,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Honkai Star Rail Unknown Domain Conundrum 6 Follow-up Attack Team Specters Run","videoId":"EfPOsufW7JU","videoUrl":"https://www.youtube.com/watch?v=EfPOsufW7JU","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/EfPOsufW7JU/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}}],"saveDirectory":"Screen recordings"}
// Req 2: {"start":8,"stop":16,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh"}
// Res 2: {"count":17,"rows":[{"positionInPlaylist":9,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Imaginium Theater 🎭 first time","videoId":"eraxGPVNxYU","videoUrl":"https://www.youtube.com/watch?v=eraxGPVNxYU","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/eraxGPVNxYU/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":10,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Hu Tao Vape team test","videoId":"AzBSmX6j8KM","videoUrl":"https://www.youtube.com/watch?v=AzBSmX6j8KM","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/AzBSmX6j8KM/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":11,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Epic Seven Rift One Shot Finally","videoId":"m4QOojooyY8","videoUrl":"https://www.youtube.com/watch?v=m4QOojooyY8","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/m4QOojooyY8/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":12,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Epic Seven Rift Almost One Shot","videoId":"kkdGWDMFzWA","videoUrl":"https://www.youtube.com/watch?v=kkdGWDMFzWA","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/kkdGWDMFzWA/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":13,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Weekly materials to buy Honkai Star Rail","videoId":"RBbCc4rmOpk","videoUrl":"https://www.youtube.com/watch?v=RBbCc4rmOpk","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/RBbCc4rmOpk/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":14,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"embers","videoId":"BXceNOjZIeQ","videoUrl":"https://www.youtube.com/watch?v=BXceNOjZIeQ","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/BXceNOjZIeQ/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":15,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Golem 13 one shot Epic Seven","videoId":"JWdTskHy9TE","videoUrl":"https://www.youtube.com/watch?v=JWdTskHy9TE","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/JWdTskHy9TE/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":16,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"AP-5 Fast","videoId":"i0S9vlyQpig","videoUrl":"https://www.youtube.com/watch?v=i0S9vlyQpig","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/i0S9vlyQpig/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}}],"saveDirectory":"Screen recordings"}
// Req 3: {"start":16,"stop":24,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh"}
// Res 3: {"count":17,"rows":[{"positionInPlaylist":17,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"1-7 Mayer Arknights","videoId":"HmYC64QjqvE","videoUrl":"https://www.youtube.com/watch?v=HmYC64QjqvE","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/HmYC64QjqvE/sddefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}}],"saveDirectory":"Screen recordings"}
// 33. Download a video in the Plyalist
// Req: {"urlList":["https://www.youtube.com/watch?v=i0S9vlyQpig"],"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh"}
// Res: {"status":"success","message":"Downloads initiated","items":[{"url":"https://www.youtube.com/watch?v=i0S9vlyQpig","title":"AP-5 Fast","saveDirectory":"Screen recordings","videoId":"i0S9vlyQpig"}]}
// 34. Add one of the videos in the playlist to "None" (This ensures that even if a video is a playlist already we can still add it to None playlist for curation)
// Req: {"urlList":["https://www.youtube.com/watch?v=JWdTskHy9TE"],"chunkSize":9,"monitoringType":"N/A","sleep":true}
// Res: {"status":"success","message":"Listing initiated","items":[{"url":"https://www.youtube.com/watch?v=JWdTskHy9TE","type":"undownloaded","currentMonitoringType":"N/A","reason":"Video not downloaded yet"}]}
// 35. Get None playlist to see if this is added
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"None"}
// Res: {"count":1,"rows":[{"positionInPlaylist":1,"playlistUrl":"None","video_metadatum":{"title":"Golem 13 one shot Epic Seven","videoId":"JWdTskHy9TE","videoUrl":"https://www.youtube.com/watch?v=JWdTskHy9TE","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/JWdTskHy9TE/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}}],"saveDirectory":""}
// 36. Download this video
// Req: {"urlList":["https://www.youtube.com/watch?v=JWdTskHy9TE"],"playListUrl":"None"}
// Res: {"status":"success","message":"Downloads initiated","items":[{"url":"https://www.youtube.com/watch?v=JWdTskHy9TE","title":"Golem 13 one shot Epic Seven","saveDirectory":"Screen recordings","videoId":"JWdTskHy9TE"}]}
// 37. Get Sublist again to see if the download succeded
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"None"}
// Res: {"count":1,"rows":[{"positionInPlaylist":1,"playlistUrl":"None","video_metadatum":{"title":"Golem 13 one shot Epic Seven","videoId":"JWdTskHy9TE","videoUrl":"https://www.youtube.com/watch?v=JWdTskHy9TE","downloadStatus":true,"isAvailable":true,"fileName":"JWdTskHy9TE.mkv","thumbNailFile":"JWdTskHy9TE.webp","onlineThumbnail":"https://i.ytimg.com/vi/JWdTskHy9TE/maxresdefault.jpg","subTitleFile":null,"descriptionFile":"JWdTskHy9TE.description","isMetaDataSynced":true,"saveDirectory":"Screen recordings"}}],"saveDirectory":""}
// 38. Get the playlist we should see it marked as downloaded there as well
// Req: {"start":8,"stop":16,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh"}
// Res: {"count":17,"rows":[{"positionInPlaylist":9,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Imaginium Theater 🎭 first time","videoId":"eraxGPVNxYU","videoUrl":"https://www.youtube.com/watch?v=eraxGPVNxYU","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/eraxGPVNxYU/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":10,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Hu Tao Vape team test","videoId":"AzBSmX6j8KM","videoUrl":"https://www.youtube.com/watch?v=AzBSmX6j8KM","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/AzBSmX6j8KM/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":11,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Epic Seven Rift One Shot Finally","videoId":"m4QOojooyY8","videoUrl":"https://www.youtube.com/watch?v=m4QOojooyY8","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/m4QOojooyY8/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":12,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Epic Seven Rift Almost One Shot","videoId":"kkdGWDMFzWA","videoUrl":"https://www.youtube.com/watch?v=kkdGWDMFzWA","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/kkdGWDMFzWA/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":13,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Weekly materials to buy Honkai Star Rail","videoId":"RBbCc4rmOpk","videoUrl":"https://www.youtube.com/watch?v=RBbCc4rmOpk","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/RBbCc4rmOpk/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":14,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"embers","videoId":"BXceNOjZIeQ","videoUrl":"https://www.youtube.com/watch?v=BXceNOjZIeQ","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/BXceNOjZIeQ/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":15,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Golem 13 one shot Epic Seven","videoId":"JWdTskHy9TE","videoUrl":"https://www.youtube.com/watch?v=JWdTskHy9TE","downloadStatus":true,"isAvailable":true,"fileName":"JWdTskHy9TE.mkv","thumbNailFile":"JWdTskHy9TE.webp","onlineThumbnail":"https://i.ytimg.com/vi/JWdTskHy9TE/maxresdefault.jpg","subTitleFile":null,"descriptionFile":"JWdTskHy9TE.description","isMetaDataSynced":true,"saveDirectory":"Screen recordings"}},{"positionInPlaylist":16,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"AP-5 Fast","videoId":"i0S9vlyQpig","videoUrl":"https://www.youtube.com/watch?v=i0S9vlyQpig","downloadStatus":true,"isAvailable":true,"fileName":"i0S9vlyQpig.mkv","thumbNailFile":"i0S9vlyQpig.webp","onlineThumbnail":"https://i.ytimg.com/vi/i0S9vlyQpig/maxresdefault.jpg","subTitleFile":null,"descriptionFile":"i0S9vlyQpig.description","isMetaDataSynced":true,"saveDirectory":"Screen recordings"}}],"saveDirectory":"Screen recordings"}
// 39. Check sublist sorting (The downloaded items should be in the front, don't care about the order in this)
// Req: {"start":0,"stop":8,"sortDownloaded":true,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh"}
// Res: {"count":17,"rows":[{"positionInPlaylist":15,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Golem 13 one shot Epic Seven","videoId":"JWdTskHy9TE","videoUrl":"https://www.youtube.com/watch?v=JWdTskHy9TE","downloadStatus":true,"isAvailable":true,"fileName":"JWdTskHy9TE.mkv","thumbNailFile":"JWdTskHy9TE.webp","onlineThumbnail":"https://i.ytimg.com/vi/JWdTskHy9TE/maxresdefault.jpg","subTitleFile":null,"descriptionFile":"JWdTskHy9TE.description","isMetaDataSynced":true,"saveDirectory":"Screen recordings"}},{"positionInPlaylist":16,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"AP-5 Fast","videoId":"i0S9vlyQpig","videoUrl":"https://www.youtube.com/watch?v=i0S9vlyQpig","downloadStatus":true,"isAvailable":true,"fileName":"i0S9vlyQpig.mkv","thumbNailFile":"i0S9vlyQpig.webp","onlineThumbnail":"https://i.ytimg.com/vi/i0S9vlyQpig/maxresdefault.jpg","subTitleFile":null,"descriptionFile":"i0S9vlyQpig.description","isMetaDataSynced":true,"saveDirectory":"Screen recordings"}},{"positionInPlaylist":3,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Honkai Star Rail Divergent Universe Without Any Blessings #honkaistarrail #gacha #stupid","videoId":"_RctoqTNOxY","videoUrl":"https://www.youtube.com/watch?v=_RctoqTNOxY","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/_RctoqTNOxY/sddefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":5,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Wuthering Waves 3.0 farming with old characters","videoId":"jIshu4rDzSI","videoUrl":"https://www.youtube.com/watch?v=jIshu4rDzSI","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/jIshu4rDzSI/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":6,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Varesa Pulls","videoId":"y6LfDaFl4yE","videoUrl":"https://www.youtube.com/watch?v=y6LfDaFl4yE","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/y6LfDaFl4yE/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":7,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Honkai Star Rail Unknown Domain Conundrum 1 Break Effect Team Specters Run","videoId":"Bwrhs5A7St0","videoUrl":"https://www.youtube.com/watch?v=Bwrhs5A7St0","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/Bwrhs5A7St0/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":8,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Honkai Star Rail Unknown Domain Conundrum 6 Follow-up Attack Team Specters Run","videoId":"EfPOsufW7JU","videoUrl":"https://www.youtube.com/watch?v=EfPOsufW7JU","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/EfPOsufW7JU/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":4,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","video_metadatum":{"title":"Arknights Endfield Exp Farm AFK","videoId":"0CEIEYgbxiY","videoUrl":"https://www.youtube.com/watch?v=0CEIEYgbxiY","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/0CEIEYgbxiY/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}}],"saveDirectory":"Screen recordings"}
// 40. Delete the recordings playlist - This will be used for the pruning step next
// Req: {"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0xCU1eANC_L365_RFj2YOh","deleteAllVideosInPlaylist":false,"deletePlaylist":true,"cleanUp":false}
// Res: {"status":"success","message":"Deleted playlist Screen recordings","cleanUp":false,"deletePlaylist":true,"deleteAllVideosInPlaylist":false}
// 41. Get Playlists (there should be none)
// Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Res: {"count":0,"rows":[]}
// 42. Immediatly check the sublist before the pruning happens
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"None"}
// Res: {"count":1,"rows":[{"positionInPlaylist":1,"playlistUrl":"None","video_metadatum":{"title":"Golem 13 one shot Epic Seven","videoId":"JWdTskHy9TE","videoUrl":"https://www.youtube.com/watch?v=JWdTskHy9TE","downloadStatus":true,"isAvailable":true,"fileName":"JWdTskHy9TE.mkv","thumbNailFile":"JWdTskHy9TE.webp","onlineThumbnail":"https://i.ytimg.com/vi/JWdTskHy9TE/maxresdefault.jpg","subTitleFile":null,"descriptionFile":"JWdTskHy9TE.description","isMetaDataSynced":true,"saveDirectory":"Screen recordings"}}],"saveDirectory":""}
// 43. Check the sublist after a minute (wait longer if pruning doesn't happen exactly in 1 min, the other videos got pruned but this remained)
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"None"}
// Res: {"count":2,"rows":[{"positionInPlaylist":1,"playlistUrl":"None","video_metadatum":{"title":"Golem 13 one shot Epic Seven","videoId":"JWdTskHy9TE","videoUrl":"https://www.youtube.com/watch?v=JWdTskHy9TE","downloadStatus":true,"isAvailable":true,"fileName":"JWdTskHy9TE.mkv","thumbNailFile":"JWdTskHy9TE.webp","onlineThumbnail":"https://i.ytimg.com/vi/JWdTskHy9TE/maxresdefault.jpg","subTitleFile":null,"descriptionFile":"JWdTskHy9TE.description","isMetaDataSynced":true,"saveDirectory":"Screen recordings"}},{"positionInPlaylist":2,"playlistUrl":"None","video_metadatum":{"title":"AP-5 Fast","videoId":"i0S9vlyQpig","videoUrl":"https://www.youtube.com/watch?v=i0S9vlyQpig","downloadStatus":true,"isAvailable":true,"fileName":"i0S9vlyQpig.mkv","thumbNailFile":"i0S9vlyQpig.webp","onlineThumbnail":"https://i.ytimg.com/vi/i0S9vlyQpig/maxresdefault.jpg","subTitleFile":null,"descriptionFile":"i0S9vlyQpig.description","isMetaDataSynced":true,"saveDirectory":"Screen recordings"}}],"saveDirectory":""}
// The next one are Tests for the None Playlist (Most of the playlists scenrios I can think of are done)
// 44. Adding a video that's already downloaded in the None playlist to None again
// Req: {"urlList":["https://www.youtube.com/watch?v=JWdTskHy9TE"],"chunkSize":9,"monitoringType":"N/A","sleep":true}
// Res: {"status":"success","message":"Listing initiated","items":[]}
// Note: The web socket event lets us know that it's already present in None and naigates us to it (Need to add WS tests, they do a lot of the heavy lifting in this, service)
// Something like this is recieved: 42["listing-single-item-complete",{"url":"https://www.youtube.com/watch?v=JWdTskHy9TE","type":"video","title":"Golem 13 one shot Epic Seven","status":"completed","processedChunks":1,"seekSubListTo":1,"alreadyExisted":true}]
// Need to investigate if this can be moved to the rest api now
// 45. Add another video the None playlist
// Req: {"urlList":["https://www.youtube.com/watch?v=dPiPWbkebEo"],"chunkSize":9,"monitoringType":"N/A","sleep":true}
// Res: {"status":"success","message":"Listing initiated","items":[{"url":"https://www.youtube.com/watch?v=dPiPWbkebEo","type":"undetermined","currentMonitoringType":"N/A","reason":"URL not found in database"}]}
// 46. Get None again
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"None"}
// Res: {"count":3,"rows":[{"positionInPlaylist":1,"playlistUrl":"None","video_metadatum":{"title":"Golem 13 one shot Epic Seven","videoId":"JWdTskHy9TE","videoUrl":"https://www.youtube.com/watch?v=JWdTskHy9TE","downloadStatus":true,"isAvailable":true,"fileName":"JWdTskHy9TE.mkv","thumbNailFile":"JWdTskHy9TE.webp","onlineThumbnail":"https://i.ytimg.com/vi/JWdTskHy9TE/maxresdefault.jpg","subTitleFile":null,"descriptionFile":"JWdTskHy9TE.description","isMetaDataSynced":true,"saveDirectory":"Screen recordings"}},{"positionInPlaylist":2,"playlistUrl":"None","video_metadatum":{"title":"AP-5 Fast","videoId":"i0S9vlyQpig","videoUrl":"https://www.youtube.com/watch?v=i0S9vlyQpig","downloadStatus":true,"isAvailable":true,"fileName":"i0S9vlyQpig.mkv","thumbNailFile":"i0S9vlyQpig.webp","onlineThumbnail":"https://i.ytimg.com/vi/i0S9vlyQpig/maxresdefault.jpg","subTitleFile":null,"descriptionFile":"i0S9vlyQpig.description","isMetaDataSynced":true,"saveDirectory":"Screen recordings"}},{"positionInPlaylist":3,"playlistUrl":"None","video_metadatum":{"title":"Laptop noises","videoId":"dPiPWbkebEo","videoUrl":"https://www.youtube.com/watch?v=dPiPWbkebEo","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/dPiPWbkebEo/sddefault.jpg?sqp=-oaymwEmCIAFEOAD8quKqQMa8AEB-AH-BIAC4AKKAgwIABABGEwgTihlMA8=&rs=AOn4CLB0Zmtw7No1Y0x4HV972eAB3-27RA","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}}],"saveDirectory":""}
// 47. Add the same video again
// Req: {"urlList":["https://www.youtube.com/watch?v=dPiPWbkebEo"],"chunkSize":9,"monitoringType":"N/A","sleep":true}
// {"status":"success","message":"Listing initiated","items":[{"url":"https://www.youtube.com/watch?v=dPiPWbkebEo","type":"undownloaded","currentMonitoringType":"N/A","reason":"Video not downloaded yet"}]}
// Note: The websocket again notifies that this video has been indexed before in the None playlisy naviagtes us to the postion
// 42["listing-single-item-complete",{"url":"https://www.youtube.com/watch?v=dPiPWbkebEo","type":"unlisted","title":"Laptop noises","status":"completed","processedChunks":1,"seekSubListTo":3,"alreadyExisted":true}]
// I don't remeber why I designed it like this TBH, becaue if we alreay have the VID in DB it should be O(1) op to check if it is in the playlist we are adding it to
// and then return the info in the response of the REST API call (but it works, so will fix it later for now lets keep it as it is)
// 48. Add a last playlist (For now it has one video but we can always add more - i plan to do so, don't assert the count or stuff)
// Req: {"urlList":["https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2TwKOK-_dXvPlzs1DktqFX"],"chunkSize":9,"monitoringType":"N/A","sleep":true}
// Res: {"status":"success","message":"Listing initiated","items":[{"url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2TwKOK-_dXvPlzs1DktqFX","type":"undetermined","currentMonitoringType":"N/A","reason":"URL not found in database"}]}
// 49. Get playlists
// Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Res: {"count":1,"rows":[{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2TwKOK-_dXvPlzs1DktqFX","title":"Engineering Stuff","sortOrder":0,"monitoringType":"N/A","saveDirectory":"Engineering Stuff","createdAt":"2026-04-19T07:34:39.172Z","updatedAt":"2026-04-19T07:34:39.172Z","lastUpdatedByScheduler":"2026-04-19T07:34:39.170Z"}]}
// 50. Get Subs:
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2TwKOK-_dXvPlzs1DktqFX"}
// Res: {"count":1,"rows":[{"positionInPlaylist":1,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2TwKOK-_dXvPlzs1DktqFX","video_metadatum":{"title":"IoT Based Servo Motor control using web browser ,NodeMCU ESP8266","videoId":"q5ipCw-lFHE","videoUrl":"https://www.youtube.com/watch?v=q5ipCw-lFHE","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/q5ipCw-lFHE/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}}],"saveDirectory":"Engineering Stuff"}
// 51. Unlink all the vids in this playlist
// Req: {"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2TwKOK-_dXvPlzs1DktqFX","deleteAllVideosInPlaylist":true,"deletePlaylist":false,"cleanUp":false}
// Res: {"status":"success","message":"Removed all video references from playlist Engineering Stuff","cleanUp":false,"deletePlaylist":false,"deleteAllVideosInPlaylist":true}
// 52. Get subs again
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2TwKOK-_dXvPlzs1DktqFX"}
// Res: {"count":0,"rows":[],"saveDirectory":"Engineering Stuff"}
// 53. Re-Index playlist - http://localhost:8888/ytdiff/reindexall
// Req: {"start":0,"stop":10,"chunkSize":8}
// Res: {"status":"success","message":"Queued 1 playlist(s) for re-indexing","queued":1,"total":1,"start":0,"stop":10,"chunkSize":8}
// Wait a littl bit before doing this
// 54. Get subs again
// Req:{"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2TwKOK-_dXvPlzs1DktqFX"}
// Res: {"count":1,"rows":[{"positionInPlaylist":1,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2TwKOK-_dXvPlzs1DktqFX","video_metadatum":{"title":"IoT Based Servo Motor control using web browser ,NodeMCU ESP8266","videoId":"q5ipCw-lFHE","videoUrl":"https://www.youtube.com/watch?v=q5ipCw-lFHE","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/q5ipCw-lFHE/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}}],"saveDirectory":"Engineering Stuff"}
// Note: The re-index all re-indexs all playlists in the defined range
// Also add tests for adding all those private, empty, deleted videos and playlists, just need to check if thes failures still update the playlist index (Known bug will fix)
// and the none  subist indexs are not mangled by the invalid vids
// Clean up just in case
// Delete the vids in sublist (one by one - probaly should add a way to delete multiple using the check boxes and stuff)
// 55. Clean up - None playlist
// Req 1: {"playListUrl":"None","videoUrls":["https://www.youtube.com/watch?v=dPiPWbkebEo"],"cleanUp":false,"deleteVideoMappings":true,"deleteVideosInDB":false}
// Res 1: {"message":"Processed 1 video(s) from playlist None","deleted":["https://www.youtube.com/watch?v=dPiPWbkebEo"],"failed":[],"cleanUp":false,"deleteVideoMappings":true,"deleteVideosInDB":false}
// Req 2: {"playListUrl":"None","videoUrls":["https://www.youtube.com/watch?v=i0S9vlyQpig"],"cleanUp":true,"deleteVideoMappings":true,"deleteVideosInDB":true}
// Res 2: {"message":"Processed 1 video(s) from playlist None","deleted":["https://www.youtube.com/watch?v=i0S9vlyQpig"],"failed":[],"cleanUp":true,"deleteVideoMappings":true,"deleteVideosInDB":true}
// Req 3: {"playListUrl":"None","videoUrls":["https://www.youtube.com/watch?v=JWdTskHy9TE"],"cleanUp":true,"deleteVideoMappings":true,"deleteVideosInDB":true}
// Res 3: {"message":"Processed 1 video(s) from playlist None","deleted":["https://www.youtube.com/watch?v=JWdTskHy9TE"],"failed":[],"cleanUp":true,"deleteVideoMappings":true,"deleteVideosInDB":true}
// 56. Get sub "None"
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"None"}
// Res: {"count":0,"rows":[],"saveDirectory":""}
// 57. Delete playlist
// Req: {"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2TwKOK-_dXvPlzs1DktqFX","deleteAllVideosInPlaylist":true,"deletePlaylist":true,"cleanUp":true}
// Res: {"status":"success","message":"Removed all video references from playlist Engineering Stuff and deleted playlist and cleaned up playlist directory","cleanUp":true,"deletePlaylist":true,"deleteAllVideosInPlaylist":true}
// 58. Get play
// Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Res: {"count":0,"rows":[]}
// TODO: Test adding muliple playlists and videos to None together (so that we can verify the categorization and streaming of updates)
// Web socket event also need validation
// 59. Get Files
// Req: {"files":[{"saveDirectory":"","fileName":"hy3nSugZh1Y.webp"},{"saveDirectory":"","fileName":"FArOcK-HzXo.webp"},{"saveDirectory":"","fileName":"paFelc1vM1k.webp"},{"saveDirectory":"","fileName":"va-4BypzDQo.webp"}]}
// Res: {"status":"success","files":{"hy3nSugZh1Y.webp":"1aa11997-8117-413c-b4ef-446a4f5bc3da","FArOcK-HzXo.webp":"3799f080-764c-4592-b182-2fa260e20c76","paFelc1vM1k.webp":"3533b08b-7394-4149-a830-956fa8e1513b","va-4BypzDQo.webp":"6312d140-7f6d-4e58-a332-b4c7ebc462c1"}}
// 60. Get file:
// Req: {"saveDirectory":"","fileName":"hy3nSugZh1Y.webm"}
// Res: {"status":"success","signedUrlId":"5fe8ff62-9e12-4e4a-9ac0-c345e2996b36","expiry":1776595254060}
// 61. Refresh File - Forgot How this works, I'll get back to this later
// Refresh File Req: {"fileId":"5fe8ff62-9e12-4e4a-9ac0-c345e2996b36"}
// Refresh File Res: {"status":"success","expiry":1776595554116}
// Note: There are 60 steps, Refresh file was added twice one at first but I couldn't remeber how it worked so I add it at the bottom.
