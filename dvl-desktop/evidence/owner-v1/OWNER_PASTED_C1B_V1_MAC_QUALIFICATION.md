user\@MacBook-Air-de-User dvl-desktop-C1b % cat C1B_MAC_QUALIFICATION.log



\> dvl-desktop\@0.6.0 qualify:c1b

\> npm run verify:source && npm run test:c1 && npm test && npm run test:c1b:control && npm run test:native-secret && npm run test:c1b:electron





\> dvl-desktop\@0.6.0 verify:source

\> node scripts/verify-source.cjs



C1B SOURCE MATCH PASS: 50 entries



\> dvl-desktop\@0.6.0 test:c1

\> npm run build:reader && npm run test:c1:unit && npm run test:c1:repair && npm run test:c1:native





\> dvl-desktop\@0.6.0 build:reader

\> node scripts/build-reader.cjs





\> dvl-desktop\@0.6.0 test:c1:unit

\> node tests/c1-unit.cjs



PASS Path grammar rejects escapes and accepts Unicode/spaces without normalization

PASS Sensitive policy consistent for case and nested paths

PASS No native binary means BOUNDARY_UNSUPPORTED with no fallback

PASS Unknown request keys and caller root rejected before backend

PASS Request IDs cannot be reused in one generation

PASS A → B → A produces a fresh generation and fences old requests

PASS Root replaced by directory invalidates generation

PASS Native malformed protocol becomes RUNTIME_FAILED without stdout leakage

PASS Cancellation waits for helper close and releases active slot

PASS Hard timeout terminates helper with bounded error

PASS Two running and eight queued; overload BUSY; switch fences every pending request

PASS Invalid cursor cannot reach filesystem helper

PASS No project writes or .dvl activation from service refusal paths

PASS Production native binary enforces malformed-input/policy failures

NATIVE SUPPORT PROBE: NOT_FOUND

PASS Runtime support is reported honestly and unsupported native reader fails closed

PASS Close drains all tracked children/requests

C1a CONTROL CHECKS PASSED: 16 (not OS-confinement qualification)



\> dvl-desktop\@0.6.0 test:c1:repair

\> node tests/c1-repair.cjs



PASS F7 single policy table denies every name/prefix/extension in JS AND production native entrypoint

FD PROBE {"softBefore":1048575,"fd3Closed":true,"fd37Closed":true}

PASS F3 close inherited descriptors including fd above lowered soft limit

PASS F4 JS and native reject home/ancestors/system roots before sandbox

PASS F4 custom userData root, ancestors and descendants rejected by host and native

PASS F8 strict native protocol validates error/mode/kind/size/identity/offset/hex and unknown fields

MATCH CPU MS 5.89

MATCH CPU MS 28.94

EVENT LOOP MAX MS 10.54

PASS F2 one-MiB line, 200 start/end matches: bounded CPU and event-loop delay

PASS F2 matching cooperatively observes cancellation during a long line

PASS F9 snippets stay well-formed and Unicode columns remain correct

PASS F5 excluded directories are counted and search reports partial

PASS F5 newline/CR query rejected instead of reporting a false no-match

PASS F5 invalid listing names and directory failures retain earlier matches and expose skip counts

PASS F5 path-depth refusal preserves completed search evidence

PASS F5 time budget returns explicit partial results rather than false completion

PASS F6 helpers ignoring SIGKILL cannot wedge requests/shutdown or exceed global helper ceiling

PASS F3 one root-bound process serves every list/read within a search (simulated protocol)

PASS F8 malformed session response fails closed without raw error text

C1a REPAIR CONTROL CHECKS PASSED: 16 (simulated protocol tests are not native security evidence)



\> dvl-desktop\@0.6.0 test:c1:native

\> node tests/c1-boundary.cjs && node tests/c1-native-repair.cjs



READY seatbelt

{"externalDenied":true,"writeDenied":true,"movedDenied":true,"truncateDenied":true}

PASS Mandatory OS boundary blocks direct outside read, write, and moved-directory injection

PASS Real directory list hides denied targets, links and non-regular files

PASS Read UTF-8 Unicode path, exact contents/hash and inert markup bytes

PASS Traversal, empty, absolute, backslash, drive and NUL rejected

PASS Denied targets blocked across read/list/search

PASS Symlink parent, internal symlink, hard link and FIFO cannot disclose bytes

