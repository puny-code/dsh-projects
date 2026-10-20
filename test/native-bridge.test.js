import assert from "node:assert/strict";
import test from "node:test";

import {
  ALLOCATE_DEFAULT_WORKSPACE_ENDPOINT,
  BRIDGE_CHANNEL,
  createNativeBridgeHandler,
  isElectronRuntime,
  pickNativeDirectory,
  pickWithElectron,
  registerNativeBridge
} from "../src/native-bridge.js";

test("detects Electron only from a non-empty runtime version", () => {
  assert.equal(isElectronRuntime({ electron: "43.4.0" }), true);
  assert.equal(isElectronRuntime({ electron: "" }), false);
  assert.equal(isElectronRuntime({ node: "24.0.0" }), false);
});

test("Electron picker returns the selected directory and uses the focused window", async () => {
  const parent = {};
  let call;
  const path = await pickWithElectron(new AbortController().signal, async () => ({
    BrowserWindow: { getFocusedWindow: () => parent },
    app: { getPath: (name) => name === "desktop" ? "C:\\Users\\test\\Desktop" : "" },
    dialog: {
      async showOpenDialog(...args) {
        call = args;
        return { canceled: false, filePaths: ["C:\\work\\project"] };
      }
    }
  }), { inspectPath: async () => ({ isDirectory: () => false }) });
  assert.equal(path, "C:\\work\\project");
  assert.equal(call[0], parent);
  assert.deepEqual(call[1].properties, ["openDirectory", "createDirectory"]);
  assert.equal(call[1].defaultPath, "C:\\Users\\test\\Desktop");
});

test("Electron picker starts from the remembered parent when it still exists", async () => {
  let options;
  await pickWithElectron(new AbortController().signal, async () => ({
    BrowserWindow: { getFocusedWindow: () => null },
    app: { getPath: () => "C:\\Users\\test\\Desktop" },
    dialog: { showOpenDialog: async (received) => { options = received; return { canceled: true, filePaths: [] }; } }
  }), {
    defaultPath: "D:\\projects",
    inspectPath: async (path) => ({ isDirectory: () => path === "D:\\projects" })
  });
  assert.equal(options.defaultPath, "D:\\projects");
});

test("Electron picker can explicitly start from the system home directory", async () => {
  let options;
  await pickWithElectron(new AbortController().signal, async () => ({
    BrowserWindow: { getFocusedWindow: () => null },
    app: { getPath: (name) => name === "home" ? "C:\\Users\\test" : "C:\\Users\\test\\Desktop" },
    dialog: { showOpenDialog: async (received) => { options = received; return { canceled: true, filePaths: [] }; } }
  }), { startLocation: "home" });
  assert.equal(options.defaultPath, "C:\\Users\\test");
});

test("Electron picker maps cancellation to null", async () => {
  const path = await pickWithElectron(new AbortController().signal, async () => ({
    BrowserWindow: { getFocusedWindow: () => null },
    app: { getPath: () => "C:\\Users\\test\\Desktop" },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) }
  }));
  assert.equal(path, null);
});

test("plain Node hosts delegate to the official cross-platform DSH picker", async () => {
  const signal = new AbortController().signal;
  const path = await pickNativeDirectory(signal, {
    platform: "win32",
    electron: false,
    loadNativePicker: async () => ({
      pickNativeDirectory(received) {
        assert.equal(received, signal);
        return "C:\\native";
      }
    })
  });
  assert.equal(path, "C:\\native");
});

test("bridge accepts an optional picker default path and rejects unknown fields", async () => {
  const expectRoot = "C:\\Users\\Public\\Documents\\DSH-Default";
  const expectPath = `${expectRoot}\\2026-08-17\\new-chat`;
  const handler = createNativeBridgeHandler({
    platform: "darwin",
    electron: false,
    loadNativePicker: async () => ({ pickNativeDirectory: async () => "/tmp/project" }),
    defaultWorkspace: {
      home: "C:\\Users\\Public",
      now: () => new Date(2026, 7, 17, 12, 0),
      join: (...parts) => parts.join("\\"),
      mkdir: async () => {}
    }
  });
  assert.deepEqual(await handler("pickDirectory", {}, new AbortController().signal), {
    ok: true,
    value: { path: "/tmp/project" }
  });
  assert.deepEqual(await handler("pickDirectory", { defaultPath: "/tmp" }, new AbortController().signal), {
    ok: true,
    value: { path: "/tmp/project" }
  });
  assert.deepEqual(
    await handler(ALLOCATE_DEFAULT_WORKSPACE_ENDPOINT, {}, new AbortController().signal),
    {
      ok: true,
      value: {
        path: expectPath,
        root: expectRoot
      }
    }
  );
  assert.deepEqual(await handler("other", {}, new AbortController().signal), {
    ok: false,
    error: {
      code: "internal",
      message: 'dsh-projects: unknown native bridge endpoint "other"',
      details: {}
    }
  });
  assert.deepEqual(await handler("pickDirectory", { path: "/tmp" }, new AbortController().signal), {
    ok: false,
    error: {
      code: "internal",
      message: "dsh-projects: bridge payload may only contain defaultPath and a desktop/home startLocation",
      details: {}
    }
  });
});

