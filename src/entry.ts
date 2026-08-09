import express, { type Express, type RequestHandler } from "express";
import { registerAdminRoutes } from "./admin.js";
import { registerInsightRoutes } from "./insights.js";

// server.ts registrerer en catch-all-rute før app.listen(). For at tilleggs-API-ene
// skal være tilgjengelige må catch-all-ruten flyttes bak admin/insight-rutene.
const originalGet = express.application.get;
const originalListen = express.application.listen;

let deferredCatchAll: RequestHandler | null = null;

express.application.get = function (
  this: Express,
  path: Parameters<typeof originalGet>[0],
  ...handlers: RequestHandler[]
) {
  if (path === "/{*splat}" && handlers.length > 0) {
    deferredCatchAll = handlers[handlers.length - 1] ?? null;
    return this;
  }

  return originalGet.call(this, path, ...handlers);
} as typeof originalGet;

express.application.listen = function (
  this: Express,
  ...args: Parameters<typeof originalListen>
) {
  registerAdminRoutes(this);
  registerInsightRoutes(this);

  if (deferredCatchAll) {
    originalGet.call(this, "/{*splat}", deferredCatchAll);
  }

  return originalListen.apply(this, args);
} as typeof originalListen;

await import("./server.js");
