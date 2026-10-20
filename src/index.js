/** dsh-projects host half. */
import { registerNativeBridge } from "./native-bridge.js";

const name = "dsh-projects";

/**
 * DSH 0.1.x needed only the Connection service; 0.2.x mounts the host web
 * server and requires the plugin to declare it (the same declaration every
 * 0.2.x host extension uses, e.g. `dsh-better-sidebar`).
 */
const inject = ["connection", "webServer"];

function apply(ctx) {
  // The host web server rejects a second registration of the same prefix, so the
  // bridge has to disappear with this plugin fiber. Without `ctx.effect(...)`
  // every stop/start cycle from the plugin manager threw
  // `webserver: duplicate prefix route "/dsh-projects"` and the plugin failed to
  // re-activate.
  ctx.effect(() => {
    const dispose = registerNativeBridge(ctx);
    return typeof dispose === "function" ? dispose : () => {};
  });
}

export { apply, inject, name };
