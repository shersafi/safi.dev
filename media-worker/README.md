# Safi Media Worker

Separate Cloudflare Worker for MP4 uploads, R2 storage, native `.mp4` links, and basic session logging.

Intended hostname:

```txt
https://media.safi.dev
```

## What It Does

- Serves a private drag-and-drop uploader at `/upload`.
- Uploads MP4 files to an R2 bucket.
- Returns a native Discord-friendly URL like `/v/example-abc123.mp4`.
- Serves MP4 files through the Worker with byte-range support.
- Logs grouped 30-minute view sessions to D1, including IP, user agent, referer, country, colo, ASN, and request count.
- Flags sessions as likely human, Discord preview, Discord proxy, bot, or unknown using user agent and Cloudflare ASN metadata.

## Important Limits

- The simple upload path is limited by Cloudflare's request body limit. Free and Pro zones are currently 100 MB.
- This does not compress videos. It assumes you upload the final MP4.
- IP logging only sees requests that actually hit this Worker. Discord may proxy or prefetch some media, so logged IPs can be Discord infrastructure rather than the human viewer.
- The Discord proxy/preview flags are best-effort heuristics. `Discordbot` user agents and Discord-owned ASN organizations are high confidence; browser-looking requests are only marked as likely human.

## Setup

You do not need to push to GitHub before deploying. From this directory:

```bash
npm install
npx wrangler login
npx wrangler r2 bucket create safi-media
npx wrangler d1 create safi-media
```

Copy the created D1 `database_id` into `wrangler.jsonc`.

Apply the database migration:

```bash
npm run d1:migrate
```

Deploy the Worker once. This creates the `safi-media` Worker in Cloudflare:

```bash
npm run deploy
```

Set the uploader token after the Worker exists:

```bash
npx wrangler secret put MEDIA_ADMIN_TOKEN
```

The `wrangler.jsonc` file is configured with a custom domain route for `media.safi.dev`. If that hostname already has a DNS record, remove it first or add the custom domain through the Cloudflare dashboard under Workers & Pages > safi-media > Settings > Domains & Routes.

## Local Development

```bash
npm run d1:migrate:local
npm run dev
```

Local R2/D1 data is stored by Wrangler locally. Remote production data is only used with `--remote` commands.
