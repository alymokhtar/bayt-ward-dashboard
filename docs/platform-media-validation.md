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

## Platform derivatives

The source upload is retained in Cloudinary. Before a post is created, the editor shows per-platform framing previews and requires approval. **Fit** is the default and preserves the whole frame with padding; **Crop** fills the destination frame and may remove edge content. The chosen mode is stored with the post and reused on retries.

At publish time, public Cloudinary transformation URLs are generated only for targets that need a derivative:

- Instagram images become JPEG, optimized, and framed at 4:5; Reels become H.264/AAC MP4 at 1080×1920.
- Snapchat images become JPEG and Story/Spotlight videos become H.264/AAC MP4 at 1080×1920.
- Facebook images are converted/resized to JPEG only when the source is WebP or exceeds the dashboard image-size rule. GIF is not flattened.
- TikTok and YouTube continue to receive the original video. Facebook video continues to receive the original.

The UI preview uses the selected local file with the same target frame and fit/crop behavior; Cloudinary performs the final encode when the platform fetches the generated URL. The original upload is not overwritten. Transformations are on-demand Cloudinary deliveries and count against the Cloudinary account's transformation/usage plan.

Video duration and dimensions come from the local media preview for the pre-upload check, then from Cloudinary's asset metadata for server checks. The server applies video duration checks only where the selected platform has a known minimum or maximum; TikTok's maximum is creator-account-dependent. Instagram and Snapchat videos receive a 1080×1920 derivative using the selected Fit/Crop framing, so the original video's dimensions do not cause a false rejection. Their required duration limits remain enforced whenever a duration is available. When Cloudinary has not finished exposing video duration metadata, confirmation retries the Admin API briefly and the browser retries up to 12 times at 3-second intervals. On the final attempt only, duration metadata that is still missing may be bypassed if Cloudinary has verified a valid asset and HTTPS delivery URL; explicit durations outside platform limits remain rejected. The same unknown-only exception is applied when saving and publishing, while browser-side local duration checks remain in force. Failed permanent validation responses include structured details, and server logs record platform, media metadata, and exact failed checks without logging credentials or signed URLs. Cloudinary's verified asset byte count is authoritative; a mismatch with the browser's reported size is logged but does not reject a file that otherwise meets the server-side policy.

The separate legacy multipart endpoint at `/api/youtube/upload` is not used by the dashboard and retains its own 100 MB request limit; dashboard uploads use the Cloudinary flow above.

## Official references

- [Instagram Content Publishing](https://developers.facebook.com/documentation/instagram-platform/content-publishing)
- [TikTok Content Posting API — Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post)
- [TikTok Content Posting API — Media Transfer](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide)
- [YouTube videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert)
- [YouTube supported upload formats and limits](https://support.google.com/youtube/answer/1722171)
- [Facebook Video API publishing](https://developers.facebook.com/documentation/video-api/guides/publishing)
- [Cloudinary chunked asset uploads](https://cloudinary.com/documentation/upload_images#chunked_asset_upload)
- [Cloudinary image transformations](https://cloudinary.com/documentation/image_transformations)
- [Cloudinary video transformations](https://cloudinary.com/documentation/video_manipulation_and_delivery)
