import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // The repo holds two lockfiles — the backend's at the root and web/'s here —
  // so Turbopack warns that it guessed a workspace root. The guess was correct:
  // the root must be the REPO root, not web/, because the pages import the
  // query code from ../src. Setting it to web/ compiles nothing and fails with
  // module-not-found.
  turbopack: { root: fileURLToPath(new URL("..", import.meta.url)) },
};

export default nextConfig;
