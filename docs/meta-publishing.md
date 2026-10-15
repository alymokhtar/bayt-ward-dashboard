# Meta publishing setup

The dashboard currently sends selected Facebook Page and Instagram Business posts immediately after saving them. TikTok, YouTube, and Snapchat remain stored as pending selections; their publishing adapters are not implemented.

## Server environment

Configure these values in `.env.local` and in the production host's secret manager. Never commit actual values:

- `ADMIN_PASSWORD`: a unique administrator password with at least 6 characters. Six-character passwords are substantially easier to guess; use a long, unique password for production.
- `ADMIN_SESSION_SECRET`: a cryptographically random secret with at least 32 characters. Generate one with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Rotating it invalidates active admin sessions.
- `META_TOKEN_ENCRYPTION_KEY`: a base64-encoded 32-byte key. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Back it up securely; changing it makes the stored Meta token undecryptable.
- `META_GRAPH_API_VERSION`: the supported version configured for the Meta app, in `vNN.N` format.

Apply the database migration before deploying the application:

```powershell
npm run db:deploy
npx prisma generate
```

## Meta app requirements

1. Create/configure a Meta app and add the Facebook Login and Instagram Graph API products required by Meta for the app.
2. Use a Facebook Page owned by the app's business and an Instagram **Professional** account linked to that Page.
3. Obtain a Page Access Token for that Page with the permissions currently required by Meta for Page publishing and Instagram content publishing. Common permissions include `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, and `instagram_content_publish`; verify the current requirements and app-review status in Meta's developer dashboard before production use.
4. Paste the Page Access Token into Settings → Social accounts. The app encrypts it with AES-256-GCM before storing it in Neon and never returns the token to the browser.
5. Keep the Facebook Page ID in the Facebook Page ID field. The Instagram field may contain the account's username; when it is not numeric, publishing looks up the linked Instagram Business Account ID through the Page. You can instead enter the numeric Business Account ID.
6. Create a test image or video post, select Facebook and/or Instagram, and submit it. The dashboard records the result and Meta post ID separately for each platform. Failed platforms can be retried from the post history; already-published platforms are not republished by that retry. If a network timeout leaves a platform marked as requiring verification, confirm on Meta first; the system intentionally blocks an automatic retry that could create a duplicate.

Instagram images publish as image posts and videos as Reels. Facebook images use the Page photos endpoint and videos use the Page videos endpoint. Meta media processing and permissions may vary by account, media type, and API version.

## Authentication and deployment

All dashboard routes, settings APIs, and server-side mutations require the single administrator session. Login is rate-limited by client IP in Neon (eight failures within 15 minutes trigger a 15-minute lockout). The production reverse proxy must set a trustworthy `x-real-ip` or append the client address to `x-forwarded-for`.

Do not enable the dashboard on an untrusted public hostname. Use HTTPS in production, configure the environment variables and migration first, and verify token permissions with a non-sensitive test post. A network timeout after Meta accepted a post can leave the result uncertain; verify the Page/Instagram account before manually retrying in that case.
