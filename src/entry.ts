import express, { type Express } from "express";
import { registerAdminRoutes } from "./admin.js";

// Registrer administrasjonsrutene på samme Express-app rett før serveren starter.
// Dette holder administrasjonsfunksjonene isolert fra den store server.ts-filen.
const originalListen = express.application.listen;

express.application.listen = function (
  this: Express,
  ...args: Parameters<typeof originalListen>
) {
  registerAdminRoutes(this);
  return originalListen.apply(this, args);
} as typeof originalListen;

await import("./server.js");
