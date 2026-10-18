/** Loopback-only native directory picker bridge for dsh-projects. */

import { allocateDefaultWorkspace } from "./default-workspace-host.js";
import { isAbsolute } from "node:path";
import { stat } from "node:fs/promises";

const BRIDGE_CHANNEL = "/dsh-projects";
const PICK_DIRECTORY_ENDPOINT = "pickDirectory";
const ALLOCATE_DEFAULT_WORKSPACE_ENDPOINT = "allocateDefaultWorkspace";
const OPEN_PATH_ENDPOINT = "openPath";
const SUPPORTED_PLATFORMS = new Set(["win32", "darwin", "linux"]);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isElectronRuntime(versions = process.versions) {
  return typeof versions?.electron === "string" && versions.electron.length > 0;
}

async function existingDirectory(path, inspect = stat) {
  if (!path) return false;
  try {
    return (await inspect(path)).isDirectory();
  } catch {
    return false;
  }
}

async function pickWithElectron(signal, loadElectron = () => import("electron"), request = {}) {
  if (signal.aborted) throw new Error("native directory picker aborted");
  const { app, BrowserWindow, dialog } = await loadElectron();
  const fallbackLocation = request.startLocation === "home" ? "home" : "desktop";
  const fallbackPath = app?.getPath?.(fallbackLocation) ?? "";
  const requested = typeof request.defaultPath === "string" ? request.defaultPath : "";
  const defaultPath = await existingDirectory(requested, request.inspectPath)
    ? requested
    : fallbackPath;
  const options = {
    title: "Select Project Root",
    properties: ["openDirectory", "createDirectory"],
    ...(defaultPath ? { defaultPath } : {})
  };
  const parent = BrowserWindow?.getFocusedWindow?.() ?? null;
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options);
  if (signal.aborted) throw new Error("native directory picker aborted");
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0] ?? null;
}

async function pickWithDshNative(signal, loadNativePicker = () => import("@deepseek-ai/dsh-host-directory-picker-native")) {
  const { pickNativeDirectory } = await loadNativePicker();
  if (typeof pickNativeDirectory !== "function") {
    throw new Error("DSH native directory picker is unavailable");
  }
  return pickNativeDirectory(signal);
}

async function pickNativeDirectory(signal, internals = {}, request = {}) {
  const platform = internals.platform ?? process.platform;
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    throw new Error(`native directory picker is unsupported on ${platform}`);
  }
  const electron = internals.electron ?? isElectronRuntime(internals.versions);
  return electron
    ? pickWithElectron(signal, internals.loadElectron, { defaultPath: request.defaultPath, startLocation: request.startLocation, inspectPath: internals.inspectPath })
    : pickWithDshNative(signal, internals.loadNativePicker);
}

function validPickerPayload(payload) {
  if (!isPlainObject(payload)) return false;
  const keys = Object.keys(payload);
  return keys.every((key) => key === "defaultPath" || key === "startLocation")
    && (payload.defaultPath === undefined || typeof payload.defaultPath === "string")
    && (payload.startLocation === undefined || payload.startLocation === "desktop" || payload.startLocation === "home");
}

function validOpenPathPayload(payload) {
  if (!isPlainObject(payload)) return false;
  if (Object.keys(payload).some((key) => key !== "path")) return false;
  if (typeof payload.path !== "string" || payload.path.length === 0) return false;
  if (payload.path.includes("\0")) return false;
  return isAbsolute(payload.path);
}

/**
 * Reveal a host path in the file manager.
 *
 * DSH 0.2.x removed `ctx.workspaces.openPath` and offers no replacement
 * service, so the host half keeps the capability the old service provided:
 * Electron's shell in the desktop app, the platform opener otherwise.
 */
async function revealPath(path, internals = {}) {
  const electron = internals.electron ?? isElectronRuntime(internals.versions);
  if (electron) {
    const { shell } = internals.loadElectron ? await internals.loadElectron() : await import("electron");
    if (typeof shell?.showItemInFolder === "function") {
      shell.showItemInFolder(path);
      return { opened: true, via: "electron" };
    }
    if (typeof shell?.openPath === "function") {
      await shell.openPath(path);
      return { opened: true, via: "electron" };
    }
  }
  const platform = internals.platform ?? process.platform;
  const { spawn } = await import("node:child_process");
  const command = platform === "win32"
    ? ["explorer.exe", [path]]
    : platform === "darwin"
      ? ["open", [path]]
      : ["xdg-open", [path]];
  const child = spawn(command[0], command[1], { detached: true, stdio: "ignore" });
  child.unref();
  return { opened: true, via: command[0] };
}

