#!/usr/bin/env node
/**
 * Get an auth token from your Screeps server.
 * Usage: node scripts/get-token.mjs [config-key]
 *
 * Reads screeps.json and attempts to sign in. If successful, prints the token
 * and instructions to add it to screeps.json for passwordless deploys.
 *
 * Prerequisites:
 * - A user must exist (connect to the server via the game client first)
 * - Password must be set via: http://SERVER:21025/authmod/password/
 *   or in server CLI: setPassword('YourUsername', 'YourPassword')
 */
import { createRequire } from "module";
import https from "https";
import http from "http";

const require = createRequire(import.meta.url);

const configKey = process.argv[2] || "pserver";
let config;

try {
  config = require("../screeps.json")[configKey];
} catch (err) {
  console.error("Could not load screeps.json. Ensure it exists and has a", configKey, "entry.");
  process.exit(1);
}

if (!config) {
  console.error("No config found for:", configKey);
  process.exit(1);
}

const hostname = process.env.SCREEPS_HOST_OVERRIDE || config.hostname;
const port = config.port || (config.protocol === "https" ? 443 : 21025);
const path = (config.path || "/").replace(/\/$/, "") + "/api/auth/signin";
const protocol = config.protocol === "https" ? https : http;

const email = config.email || config.username;
const password = config.password;

if (!email || !password) {
  console.error("Config must have 'email' (or 'username') and 'password'");
  process.exit(1);
}

const body = JSON.stringify({ email, password });
const basePath = (config.path || "/").replace(/\/$/, "");
const signinPath = basePath + "/api/auth/signin";
const authmodPath = basePath + "/api/authmod";
const url = `${config.protocol || "http"}://${hostname}:${port}${signinPath}`;

// Check if authmod is available
const checkAuthmod = () =>
  new Promise((resolve) => {
    const req = protocol.request(
      { hostname, port, path: authmodPath, method: "GET" },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode, data }));
      }
    );
    req.on("error", (e) => resolve({ status: 0, data: e.message }));
    req.end();
  });

// Probe common API paths to find the right base
const probe = (p) =>
  new Promise((resolve) => {
    const req = protocol.request(
      { hostname, port, path: p, method: "GET" },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ path: p, status: res.statusCode, data: data.slice(0, 100) }));
      }
    );
    req.on("error", () => resolve({ path: p, status: 0, data: null }));
    req.end();
  });

const probes = await Promise.all([
  probe("/api/authmod"),
  probe("/api/version"),
  probe("/version"),
  probe("/"),
]);

const authmod = probes.find((p) => p.path === "/api/authmod");
if (!authmod || authmod.status !== 200) {
  console.error("Auth module not found. Probed paths:");
  probes.forEach((p) => console.error("  ", p.path, "->", p.status, p.data ? "|" + p.data : ""));
  console.error("\nYour server may use a different API structure.");
  console.error("Check your Screeps server docs for the correct API base path.");
  process.exit(1);
}

console.log("Signing in to", url);
console.log("User:", email);

const req = protocol.request(
  {
    hostname,
    port,
    path: signinPath,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  },
  (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      if (res.statusCode !== 200) {
        console.error("Sign-in failed:", res.statusCode, data || res.statusMessage);
        process.exit(1);
      }
      try {
        const json = JSON.parse(data);
        if (json.token) {
          console.log("\nToken obtained! Add this to screeps.json:\n");
          console.log(`  "token": "${json.token}",`);
          console.log("\nThen remove 'email' and 'password' from the config.");
        } else {
          console.error("No token in response:", data);
        }
      } catch {
        console.error("Invalid response:", data);
      }
    });
  }
);

req.on("error", (err) => {
  console.error("Request failed:", err.message);
  process.exit(1);
});

req.write(body);
req.end();
