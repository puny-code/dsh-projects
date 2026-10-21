## 0.3.4-alpha.1 - 2026-10-21

- 内容搜索失败时不再只显示「暂时不可用」：按宿主返回的错误码分别提示「索引未开启 / 索引正在建立 / 会话正在更新」，并把原始报错放进悬停提示。
- 索引暂不可用（SESSION_QUERY_PERSISTENCE_FAILED、SESSION_QUERY_INDEX_FAILED）时自动重试两次，每次间隔 1.5s，避免搜索进行中会话写入导致的瞬时失败。
- 内容搜索不可用时，标题与项目名匹配照常展示。
# Changelog

All notable changes to this project will be documented here.

## Unreleased

## 0.3.3-alpha.2 - 2026-10-20

- Fix "enable failed" after turning the plugin off and on again. The host web server refuses a second registration of the same prefix, and the bridge route used to outlive its plugin fiber, so every re-activation died with `webserver: duplicate prefix route "/dsh-projects"`. The route is now registered through `ctx.effect(...)` and released with the plugin. A route left behind by an older activation closes over a disposed context and fails every request, so it is reclaimed and replaced instead of being reused.
- Fix "普通对话创建失败: transport failure for /dsh-projects/allocateDefaultWorkspace: HTTP 400". That request came from the same stale route: its handler threw on the disposed context and the host web server answers a thrown handler with a bare `400` and no body. Bridge failures now answer on the bridge protocol (`503` plus a `server-response` envelope), so the browser half reports the real error instead of a transport failure.

## 0.3.3-alpha.1 - 2026-10-20

- Make the restored chat menu look and behave like the stock one. The menu, its buttons and the rename dialog now render through the shell's own primitives (`Menu`, `MenuItemButton`, `Modal`, `Button`, `Tooltip`) and reuse the shell's outline icon set, so the surface, hover colour, keycaps and dialog chrome follow the active theme instead of the plugin's hand-drawn panel.
- Show the same keyboard hints as the stock menu (rename, fork, archive) by reading the shell shortcut catalog at open time, with built-in defaults when the host does not expose it.
- The `···` button, the per-row pin/archive buttons and the sidebar toolbar buttons are now shell-styled icon buttons with tooltips and proper `aria-haspopup` / `aria-menu-open` state.
- Both halves degrade to the previous hand-drawn menu and dialog when the primitives module is unavailable.

## 0.3.2-alpha.1 - 2026-10-20

- Restore per-chat actions on the plugin's own sidebar rows. DSH 0.2.x fills `sidebar.workspaces` with whichever plugin registers it, so replacing the stock browser also replaced its row context menu; chats offered no way to pin, rename, fork, archive, or copy their id. Right-clicking a chat row, or clicking the new `···` button, now opens that menu on the plugin's own rows.
- Rebuild those actions against the 0.2.x runtime APIs: rename goes through `sessions.using(id, { source: "workspaceOperation" }, reference => reference.binding.session.rename(title))` behind a small dialog, fork calls `uiWorkspace.forkSession(id, undefined, { allowMigration: false })` and opens the new chat (with a localized hint when the source chat still needs a migration), copy uses `navigator.clipboard` with an `execCommand` fallback, and pin/archive reuse the existing sidebar preferences and archive path.
- Deleting a chat is intentionally not offered: DSH 0.2.x exposes no public session-delete API.

## 0.3.1-alpha.1 - 2026-10-18

