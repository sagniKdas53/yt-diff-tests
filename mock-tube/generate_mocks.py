import os
import subprocess

base_dir = "mock-tube/public"
os.makedirs(f"{base_dir}/playlists", exist_ok=True)
os.makedirs(f"{base_dir}/videos", exist_ok=True)

def create_video(name):
    path = f"{base_dir}/videos/{name}"
    if not os.path.exists(path):
        print(f"Creating {name}...")
        subprocess.run(["ffmpeg", "-f", "lavfi", "-i", "color=c=black:s=16x16:d=1", "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p", path, "-y"], capture_output=True)

def create_rss(name, title, videos, skip_videos=None):
    if skip_videos is None:
        skip_videos = set()
    path = f"{base_dir}/playlists/{name}"
    items = ""
    for i, vid in enumerate(videos):
        if vid not in skip_videos:
            create_video(vid)
        items += f"""
  <item>
    <title>{vid} - {title}</title>
    <link>https://mock-tube/videos/{vid}</link>
    <enclosure url="https://mock-tube/videos/{vid}" length="2237" type="video/mp4" />
  </item>"""
    
    content = f"""<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>{title}</title>
  <link>https://mock-tube/playlists/{name}?list=1</link>
  <description>Mock for {title}</description>{items}
</channel>
</rss>"""
    with open(path, "w") as f:
        f.write(content)

# Suite 1: Dup Test (2 identical items)
create_rss("dup-test-1.rss", "Dup Test", ["video-dup.mp4", "video-dup.mp4"])

# Suite 2: Dup Test 2 (1 item overlapping)
create_rss("dup-test-2.rss", "Dup Test 2", ["video-dup.mp4"])

# Suite 3: E7 Shorts
create_rss("e7-shorts.rss", "E7 Shorts", ["video-e7-1.mp4", "video-e7-2.mp4"])

# Suite 4: Screen recordings (17 items)
create_rss("big-playlist.rss", "Screen recordings", [f"video-big-{i}.mp4" for i in range(1, 18)])

# Suite 7: Engineering Stuff
create_rss("engineering-playlist.rss", "Engineering Stuff", ["video-engineering.mp4"])

# Suite 11: Failed Playlist Bootstrap (Empty playlist to simulate missing items)
create_rss("failed-playlist.rss", "Failed Playlist", [])

# Single videos for Suite 6
create_video("video-single.mp4")

# Other potentially needed videos
create_video("video-public.mp4")
create_video("video-unlisted.mp4")

# Suite 13: Private First Item (first video is 404, simulates private/deleted)
# NOTE: video-nonexistent.mp4 is intentionally NOT created — its 404 response
# is what causes yt-dlp to fail on it, simulating a private/deleted video.
create_rss("private-first-item.rss", "Private First Item Playlist", ["video-nonexistent.mp4", "video-public.mp4", "video-unlisted.mp4"], skip_videos={"video-nonexistent.mp4"})

# Suite 14: Start/End incremental shift updates.
# Only the v1 states are committed. The E2E suite rewrites each RSS mid-run
# (prepend for Start, append/delete for End) and restores v1 afterwards, so
# the same playlist URL is observed shifting under the updater — which is
# exactly the scenario static fixtures cannot express.
SHIFT_BASE = [f"video-shift-s{i:02d}.mp4" for i in range(1, 11)]

# TC-14.1/14.2: Start playlist, 10 items; the test prepends 3.
create_rss("start-shift.rss", "Shift Startcast", SHIFT_BASE)

# TC-14.3/14.4: Start playlist, 10 items; the test prepends 12 (more than the
# chunk size of 10), so the first chunk is all-new and the anchor only
# appears in the second chunk.
create_rss("start-shift-big.rss", "Shift Startcast Big", SHIFT_BASE)

# TC-14.5/14.6/14.7: End playlist, 11 items; the test appends 10 (mirroring a
# real 11 -> 21 catch-up) and then deletes 2 from the head.
create_rss(
    "end-append.rss",
    "Shift Endcast",
    [f"video-shift-e{i:02d}.mp4" for i in range(1, 12)],
)

# All videos the Suite 14 v2/v3 states reference. create_video is a no-op for
# files that already exist, so re-running this script is safe.
for _vid in (
    [f"video-shift-n{i:02d}.mp4" for i in range(1, 4)]
    + [f"video-shift-m{i:02d}.mp4" for i in range(1, 13)]
    + [f"video-shift-e{i:02d}.mp4" for i in range(12, 22)]
):
    create_video(_vid)

print("Done.")
