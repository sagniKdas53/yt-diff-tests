import os
import subprocess

base_dir = "tests/mock-tube/public"
os.makedirs(f"{base_dir}/playlists", exist_ok=True)
os.makedirs(f"{base_dir}/videos", exist_ok=True)

def create_video(name):
    path = f"{base_dir}/videos/{name}"
    if not os.path.exists(path):
        print(f"Creating {name}...")
        subprocess.run(["ffmpeg", "-f", "lavfi", "-i", "color=c=black:s=16x16:d=1", "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p", path, "-y"], capture_output=True)

def create_rss(name, title, videos):
    path = f"{base_dir}/playlists/{name}"
    items = ""
    for i, vid in enumerate(videos):
        create_video(vid)
        items += f"""
  <item>
    <title>{vid} - {title}</title>
    <link>http://mock-tube:80/videos/{vid}</link>
    <enclosure url="http://mock-tube:80/videos/{vid}" length="2237" type="video/mp4" />
  </item>"""
    
    content = f"""<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>{title}</title>
  <link>http://mock-tube:80/playlists/{name}?list=1</link>
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

print("Done.")
