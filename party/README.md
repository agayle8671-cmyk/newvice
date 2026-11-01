# LeonidaVice V3 — Cloudflare Durable Objects Room Server (`party/`)

Authoritative edge room coordinator powered by Cloudflare Workers Durable Objects (`partyserver`) with WebSocket Hibernation, `<50ms` playback clock synchronization, `100ms` differential delta batching, `30s` alarm-based batched Supabase persistence (**99% database write reduction**), and zero-egress `/proxy-media` CORS byte-range streaming.

## Local Development

1. Create `party/.dev.vars` (gitignored):
   ```ini
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```
2. Start the local Durable Object worker on port `8787`:
   ```bash
   cd party
   npm run dev
   ```
3. In `leonida-vice/.env.local`, point Next.js at the worker:
   ```ini
   NEXT_PUBLIC_PARTYSERVER_HOST=127.0.0.1:8787
   ```

## Production Deploy to Cloudflare Workers

```bash
cd party
npx wrangler login
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npm run deploy
```

Then add `NEXT_PUBLIC_PARTYSERVER_HOST=leonida-vice-party.<your-subdomain>.workers.dev` to your Vercel project environment variables.
