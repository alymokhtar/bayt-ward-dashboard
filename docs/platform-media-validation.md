# Platform media validation

The dashboard applies these rules before direct upload, verifies the actual Cloudinary asset before saving a post, and repeats the blocking checks immediately before publishing. When several platforms are selected, the asset must satisfy every selected platform.

| Platform | Accepted media in this dashboard | Blocking constraints |
| --- | --- | --- |
| Instagram | JPEG image; MP4 or MOV Reel | Images are limited to 8 MB (decimal; therefore below 8 MiB) and must have a 4:5–1.91:1 aspect ratio. Reels must be 3 seconds to 15 minutes, no larger than 300 MB, no wider than 1920 pixels, and within 0.01:1–10:1. A 9:16 vertical ratio is recommended and shown as a warning, not a rejection. |
| Snapchat Story | JPEG/PNG image or MP4 video | Videos must be 5–60 seconds, at least 540×960 pixels, and no larger than the adapter's 100 MiB transfer limit. |
| Snapchat Spotlight | MP4 video | Videos must be 6–60 seconds, at least 540×960 pixels, and no larger than the adapter's 100 MiB transfer limit. |
| TikTok | MP4, MOV, or WebM video | The connected creator's current maximum duration is queried from TikTok and enforced. The dashboard applies a separate 4 GB transfer ceiling; TikTok's upload protocol specifies sequential chunks of 5–64 MB (up to 128 MB for the final chunk), with at most 1000 chunks, but does not publish a single general file-size maximum in the cited transfer guide. |
| YouTube | MP4, MOV, or WebM video | No longer than 12 hours and no larger than 256 GB. No fixed minimum duration is imposed by the API rules used here. |
| Facebook Page | JPEG/PNG/GIF image; MP4 or MOV video | Images are limited to 10 MiB. Videos are limited to 240 minutes and 10 GB; this Page-video endpoint has no minimum duration rule in this validator. |

There is no longer one shared 10/100 MiB upload ceiling for dashboard media. The allowed MIME types and maximum size are intersected across the selected platforms. The TikTok 4 GB ceiling and Snapchat 100 MiB ceiling are application/adapter safeguards, not official provider-wide maximums. Cloudinary uploads larger than 20 MiB use its signed chunked Upload API. Cloudinary account limits, provider changes, and API eligibility rules can still be stricter than these client-side rules; server-side validation and the destination API remain authoritative.

Video duration and dimensions come from the local media preview for the pre-upload check, then from Cloudinary's asset metadata for server checks. TikTok duration is account-dependent. Snapchat's Story/Spotlight duration and minimum-dimension requirements are checked on the server as well.

The separate legacy multipart endpoint at `/api/youtube/upload` is not used by the dashboard and retains its own 100 MB request limit; dashboard uploads use the Cloudinary flow above.

## Official references

- [Instagram Content Publishing](https://developers.facebook.com/documentation/instagram-platform/content-publishing)
- [TikTok Content Posting API — Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post)
- [TikTok Content Posting API — Media Transfer](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide)
- [YouTube videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert)
- [YouTube supported upload formats and limits](https://support.google.com/youtube/answer/1722171)
- [Facebook Video API publishing](https://developers.facebook.com/documentation/video-api/guides/publishing)
- [Cloudinary chunked asset uploads](https://cloudinary.com/documentation/upload_images#chunked_asset_upload)
