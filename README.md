This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## YouTube video uploads

Configure `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, and `YOUTUBE_REDIRECT_URI` (the exact callback URL ending in `/api/auth/youtube/callback`) on the server. The authenticated admin can connect a channel from Settings, then choose YouTube while creating a post. YouTube OAuth tokens are encrypted at rest using the configured `META_TOKEN_ENCRYPTION_KEY` (base64-encoded 32-byte key material). The standalone upload endpoint accepts multipart fields `file`, `title`, and `description`; `tags` is optional (comma-separated, repeated, or a JSON array), and `privacyStatus` may be `public` or `unlisted` (default: `unlisted`). It loads and refreshes stored credentials server-side.

Keep `META_TOKEN_ENCRYPTION_KEY` backed up and out of source control; changing it makes saved Meta and YouTube tokens unreadable. Apply database changes with `npx prisma migrate deploy` before deploying the new app version. The migration clears any old manually entered YouTube access token, so reconnect the channel through OAuth after migration.

The standalone endpoint responds with `videoId` and the YouTube watch `url`. Dashboard video uploads are limited to 100 MiB; file size limits for deployments may be lower than the platform's YouTube API limit. Use HTTPS in deployed environments.

## TikTok Content Posting

Configure `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, and `TIKTOK_REDIRECT_URI` on the server. Register the exact HTTPS callback URL ending in `/api/auth/tiktok/callback` in TikTok Login Kit. Use `https://<fixed-https-tunnel-host>/api/auth/tiktok/callback` for local testing and `https://<production-domain>/api/auth/tiktok/callback` for production; TikTok web Login Kit does not accept plain HTTP localhost callbacks. Enable the Content Posting API and request `user.info.basic` and `video.publish` for Direct Post. TikTok OAuth access and refresh tokens are encrypted at rest using `META_TOKEN_ENCRYPTION_KEY`.

Apply the TikTok database migration with `npx prisma migrate deploy`. In the dashboard, connect the account from Settings, select TikTok when creating a video post, choose one of the creator's currently available privacy settings, and confirm the publish action. The app uploads the video in sequential chunks and checks TikTok's asynchronous publish status. Videos sent via an unaudited Content Posting API client may be restricted to private viewing by TikTok; complete TikTok's app audit before expecting public distribution.

In TikTok Sandbox, `unaudited_client_can_only_post_to_private_accounts` refers to the connected TikTok account's account-level privacy setting, not only the post's `privacy_level`. Set the TikTok account itself to Private for sandbox tests; choosing `SELF_ONLY` (`أنا فقط`) sets the video's audience but does not change the account's privacy setting.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
-------------------------------