# cftunnel-app

**cftunnel desktop client** — a lightweight Wails desktop app for sharing local services through Cloudflare Tunnel.

[中文文档](README.md)

## One-click sharing

Open the app and the home screen automatically checks common development ports (`3000`, `5173`, `8080`, `8000`, and more). Select a detected service and click **Generate public URL**.

- No domain setup
- No Cloudflare login or API token for temporary sharing
- `cloudflared` is downloaded from the official Cloudflare release and cached locally
- Copy or open the generated `*.trycloudflare.com` URL

![Quick share overview](docs/images/quick-share-overview.png)

## Optional configuration

The default one-click mode stays enabled. Under **Advanced features → Settings**, turn on **Fixed domain mode** only when you need a persistent Cloudflare Tunnel. Enter the Cloudflare Account ID and API Token, then save. The client never stores a web-login password.

Under **Advanced features → About**, the update center checks both the desktop client and the `cftunnel` CLI on startup. The CLI can be updated with one click; the desktop update opens the matching release download page. Startup checks can be disabled in **Settings**.

Relay TCP/UDP settings, SSH credentials, logs, and diagnostics remain available under Advanced features.

![Settings and mode switch](docs/images/settings-mode.png)

## Downloads

Download the latest package from [GitHub Releases](https://github.com/qingchencloud/cftunnel-app/releases):

| Platform | Package |
| --- | --- |
| macOS | `cftunnel-app-macos.zip` |
| Windows | `cftunnel-app-windows.zip` |
| Linux | `cftunnel-app-linux.tar.gz` |

## Development

```bash
# Install Wails CLI
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# Run in development mode
wails dev

# Build the desktop package
wails build

# Run Go tests
go test ./...
```

The app is built with Go + Wails v2 and React + TypeScript. The advanced screens call the optional [cftunnel CLI](https://github.com/qingchencloud/cftunnel); the one-click home flow works without pre-configuring it.

## Community

- [Telegram group](https://t.me/+-53et5QXFh0xYzhk)

## License

MIT
