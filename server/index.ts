import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { createAuth, createSessionResolver } from "./auth";
import { createBggClient } from "./bgg/client";
import { createNeededIds } from "./bgg/needed";
import { createBggService } from "./bgg/service";
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
// loadEnv makes the S3 variables all-or-none, so one check covers them.
const storage =
  env.S3_BUCKET &&
  env.S3_REGION &&
  env.S3_ACCESS_KEY_ID &&
  env.S3_SECRET_ACCESS_KEY &&
  env.COVER_BASE_URL
    ? createS3Storage({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      })
    : null;
const covers = createCoverService({
  repo: bggRepo,
  storage,
  fetchCover: createCoverFetcher(),
  coverBaseUrl: env.COVER_BASE_URL,
});
const data = createDataStore(db, env.COVER_BASE_URL);
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