test("registers the bridge as a loopback-only RPC channel", () => {
  let registration;
  const dispose = () => {};
  const ctx = {
    connection: {
      rpc: {
        handle(channel, handler, options) {
          registration = { channel, handler, options };
          return dispose;
        }
      }
    }
  };
  assert.equal(registerNativeBridge(ctx), dispose);
  assert.equal(registration.channel, BRIDGE_CHANNEL);
  assert.deepEqual(registration.options, { authority: "loopback" });
  assert.equal(typeof registration.handler, "function");
});

function fakeRequest({ url = `/dsh-projects/${ALLOCATE_DEFAULT_WORKSPACE_ENDPOINT}`, method = "POST", headers = { "content-type": "application/json" }, body = "" } = {}) {
  return {
    url,
    method,
    headers,
    on() {},
    async *[Symbol.asyncIterator]() {
      if (body !== "") yield Buffer.from(body);
    }
  };
}

function fakeResponse() {
  const state = { code: 0, headers: undefined, body: "", destroyed: false, headersSent: false };
  return {
    state,
    get headersSent() {
      return state.headersSent;
    },
    writeHead(code, headers) {
      state.code = code;
      state.headers = headers;
      state.headersSent = true;
    },
    end(body) {
      if (body !== undefined) state.body = String(body);
    },
    destroy() {
      state.destroyed = true;
    }
  };
}

function fakeHost() {
  const routes = new Map();
  const server = {
    prefixes: routes,
    register(route) {
      if (routes.has(route.path)) throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`);
      routes.set(route.path, route);
      return () => routes.delete(route.path);
    }
  };
  return { routes, server };
}

const workingInternals = {
  platform: "win32",
  electron: false,
  loadNativePicker: async () => ({ pickNativeDirectory: async () => "C:\\picked" }),
  defaultWorkspace: {
    home: "C:\\Users\\Public",
    now: () => new Date(2026, 7, 17, 12, 0),
    join: (...parts) => parts.join("\\"),
    mkdir: async () => {}
  }
};

test("reclaims a stale bridge route instead of failing the activation", async () => {
  const { routes, server } = fakeHost();
  const ctx = () => ({ webServer: server, connection: { admit: () => ({ peer: {} }) } });
  const first = registerNativeBridge(ctx(), workingInternals);
  assert.equal(routes.size, 1);
  // The first activation never disposed its route (the pre-0.3.3-alpha.2 bug):
  // a second activation registers the same prefix and must win.
  const second = registerNativeBridge(ctx(), workingInternals);
  assert.equal(routes.size, 1);
  const route = routes.get(BRIDGE_CHANNEL);
  const request = fakeRequest({
    body: JSON.stringify({ type: "client-request", rpcId: "r1", method: ALLOCATE_DEFAULT_WORKSPACE_ENDPOINT, payload: {} })
  });
  const response = fakeResponse();
  await route.handler(request, response);
  assert.equal(response.state.code, 200);
  assert.deepEqual(JSON.parse(response.state.body), {
    type: "server-response",
    rpcId: "r1",
    result: { ok: true, value: { path: "C:\\Users\\Public\\Documents\\DSH-Default\\2026-08-17\\new-chat", root: "C:\\Users\\Public\\Documents\\DSH-Default" } }
  });
  second();
  assert.equal(routes.size, 0);
  first();
});

test("answers a handler failure with a bridge envelope instead of a bare 400", async () => {
  const { routes, server } = fakeHost();
  const ctx = {
    webServer: server,
    connection: {
      admit() {
        throw new Error("cannot get property webServer without inject");
      }
    }
  };
  const original = console.warn;
  console.warn = () => {};
  try {
    const dispose = registerNativeBridge(ctx, workingInternals);
    const route = routes.get(BRIDGE_CHANNEL);
    const response = fakeResponse();
    await route.handler(fakeRequest(), response);
    assert.equal(response.state.code, 503);
    const envelope = JSON.parse(response.state.body);
    assert.equal(envelope.type, "server-response");
    assert.equal(envelope.result.ok, false);
    assert.equal(envelope.result.error.code, "unavailable");
    dispose();
  } finally {
    console.warn = original;
  }
});