PASS Binary, invalid encoding, oversized and missing files return bounded errors

PASS Literal search correct 1-based Unicode column and explicit skipped files

PASS Regex characters treated literally; empty/oversize query rejected

PASS Unknown keys, caller-supplied root, duplicate IDs and bad project rejected

PASS Cancellation and A → B → A fence pending and old-generation results

PASS Root identity replacement invalidates capability

PASS Pagination bounded to 200, cursor single-use, directory changes reject cursor

PASS Result limit caps matches and labels partial

PASS Unavailable backend fails closed, no path-only fallback

PASS File inventory including .git/hidden/ignored bytes unchanged; .dvl absent

PASS Close cancels pending requests and leaves no tracked helper

C1a CHECKS PASSED: 17 platform: darwin x64

REPAIRED NATIVE MODE seatbelt

PASS Native sandbox operational; repaired service reads actual fixture bytes

ALIAS RESOLUTION ".ſsh/config" true

ALIAS RESOLUTION ".awſ/credentialſ" true

ALIAS RESOLUTION "id_rſa" true

ALIAS RESOLUTION ".ßh/config" true

ALIAS RESOLUTION ".AWS/CREDENTIALS" true

ALIAS RESOLUTION "srv.Key" true

PASS F1 direct native AND service deny actual sensitive-name aliases before content disclosure

PASS F1 exact stored Unicode spelling works; normalization aliases fail closed or are exact

PASS Native helper independently rejects wrong root inode (bypasses host check)

PASS Persistent native protocol cannot rebind root or introduce a new method

PASS F11 root quoting/escaping: spaces, quotes, backslash and Arabic

PASS Real child cancellation AFTER spawn returns no content and reaps child

PASS Real child A → B switch AFTER spawn fences old response

100 READS MS 2928.69

PASS F3 100 sequential reads record target latency without leaking helpers

500 FILE SEARCH MS 1347.48 HELPERS 1

PASS F3 persistent sandbox: complete 500-file search in the unchanged 5-second budget

C1a REPAIR NATIVE CHECKS PASSED: 10 darwin x64



\> dvl-desktop\@0.6.0 test

\> node tests/green-gate.cjs



PASS Schema and integrity before all schema/journal writes

PASS Mock picker IPC cancellation leaves last project empty

PASS Open-project IPC and same canonical path reuse ID

PASS Canonical alias reuses ID

PASS Settings IPC round trip and invalid inputs

PASS Secrets IPC verifies persisted ciphertext with status only

PASS Recent IPC selects older project and persists selection

PASS Missing recent returns null and unavailable; restored folder keeps ID

PASS BrowserWindow security flags

PASS Second instance restores minimized window; closed window recreated

PASS Before-quit checkpoints and closes database

PASS Restart preserves project, setting and decryptable secret via IPC

PASS Unreadable ciphertext returns boolean failure; row retained

PASS Unavailable encryption and mismatched round trip reject without write

PASS Delete-secret IPC removes row and reports status only

PASS Regular-file replacement not restored or registered

PASS Canonical path replaced by symlink cannot impersonate original project

PASS Legacy import executes on boot and is idempotent across restart

PASS Legacy regular-file path is rejected safely

PASS Rejected single-instance lock never opens or changes database

PASS Corrupt database handled, retained and never migrated

PASS Project content unchanged; logs contain no test secret values

PASS Failed round trip preserves existing ciphertext

PASS Renderer handles unreadable secret, IPC failure and stale recent

TOTAL CHECKS PASSED: 24



\> dvl-desktop\@0.6.0 test:c1b:control

\> node tests/c1b-ipc.cjs && node tests/c1b-policy.cjs && node tests/c1b-renderer.cjs



PASS Helper is outside asar and matches platform, architecture and startup digest

PASS Reject foreign webContents, child frames, wrong origin and detached frames

PASS Own main frame receives bounded context without root or rebinding capability

PASS Exact IPC schemas reject root injection, missing/unknown keys, bad query and extra args

PASS Wrong generation/project cannot reach the service

PASS Exception mapping never reveals exception text or helper payload

PASS Per-renderer pending ceiling and duplicate ownership do not overwrite a request

PASS A -> B fences an in-flight completion even when backend ignored cancellation

PASS Reload same URL fences old document, preserves rate budget and rebinds fresh generation

PASS Cancellation requires exact sender/frame/context ownership and code-maps throws

