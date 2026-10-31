// Netlify Function (v2 API). Serves /api/health, /api/buoy, /api/wind, /api/tides.
import type { Config } from "@netlify/functions";
import { handleApi } from "../../shared/feeds";

export default async (req: Request) => {
  const url = new URL(req.url);
  const { status, body } = await handleApi(url.pathname);
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Let Netlify's CDN absorb repeat hits for a couple of minutes; browser always revalidates.
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Netlify-CDN-Cache-Control": "public, max-age=120, stale-while-revalidate=300",
    },
  });
};

export const config: Config = {
  path: ["/api/health", "/api/buoy", "/api/wind", "/api/tides"],
};
