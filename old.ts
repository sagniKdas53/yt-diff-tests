// Done till above
// Next steps
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
// 7. Delete only the dowloaded file -> Refetch the sub list to see if the files truly got deleted
// Delete File Req: {"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","videoUrls":["https://www.youtube.com/watch?v=PexSJ31niEI"],"cleanUp":true,"deleteVideoMappings":false,"deleteVideosInDB":false}
// Delete File Res: {"message":"Processed 1 video(s) from playlist Dup Test","deleted":["https://www.youtube.com/watch?v=PexSJ31niEI"],"failed":[],"cleanUp":true,"deleteVideoMappings":false,"deleteVideosInDB":false}
// 8. Get the subList again after delete and assert that the downloaded files are deleted and
// SubList Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw"}
// SubList Res: {"count":2,"rows":[{"positionInPlaylist":1,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","video_metadatum":{"title":"Run Immich through a docker container on Tailscale","videoId":"PexSJ31niEI","videoUrl":"https://www.youtube.com/watch?v=PexSJ31niEI","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/PexSJ31niEI/sddefault.jpg?sqp=-oaymwEmCIAFEOAD8quKqQMa8AEB-AHSBoAC4AOKAgwIABABGFkgWShZMA8=&rs=AOn4CLAcuWHiDO7IaUGPtoIc2p9V4odxhg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":true,"saveDirectory":null}},{"positionInPlaylist":2,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","video_metadatum":{"title":"Run Immich through a docker container on Tailscale","videoId":"PexSJ31niEI","videoUrl":"https://www.youtube.com/watch?v=PexSJ31niEI","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/PexSJ31niEI/sddefault.jpg?sqp=-oaymwEmCIAFEOAD8quKqQMa8AEB-AHSBoAC4AOKAgwIABABGFkgWShZMA8=&rs=AOn4CLAcuWHiDO7IaUGPtoIc2p9V4odxhg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":true,"saveDirectory":null}}],"saveDirectory":"Dup Test"}
// 9. Finally delete a single video from a playlist (since both videos are same they both get delted, will fix this later add as an issue for now)
// Delete Vide Req: {"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","videoUrls":["https://www.youtube.com/watch?v=PexSJ31niEI"],"cleanUp":false,"deleteVideoMappings":true,"deleteVideosInDB":false}
// Delete Video Res: {"message":"Processed 1 video(s) from playlist Dup Test","deleted":["https://www.youtube.com/watch?v=PexSJ31niEI"],"failed":[],"cleanUp":false,"deleteVideoMappings":true,"deleteVideosInDB":false}
// 10. Change the monitoring type of a playlist
// Watch Req: {"url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","watch":"Full"}
// Watch Res: {"status":"success","message":"Monitoring type updated successfully"}
// 11. Get the playlists again to see the change in the monitting type
// Get Play Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Get Play Res: {"count":1,"rows":[{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","title":"Dup Test","sortOrder":0,"monitoringType":"Full","saveDirectory":"Dup Test","createdAt":"2026-04-18T12:34:21.994Z","updatedAt":"2026-04-18T12:34:21.994Z","lastUpdatedByScheduler":"2026-04-18T12:34:21.990Z"}]}
// 12. Delete the playlist
// Delete Play Req: {"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0YkYoOLFmrbhsVWfAjCLZw","deleteAllVideosInPlaylist":false,"deletePlaylist":true,"cleanUp":false}
// Delete Play Res: {"status":"success","message":"Deleted playlist Dup Test","cleanUp":false,"deletePlaylist":true,"deleteAllVideosInPlaylist":false}
// =================This can be optomized further===========================
// 13. Add Dup Test 2 Playlist
// List Req: {"urlList":["https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY"],"chunkSize":9,"monitoringType":"N/A","sleep":true}
// List Res: {"status":"success","message":"Listing initiated","items":[{"url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY","type":"undetermined","currentMonitoringType":"N/A","reason":"URL not found in database"}]}
// 14. Get Play for the new playlist (there should be only one item this one at this point)
// Get Play Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Get Play Res: {"count":1,"rows":[{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY","title":"Dup Test 2","sortOrder":0,"monitoringType":"N/A","saveDirectory":"Dup Test 2","createdAt":"2026-04-18T13:29:04.184Z","updatedAt":"2026-04-18T13:29:04.184Z","lastUpdatedByScheduler":"2026-04-18T13:29:04.180Z"}]}
// 15. Get the sub list for this playlist (there should be only one item as there is only one item in this playlist)
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY"}
// Res: {"count":1,"rows":[{"positionInPlaylist":1,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY","video_metadatum":{"title":"Run Immich through a docker container on Tailscale","videoId":"PexSJ31niEI","videoUrl":"https://www.youtube.com/watch?v=PexSJ31niEI","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/PexSJ31niEI/sddefault.jpg?sqp=-oaymwEmCIAFEOAD8quKqQMa8AEB-AHSBoAC4AOKAgwIABABGFkgWShZMA8=&rs=AOn4CLAcuWHiDO7IaUGPtoIc2p9V4odxhg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}}],"saveDirectory":"Dup Test 2"}
// 16. Unlink the videos in this playlist (del play)
// Del play Req: {"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY","deleteAllVideosInPlaylist":true,"deletePlaylist":false,"cleanUp":false}
// Del play Res: {"status":"success","message":"Removed all video references from playlist Dup Test 2","cleanUp":false,"deletePlaylist":false,"deleteAllVideosInPlaylist":true}
// 17. Add the Unlisted playlist
// Req: {"urlList":["https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs"],"chunkSize":9,"monitoringType":"N/A","sleep":true}
// Res: {"status":"success","message":"Listing initiated","items":[{"url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","type":"undetermined","currentMonitoringType":"N/A","reason":"URL not found in database"}]}
// 18. Get Playlists (there should be two items now)
// Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Res: {"count":2,"rows":[{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY","title":"Dup Test 2","sortOrder":0,"monitoringType":"N/A","saveDirectory":"Dup Test 2","createdAt":"2026-04-18T13:29:04.184Z","updatedAt":"2026-04-18T13:29:04.184Z","lastUpdatedByScheduler":"2026-04-18T13:29:04.180Z"},{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","title":"E7 Shorts","sortOrder":1,"monitoringType":"N/A","saveDirectory":"E7 Shorts","createdAt":"2026-04-18T13:34:46.517Z","updatedAt":"2026-04-18T13:34:46.517Z","lastUpdatedByScheduler":"2026-04-18T13:34:46.515Z"}]}
// 19. Get sub for the unlisted playlist
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs"}
// Res: {"count":2,"rows":[{"positionInPlaylist":1,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","video_metadatum":{"title":"Good Pets Epic Seven","videoId":"kr2lsFN_aM8","videoUrl":"https://www.youtube.com/watch?v=kr2lsFN_aM8","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/kr2lsFN_aM8/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":2,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","video_metadatum":{"title":"Screenrecording 20201222 143136 com stove epic7 google","videoId":"h0OdOdLtuQM","videoUrl":"https://www.youtube.com/watch?v=h0OdOdLtuQM","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/h0OdOdLtuQM/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}}],"saveDirectory":"E7 Shorts"}
// 20. Delete everthing for the unlisted playlist
// Req: {"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","deleteAllVideosInPlaylist":true,"deletePlaylist":true,"cleanUp":true}
// Res: {"status":"success","message":"Removed all video references from playlist E7 Shorts and deleted playlist and cleaned up playlist directory","cleanUp":true,"deletePlaylist":true,"deleteAllVideosInPlaylist":true}
// 21. Get Playlists again (Now there should be one playlist, the dup test 2 playlist)
// Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Res: {"count":1,"rows":[{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY","title":"Dup Test 2","sortOrder":0,"monitoringType":"N/A","saveDirectory":"Dup Test 2","createdAt":"2026-04-18T13:29:04.184Z","updatedAt":"2026-04-18T13:29:04.184Z","lastUpdatedByScheduler":"2026-04-18T13:29:04.180Z"}]}
// 22. Delete the dup test 2 playlist
// Req: {"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY","deleteAllVideosInPlaylist":true,"deletePlaylist":true,"cleanUp":true}
// Res: {"status":"success","message":"Removed all video references from playlist Dup Test 2 and deleted playlist and cleaned up playlist directory","cleanUp":true,"deletePlaylist":true,"deleteAllVideosInPlaylist":true}
// 23. Get Playlists again (there should be no playlists now)
// Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Res: {"count":0,"rows":[]}
// ++++++++++++++++++++++++++
// 13. Get Playlists again (there should be no playlists now)
// Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Res: {"count":0,"rows":[]}
// 14. Add the Unlisted playlist
// Req: {"urlList":["https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs"],"chunkSize":9,"monitoringType":"N/A","sleep":true}
// Res: {"status":"success","message":"Listing initiated","items":[{"url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","type":"undetermined","currentMonitoringType":"N/A","reason":"URL not found in database"}]}
// 15. Get Playlists (there should be one items now)
// Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Res: {"count":1,"rows":[{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","title":"E7 Shorts","sortOrder":0,"monitoringType":"N/A","saveDirectory":"E7 Shorts","createdAt":"2026-04-18T13:44:23.158Z","updatedAt":"2026-04-18T13:44:23.158Z","lastUpdatedByScheduler":"2026-04-18T13:44:23.155Z"}]}
// 16. Get sub for the unlisted playlist (there should be 2 items)
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs"}
// Res: {"count":2,"rows":[{"positionInPlaylist":1,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","video_metadatum":{"title":"Good Pets Epic Seven","videoId":"kr2lsFN_aM8","videoUrl":"https://www.youtube.com/watch?v=kr2lsFN_aM8","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/kr2lsFN_aM8/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}},{"positionInPlaylist":2,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","video_metadatum":{"title":"Screenrecording 20201222 143136 com stove epic7 google","videoId":"h0OdOdLtuQM","videoUrl":"https://www.youtube.com/watch?v=h0OdOdLtuQM","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/h0OdOdLtuQM/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}}],"saveDirectory":"E7 Shorts"}
// 17. Unlink the first video in the sub list
// Req: {"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","videoUrls":["https://www.youtube.com/watch?v=kr2lsFN_aM8"],"cleanUp":false,"deleteVideoMappings":true,"deleteVideosInDB":false}
// Res: {"message":"Processed 1 video(s) from playlist E7 Shorts","deleted":["https://www.youtube.com/watch?v=kr2lsFN_aM8"],"failed":[],"cleanUp":false,"deleteVideoMappings":true,"deleteVideosInDB":false}
// 18. Get sub for the unlisted playlist (there should be 1 item)
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs"}
// Res: {"count":1,"rows":[{"positionInPlaylist":2,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","video_metadatum":{"title":"Screenrecording 20201222 143136 com stove epic7 google","videoId":"h0OdOdLtuQM","videoUrl":"https://www.youtube.com/watch?v=h0OdOdLtuQM","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/h0OdOdLtuQM/maxresdefault.jpg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}}],"saveDirectory":"E7 Shorts"}
// 19. Delete the last video in the sub list
// Req: {"playListUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","videoUrls":["https://www.youtube.com/watch?v=h0OdOdLtuQM"],"cleanUp":true,"deleteVideoMappings":true,"deleteVideosInDB":true}
// Res: {"message":"Processed 1 video(s) from playlist E7 Shorts","deleted":["https://www.youtube.com/watch?v=h0OdOdLtuQM"],"failed":[],"cleanUp":true,"deleteVideoMappings":true,"deleteVideosInDB":true}
// 20. Get sub for the unlisted playlist (there should be 0 items)
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs"}
// Res: {"count":0,"rows":[]}
// We are not deleting E7 Shorts yet, it will be used for full clean up later
// 21. Add Dup test 2 playlist
// Req: {"urlList":["https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY"],"chunkSize":9,"monitoringType":"N/A","sleep":true}
// Res: {"status":"success","message":"Listing initiated","items":[{"url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY","type":"undetermined","currentMonitoringType":"N/A","reason":"URL not found in database"}]}
// 22. Get playlists (there should be two playlists now)
// Req: {"start":0,"stop":10,"sort":"1","order":"1","query":""}
// Res: {"count":2,"rows":[{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj0iN_y58yjymtLFKC9qULfs","title":"E7 Shorts","sortOrder":0,"monitoringType":"N/A","saveDirectory":"E7 Shorts","createdAt":"2026-04-18T13:44:23.158Z","updatedAt":"2026-04-18T13:44:23.158Z","lastUpdatedByScheduler":"2026-04-18T13:44:23.155Z"},{"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY","title":"Dup Test 2","sortOrder":1,"monitoringType":"N/A","saveDirectory":"Dup Test 2","createdAt":"2026-04-18T13:52:27.801Z","updatedAt":"2026-04-18T13:52:27.801Z","lastUpdatedByScheduler":"2026-04-18T13:52:27.798Z"}]}
// 23. Get the sub list for "dup test 2" playlist (it should have only one item)
// Req: {"start":0,"stop":8,"sortDownloaded":false,"query":"","url":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY"}
// Res: {"count":1,"rows":[{"positionInPlaylist":1,"playlistUrl":"https://www.youtube.com/playlist?list=PL4Oo6H2hGqj2fQCpmX2zfytLqD2Qv7yZY","video_metadatum":{"title":"Run Immich through a docker container on Tailscale","videoId":"PexSJ31niEI","videoUrl":"https://www.youtube.com/watch?v=PexSJ31niEI","downloadStatus":false,"isAvailable":true,"fileName":null,"thumbNailFile":null,"onlineThumbnail":"https://i.ytimg.com/vi/PexSJ31niEI/sddefault.jpg?sqp=-oaymwEmCIAFEOAD8quKqQMa8AEB-AHSBoAC4AOKAgwIABABGFkgWShZMA8=&rs=AOn4CLAcuWHiDO7IaUGPtoIc2p9V4odxhg","subTitleFile":null,"descriptionFile":null,"isMetaDataSynced":false,"saveDirectory":null}}],"saveDirectory":"Dup Test 2"}