PASS Navigation/webviews/popups are blocked and renderer loss revokes binding

PASS Helper modification after startup is refused before spawning

PASS Close is idempotent, rejects reads and surfaces exact cleanup counts without content logs

C1b IPC CONTROL CHECKS PASSED: 13 (simulated completion; not native/Electron qualification)

PASS N-1 all derived protected home entries are rejected by the host

PASS N-1 native independently refuses protected credential roots before sandbox setup

PASS N-2 stored long-s/Kelvin/sharp-s names are denied by host and direct native

C1b POLICY CHECKS PASSED: 3 (pre-confinement; not OS qualification)

PASS Initial project obtains main-chosen generation and lists permitted entries as text

PASS Markup contents remain inert text

PASS Project switch clears visible content and fences a late result

PASS Search reports partial reason and counts without dropping semantics

PASS Stop fences late completion and invokes owned cancellation

PASS Shutdown shows exact pending/live/abandoned counts and disables reading

C1b RENDERER CONTROL CHECKS PASSED: 6 (DOM simulation; not browser qualification)



\> dvl-desktop\@0.6.0 test:native-secret

\> node tests/native-secret-check.cjs



Downloading Electron binary...

[18533:1019/162829.775294:ERROR:ui/gl/gl_display.cc:665] Initialization of all (1) EGL display types failed.

[18533:1019/162829.776253:ERROR:ui/gl/init/gl_initializer_mac.cc:127] GLDisplayEGL::Initialize failed.

[18533:1019/162829.776302:ERROR:ui/gl/gl_display.cc:665] Initialization of all (1) EGL display types failed.

[18533:1019/162829.776319:ERROR:ui/gl/init/gl_initializer_mac.cc:127] GLDisplayEGL::Initialize failed.

[18533:1019/162829.874611:ERROR:components/viz/service/main/viz_main_impl.cc:190] Exiting GPU process due to errors during initialization

[18538:1019/162830.960976:ERROR:ui/gl/gl_display.cc:665] Initialization of all (1) EGL display types failed.

[18538:1019/162830.961976:ERROR:ui/gl/init/gl_initializer_mac.cc:127] GLDisplayEGL::Initialize failed.

[18538:1019/162830.963126:ERROR:ui/gl/gl_display.cc:665] Initialization of all (1) EGL display types failed.

[18538:1019/162830.963166:ERROR:ui/gl/init/gl_initializer_mac.cc:127] GLDisplayEGL::Initialize failed.

[18538:1019/162831.086594:ERROR:components/viz/service/main/viz_main_impl.cc:190] Exiting GPU process due to errors during initialization

PASS Native Electron secret write through production preload and IPC

[18543:1019/162832.601222:ERROR:ui/gl/gl_display.cc:665] Initialization of all (1) EGL display types failed.

[18543:1019/162832.602734:ERROR:ui/gl/init/gl_initializer_mac.cc:127] GLDisplayEGL::Initialize failed.

[18543:1019/162832.602793:ERROR:ui/gl/gl_display.cc:665] Initialization of all (1) EGL display types failed.

[18543:1019/162832.602813:ERROR:ui/gl/init/gl_initializer_mac.cc:127] GLDisplayEGL::Initialize failed.

[18543:1019/162832.702824:ERROR:components/viz/service/main/viz_main_impl.cc:190] Exiting GPU process due to errors during initialization

PASS Native Electron secret read through production preload and IPC

PASS Native restart, clean shutdown, DB integrity and no secret in logs

NATIVE SECRET CHECK PASSED



\> dvl-desktop\@0.6.0 test:c1b:electron

\> node tests/c1b-electron.cjs



READY seatbelt

{"externalDenied":true,"writeDenied":true,"movedDenied":true,"truncateDenied":true}

PASS Mandatory OS boundary blocks direct outside read, write, and moved-directory injection

PASS Real directory list hides denied targets, links and non-regular files

PASS Read UTF-8 Unicode path, exact contents/hash and inert markup bytes

PASS Traversal, empty, absolute, backslash, drive and NUL rejected

PASS Denied targets blocked across read/list/search

PASS Symlink parent, internal symlink, hard link and FIFO cannot disclose bytes

PASS Binary, invalid encoding, oversized and missing files return bounded errors

PASS Literal search correct 1-based Unicode column and explicit skipped files

PASS Regex characters treated literally; empty/oversize query rejected

