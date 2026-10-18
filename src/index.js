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
  registerNativeBridge(ctx);
}

export { apply, inject, name };
