# Compatibility

The table separates automated source coverage from actual user-interface verification. A green CI run does not prove that an operating-system dialog or file-manager integration behaves correctly.

| Surface | Host OS | Automated checks | Manual UI coverage | Status |
| --- | --- | --- | --- | --- |
| DSH Desktop 2.0.1 | Windows x64 | Node 20/22/24 | Project picker, project creation, exact workspace root, legacy plugin bridge, Windows folder chooser | Verified legacy target |
| DSH Desktop 2.0.3 | Windows x64 | Node 20/22/24 | Plugin load, official Windows picker, cancellation, and exact CJK/space path round-trip to the creation surface | Verified picker integration |
| DSH 0.1.1-rc.2 local Web UI | Windows | Node 20/22/24 | Isolated profile boot, plugin module load, project picker, creation modal, search and archive entry | Verified compatibility smoke test |
| DSH 0.2.1-rc.2 local Web UI | Windows | Node 20/22/24 | Isolated profile boot, plugin load, sidebar over real Workspaces, create-project dialog, authenticated Host bridge round-trip | Verified 0.2.x target |
| DSH Desktop | macOS Apple Silicon | Node 20/22/24 | Not yet tested | Community testing requested |
| Local DSH Web UI | macOS | Node 20/22/24 | Not yet tested | Community testing requested |
| Local DSH Web UI | Linux | Node 20/22/24 | Not yet tested | Community testing requested |
| Remote DSH Web UI | Cross-platform | Node 20/22/24 | Host directory-browser fallback | Supported by design |

DSH Desktop currently publishes installers for Windows x64 and macOS Apple Silicon. Intel macOS and a packaged Linux Desktop are not claimed as supported here. The plugin's Host implementation has win32, darwin, and Linux branches, but only Windows has current end-to-end manual coverage.

## Feature behavior by surface

| Feature | Desktop / Windows | Local Web | Remote Web |
| --- | --- | --- | --- |
| Project picker and sidebar | Yes | Yes | Yes |
| No-project default task folders | Host-side allocator | Host-side allocator | Workspace browse capability on the Host |
| Directory selection | Official Desktop bridge, then legacy Electron bridge | Plugin Host bridge, then stock Workspace picker | Stock Host directory browser |
| Fallback directory browser | Yes | Yes | Yes; authoritative |
| Open in file manager | Verified on Windows | Host-dependent | Host-dependent |
| Light/dark theme tokens | Verified on Windows | Expected | Expected |
| Chat-body search | Requires DSH session index | Same | Same |
| Restore archived chat | Blocked when DSH has no public unarchive API | Same | Same |

## Browser and remote boundaries

The plugin has Host and Web Client halves. DSH Desktop's official window bridge is checked first. On DSH 0.1.x the plugin compatibility bridge is registered through DSH Connection with loopback-only authority. DSH 0.2.x removed that per-channel `authority` option, so the bridge refuses to mount whenever the deployment allows remote authorities, and every request still passes `connection.admit()` (Host/Origin fence plus browser session). The client calls it only when `ctx.connection.isLoopback` is true. A remote browser therefore cannot make the Host display a native directory dialog.

In remote Web UI, project paths always refer to the filesystem of the machine running DSH Host, not the browser device. Browser-local display preferences do not automatically synchronize between origins, browsers, or profiles.

## Version policy

`0.3.1-alpha.1` accepts DSH `0.1.0-rc.6` through the published `0.2.x` previews and has an isolated runtime smoke test on `0.2.1-rc.2`. DSH compares its own runtime version (`0.2.1-rc.2` here) with the plugin's `@deepseek-ai/dsh-*` peer ranges before installing, so a plugin that only lists `0.1.x` is rejected outright; the ranges now carry the `0.2.x` line too. The rc.2 Web Client surface is verified for boot, module load, sidebar rendering over real Workspaces, the create-project dialog, and the authenticated Host bridge; macOS, Linux, intermediate preview builds, and later Developer Preview builds remain unverified until they receive their own tests and, for OS integrations, manual coverage.
