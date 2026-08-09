import express, { type Express } from "express";
import { registerAdminRoutes } from "./admin.js";
import { registerInsightRoutes } from "./insights.js";

// Registrer tilleggsrutene på samme Express-app rett før serveren starter.
const originalListen = express.application.listen;

express.application.listen = function (
  this: Express,
  ...args: Parameters<typeof originalListen>
) {
  registerAdminRoutes(this);
  registerInsightRoutes(this);
  return originalListen.apply(this, args);
} as typeof originalListen;

await import("./server.js");
