import path from "node:path";

import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { createAuth, createSessionResolver } from "./auth";
import { createBggClient } from "./bgg/client";
import { createNeededIds } from "./bgg/needed";
import { createBggService } from "./bgg/service";
import { createDb } from "./db";
import { createBggRepo } from "./db/bggRepo";
import { createDataStore } from "./db/dataStore";
import { createLinkStore } from "./db/linkStore";
import { createUserStore } from "./db/userStore";
import { loadEnv } from "./env";

const env = loadEnv();
const { db, pool } = createDb(env.DATABASE_URL);
const auth = createAuth(env, db);
const store = createUserStore(db);
// In-memory job state: assumes a single server instance.
const bgg = createBggService({
  repo: createBggRepo(db),
  client: createBggClient(),
  fetchNeededIds: createNeededIds(),
  secret: env.BETTER_AUTH_SECRET,
});
const data = createDataStore(db);
const links = createLinkStore(db);

const app = createApp({
  baseUrl: env.BETTER_AUTH_URL,
  webOrigin: env.WEB_ORIGIN,
  staticDir: path.resolve(import.meta.dirname, "../dist"),
  resolveSession: createSessionResolver(auth, store),
  authHandler: auth.handler,
  store,
  bgg,
  data,
  links,
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`listening on :${info.port}`);
});

let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received, shutting down`);
  bgg.shutdown();
  // Hard stop if keep-alive connections never drain.
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