- Support the DSH 0.2.x runtime line, verified against DSH 0.2.1-rc.2: the eight `@deepseek-ai/dsh-*` peer ranges now accept `0.1.0-rc.6` through the published `0.2.x` previews, so the plugin installs instead of being rejected as incompatible.
- Move the Host native bridge onto the supported 0.2.x surface: `ctx.webServer.register()` with `ctx.connection.admit()` authentication. DSH 0.2.x made `ctx.connection.rpc.handle()` unusable from a profile plugin — its internal registration resolves the owning Context to one that cannot see `webServer`, so registration threw `cannot get property "webServer" without inject` no matter what the plugin declared.
- Keep the 0.1.x channel registration as a fallback for older runtimes, detected at runtime.
- Refuse to mount the native bridge when the deployment allows remote authorities, because 0.2.x removed the per-channel `authority: "loopback"` guard and a remote browser must not be able to open host dialogs or create host directories.
- Migrate the browser half to the 0.2.x `uiWorkspace` service for `pickDirectory`, `listDirectory`, `startSession` and `openSession`, keeping `ctx.workspaces` / `ctx.sessions` as fallbacks for 0.1.x.
- Restore "open in file manager" on 0.2.x, where `ctx.workspaces.openPath` was removed: the Host bridge now reveals the path through Electron's shell or the platform opener, and degrades to copying the path to the clipboard.
- Refresh `dsh.client.inject` to the 0.2.x client module names.
- Verified on DSH 0.2.1-rc.2: isolated profile boot with no activation warnings, plugin sidebar renders real Workspaces, create-project dialog renders, and the Host bridge round-trips `allocateDefaultWorkspace` over an authenticated browser session (401 without the browser session, 200 with it).

## 0.3.0-alpha.2 - 2026-08-27

- Prefer DSH Desktop's official Windows directory-picker bridge when available, while retaining the plugin Host bridge and stock Workspace picker as compatibility fallbacks.
- Treat direct string and `null` picker responses as valid results, preventing a successful selection or cancellation from opening a second chooser.
- Replace the broad prerelease peer caret with the explicit published preview set from `0.1.0-rc.6` through `0.1.1-rc.2`, and add CI checks for the two verified endpoints.
- Add regression coverage for picker priority, cancellation, fallback order, raw Windows paths, and CJK project paths.
- Add a repository-owned `screenshots.json` manifest for plugin directories and marketplaces.
- Retire the patched Desktop installer from the recommended setup path now that Desktop provides an official native Windows picker.
- Verify plugin loading, native-picker cancellation, and exact CJK/space path round-trip in DSH Desktop 2.0.3 on Windows x64.

## 0.3.0-alpha.1 - 2026-08-18

- Add Arrow Up/Down and Enter navigation to the project picker, including active-option accessibility metadata.
- Add structured bug, compatibility, and feature-request forms plus a public product roadmap.
- Start the Desktop native directory chooser on the system Desktop, then remember the last selected folder's parent and safely fall back when it no longer exists.
- Group global-search results directly under their projects, keep unassigned chats under Recent, and highlight matching text.
- Show DSH-native waiting-for-input, running, and completed reminders in session rows, with per-project attention counts.
- Add Off, Compact, and Expanded attention-display modes; Expanded groups native waiting, running, and completed Sessions and opens them directly.
- Add an opt-in multi-folder project layer that groups existing DSH Workspaces, keeps one explicit primary Workspace for new Sessions, and dissolves without moving files or chats.
- Version the multi-folder manifest, migrate the pre-release array format, and preserve unknown future formats without interpreting or overwriting them.
- Keep DSH's existing session-fork action instead of adding a duplicate project-plugin menu item.
- Improve keyboard and screen-reader behavior for project menus and multi-folder dialogs, and reject corrupted duplicate group identifiers.

## 0.2.0-alpha.2 - 2026-08-17

- Fix the Desktop native picker opening a second fallback chooser after a folder was selected.
- Preserve the exact selected folder as the project workspace root.
- Fix ordinary-chat directory allocation when Desktop exposes a native-only directory picker.
- Add regression coverage for Connection RPC result envelopes and picker cancellation.

## 0.2.0-alpha.1 - 2026-08-17

- Add a loopback-only native directory picker bridge.
- Use Electron's OS chooser inside DSH Desktop without replacing the Desktop package.
- Use DSH's official cross-platform native picker for ordinary local Web hosts.
- Preserve the existing in-app directory browser as the remote and failure fallback.
- Document the alternative patched-Desktop distribution.

## 0.1.0-alpha.1 - 2026-08-17

- Initial public-alpha repository layout.
- Project picker and creation flow.
- Project-grouped and flat sidebar modes.
- Project/chat pinning, favorites, sorting, and drag ordering.
- Default no-project task directory allocation.
- Global project/title/content search integration.
- Archive center with an explicit DSH unarchive compatibility limitation.
- Light and dark theme support.
- Cross-platform path-allocation unit tests and reproducible browser bundle.

