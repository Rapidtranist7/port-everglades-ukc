import type { Express } from "express";
import type { Server } from "node:http";
import { handleApi } from "../shared/feeds";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.get("/api/{*route}", async (req, res) => {
    const { status, body } = await handleApi(req.path, new URLSearchParams(req.query as Record<string, string>));
    res.set("Cache-Control", "no-store");
    res.status(status).json(body);
  });
  return httpServer;
}