PASS Unknown keys, caller-supplied root, duplicate IDs and bad project rejected

PASS Cancellation and A → B → A fence pending and old-generation results

PASS Root identity replacement invalidates capability

PASS Pagination bounded to 200, cursor single-use, directory changes reject cursor

PASS Result limit caps matches and labels partial

PASS Unavailable backend fails closed, no path-only fallback

PASS File inventory including .git/hidden/ignored bytes unchanged; .dvl absent

PASS Close cancels pending requests and leaves no tracked helper

C1a CHECKS PASSED: 17 platform: darwin x64

REPAIRED NATIVE MODE seatbelt

PASS Native sandbox operational; repaired service reads actual fixture bytes

ALIAS RESOLUTION ".ſsh/config" true

ALIAS RESOLUTION ".awſ/credentialſ" true

ALIAS RESOLUTION "id_rſa" true

ALIAS RESOLUTION ".ßh/config" true

ALIAS RESOLUTION ".AWS/CREDENTIALS" true

ALIAS RESOLUTION "srv.Key" true

PASS F1 direct native AND service deny actual sensitive-name aliases before content disclosure

PASS F1 exact stored Unicode spelling works; normalization aliases fail closed or are exact

PASS Native helper independently rejects wrong root inode (bypasses host check)

PASS Persistent native protocol cannot rebind root or introduce a new method

PASS F11 root quoting/escaping: spaces, quotes, backslash and Arabic

PASS Real child cancellation AFTER spawn returns no content and reaps child

PASS Real child A → B switch AFTER spawn fences old response

100 READS MS 2733.39

PASS F3 100 sequential reads record target latency without leaking helpers

500 FILE SEARCH MS 951.23 HELPERS 1

PASS F3 persistent sandbox: complete 500-file search in the unchanged 5-second budget

C1a REPAIR NATIVE CHECKS PASSED: 10 darwin x64

PASS N-1 all derived protected home entries are rejected by the host

PASS N-1 native independently refuses protected credential roots before sandbox setup

PASS N-2 stored long-s/Kelvin/sharp-s names are denied by host and direct native

C1b POLICY CHECKS PASSED: 3 (pre-confinement; not OS qualification)

PASS Native suites in Electron embedded Node (not UI tests)

[18783:1019/162842.246020:ERROR:ui/gl/gl_display.cc:665] Initialization of all (1) EGL display types failed.

[18783:1019/162842.246961:ERROR:ui/gl/init/gl_initializer_mac.cc:127] GLDisplayEGL::Initialize failed.

[18783:1019/162842.246998:ERROR:ui/gl/gl_display.cc:665] Initialization of all (1) EGL display types failed.

[18783:1019/162842.247010:ERROR:ui/gl/init/gl_initializer_mac.cc:127] GLDisplayEGL::Initialize failed.

[18783:1019/162842.331351:ERROR:components/viz/service/main/viz_main_impl.cc:190] Exiting GPU process due to errors during initialization

PASS Real Electron preload has narrow methods and no renderer binding/root API

PASS Actual native list/read/search through production IPC

PASS Live UI displays markup as text and does not execute it

PASS Production IPC refuses caller root, traversal, denied file and extra query keys

PASS Native B regression: regular-file and symlink replacements cannot impersonate a registered project

[18786:1019/162843.131756:ERROR:ui/gl/gl_display.cc:665] Initialization of all (1) EGL display types failed.

[18786:1019/162843.132387:ERROR:ui/gl/init/gl_initializer_mac.cc:127] GLDisplayEGL::Initialize failed.

[18786:1019/162843.132428:ERROR:ui/gl/gl_display.cc:665] Initialization of all (1) EGL display types failed.

[18786:1019/162843.132443:ERROR:ui/gl/init/gl_initializer_mac.cc:127] GLDisplayEGL::Initialize failed.

PASS Project A -> B rejects old context; new context reads only B

[18786:1019/162843.232231:ERROR:components/viz/service/main/viz_main_impl.cc:190] Exiting GPU process due to errors during initialization

PASS Reload obtains a fresh generation and clears previous visible bytes

PASS Fixture bytes unchanged, .dvl absent, no query/contents in logs

C1B_ELECTRON_INTEGRATION_PASS 8 darwin x64

C1B_ELECTRON_GATE_PASS (includes clean shutdown counts; independent review still required)

user\@MacBook-Air-de-User dvl-desktop-C1b %