function createNativeBridgeHandler(internals = {}) {
  const endpoints = new Set([PICK_DIRECTORY_ENDPOINT, ALLOCATE_DEFAULT_WORKSPACE_ENDPOINT, OPEN_PATH_ENDPOINT]);
  return async (endpoint, payload, signal) => {
    try {
      if (!endpoints.has(endpoint)) {
        throw new Error(`dsh-projects: unknown native bridge endpoint ${JSON.stringify(endpoint)}`);
      }
      if (endpoint === OPEN_PATH_ENDPOINT) {
        if (!validOpenPathPayload(payload)) {
          throw new Error("dsh-projects: bridge payload must be one absolute path");
        }
        return { ok: true, value: await revealPath(payload.path, internals) };
      }
      if (!validPickerPayload(payload)) {
        throw new Error("dsh-projects: bridge payload may only contain defaultPath and a desktop/home startLocation");
      }
      if (endpoint === PICK_DIRECTORY_ENDPOINT) {
        const path = await pickNativeDirectory(signal, internals, payload);
        return { ok: true, value: { path } };
      }
      if (endpoint === ALLOCATE_DEFAULT_WORKSPACE_ENDPOINT) {
        return {
          ok: true,
          value: await allocateDefaultWorkspace(internals.defaultWorkspace)
        };
      }
    } catch (reason) {
      return {
        ok: false,
        error: {
          code: "internal",
          message: reason instanceof Error ? reason.message : String(reason),
          details: {}
        }
      };
    }
  };
}

/** Maximum request body accepted by the bridge route. */
const MAX_BODY_BYTES = 64 * 1024;

/** Read a JSON request body from a node:http request. */
async function readJsonBody(request, limit = MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("dsh-projects: bridge payload too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Split `/dsh-projects/<endpoint>` into a validated endpoint name. */
function endpointFromPath(pathname) {
  const prefix = `${BRIDGE_CHANNEL}/`;
  if (!pathname.startsWith(prefix)) return undefined;
  const endpoint = pathname.slice(prefix.length);
  if (endpoint === "" || endpoint.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) return undefined;
  return endpoint;
}

/**
 * Register the bridge as an exact protocol on the host web server.
 *
 * DSH 0.2.x made `ctx.connection.rpc.handle()` unusable from a profile plugin:
 * its internal registration resolves the owning Context to one that cannot see
 * `webServer`, so the call throws "cannot get property webServer without
 * inject" no matter what the plugin declares. The supported surface for a
 * third-party host half is `ctx.webServer.register()` (the same path
 * `dsh-better-sidebar` uses on 0.2.x), with `ctx.connection.admit()` supplying
 * the browser authentication the old RPC helper used to enforce.
 *
 * The wire format is unchanged, so the browser half keeps calling
 * `/dsh-projects/<endpoint>` through `ctx.connection.rpc.call`.
 */
function registerWebServerBridge(ctx, internals = {}) {
  const handle = createNativeBridgeHandler(internals);
  return ctx.webServer.register({
    kind: "prefix",
    path: BRIDGE_CHANNEL,
    handler: async (request, response) => {
      const admission = ctx.connection.admit(request);
      if ("rejection" in admission) {
        response.writeHead(admission.rejection);
        response.end(admission.rejection === 401 ? "unauthorized" : "forbidden");
        return;
      }
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      const endpoint = endpointFromPath(pathname);
      if (request.method !== "POST" || endpoint === undefined) {
        response.writeHead(404);
        response.end();
        return;
      }
      const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
      if (contentType !== "application/json") {
        response.writeHead(415);
        response.end("content type must be application/json");
        return;
      }
      let message;
      try {
        message = await readJsonBody(request);
      } catch (reason) {
        response.writeHead(400);
        response.end(reason instanceof Error ? reason.message : "invalid request body");
        return;
      }
      if (!isPlainObject(message) || message.type !== "client-request" || typeof message.rpcId !== "string" || typeof message.method !== "string") {
        response.writeHead(400);
        response.end("invalid client-request envelope");
        return;
      }
      if (message.method !== endpoint) {
        response.writeHead(400);
        response.end("method does not match endpoint");
        return;
      }
      const controller = new AbortController();
      request.on("close", () => controller.abort());
      let result;
      try {
        result = await handle(endpoint, message.payload, controller.signal, admission.peer);
      } catch (reason) {
        response.writeHead(500);
        response.end(`handler failure: ${String(reason)}`);
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ type: "server-response", rpcId: message.rpcId, result }));
    }
  });
}

function registerNativeBridge(ctx, internals = {}) {
  // Remote deployments hand native dialogs and host-side directory creation to
  // any authenticated browser, which is a capability escalation; the 0.1.x
  // `authority: "loopback"` guard is gone in 0.2.x, so refuse to mount at all.
  if (ctx.connection.allowsRemoteAuthorities === true) {
    console.warn("[dsh-projects] remote authorities enabled: native directory bridge disabled");
    return () => {};
  }
  const dispose = typeof ctx.webServer?.register === "function" && typeof ctx.connection?.admit === "function"
    ? registerWebServerBridge(ctx, internals)
    : ctx.connection.rpc.handle(
      BRIDGE_CHANNEL,
      createNativeBridgeHandler(internals),
      { authority: "loopback" }
    );
  if (internals.debug) console.log("[dsh-projects] native bridge registered", BRIDGE_CHANNEL, typeof dispose);
  return dispose;
}

export {
  ALLOCATE_DEFAULT_WORKSPACE_ENDPOINT,
  BRIDGE_CHANNEL,
  OPEN_PATH_ENDPOINT,
  PICK_DIRECTORY_ENDPOINT,
  createNativeBridgeHandler,
  existingDirectory,
  isElectronRuntime,
  pickNativeDirectory,
  pickWithDshNative,
  pickWithElectron,
  readJsonBody,
  registerNativeBridge,
  registerWebServerBridge,
  revealPath,
  validOpenPathPayload,
  validPickerPayload
};
