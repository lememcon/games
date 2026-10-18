import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { createAuth, createSessionResolver } from "./auth";
import { createBggClient } from "./bgg/client";
import { createNeededIds } from "./bgg/needed";
import { createBggService } from "./bgg/service";
import { createCoverConfig } from "./covers/config";
import { createCoverFetcher } from "./covers/fetch";
import { createCoverService } from "./covers/service";
import { createS3Storage } from "./covers/storage";
import { createDb } from "./db";
import { createBggRepo } from "./db/bggRepo";
import { createDataStore } from "./db/dataStore";
import { createLinkStore } from "./db/linkStore";
import { createMemberOverrideStore } from "./db/memberOverrideStore";
import { createMemberVetoStore } from "./db/memberVetoStore";
import { createMemberYearVetoStore } from "./db/memberYearVetoStore";
import { createPlayedStore } from "./db/playedStore";
import { createProfileStore } from "./db/profileStore";
import { createUserStore } from "./db/userStore";
import { loadEnv } from "./env";

const env = loadEnv();
const { db, pool } = createDb(env.DATABASE_URL);
const auth = createAuth(env, db);
const store = createUserStore(db);
const bggRepo = createBggRepo(db);
// In-memory job state: assumes a single server instance.
const bgg = createBggService({
  repo: bggRepo,
  client: createBggClient(),
  fetchNeededIds: createNeededIds(),
  secret: env.BETTER_AUTH_SECRET,
});
// The saved settings win over the S3_* environment, which loadEnv keeps all-or-none.
const coverConfig = createCoverConfig({
  repo: bggRepo,
  secret: env.BETTER_AUTH_SECRET,
  env,
  makeStorage: (config, opts) =>
    createS3Storage({ ...config, timeoutMs: opts?.timeoutMs }),
});
const covers = createCoverService({
  repo: bggRepo,
  resolveStorage: coverConfig.resolve,
  fetchCover: createCoverFetcher(),
});
const data = createDataStore(
  db,
  async () => (await coverConfig.resolve()).coverBaseUrl ?? undefined,
);
const links = createLinkStore(db);
const profiles = createProfileStore(db);
const played = createPlayedStore(db);
const memberOverrides = createMemberOverrideStore(db);
const memberVetoes = createMemberVetoStore(db);
const memberYearVetoes = createMemberYearVetoStore(db);

const app = createApp({
  baseUrl: env.BETTER_AUTH_URL,
  webOrigin: env.WEB_ORIGIN,
  resolveSession: createSessionResolver(auth, store),
  authHandler: auth.handler,
  store,
  bgg,
  covers,
  coverConfig,
  data,
  links,
  profiles,
  played,
  memberOverrides,
  memberVetoes,
  memberYearVetoes,
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
  covers.shutdown();
  // Hard stop if keep-alive connections never drain.
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
