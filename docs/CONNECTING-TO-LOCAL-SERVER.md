# Connecting to Your Local Screeps Server

Use this when your **Screeps server runs on Windows** and you develop in **WSL2**.

## 1. Configure `screeps.json`

Create or edit `screeps.json` in the project root (copy from `screeps.sample.json` if needed). For a local server:

```json
{
  "pserver": {
    "email": "YourSteamUsername",
    "password": "YourPassword",
    "protocol": "http",
    "hostname": "localhost",
    "port": 21025,
    "path": "/",
    "branch": "main"
  }
}
```

- **email**: Your Steam username (same as in the game).
- **password**: Set once via http://localhost:21025/authmod/password/ or in the server CLI: `setPassword('YourUsername', 'YourPassword')`.

If you use a **token** instead of password, replace `email`/`password` with:

```json
"token": "your-token-from-get-token-wsl"
```

## 2. Deploy from WSL

From your project in WSL, run:

```bash
pnpm run deploy:local
```

This builds your code and pushes it to the server on your Windows host (it uses the WSL default gateway as the host).

## 3. Watch mode (optional)

To rebuild and push on every change:

```bash
pnpm run watch:local
```

## If API auth doesn’t work (404 on signin)

If your server doesn’t expose the auth API (e.g. screepsmod-auth not loaded), use **folder deployment** instead:

1. Find your server’s script folder (e.g. from the game client: “Open local folder” in the script editor).
2. From WSL, for example:
   ```bash
   pnpm run build
   SCREEPS_LOCAL_PATH="/mnt/c/Users/YOUR_USER/AppData/Local/Screeps/scripts/YOUR_STEAM_NAME___12345" pnpm run deploy-local
   ```

See **DEPLOY-LOCAL-SERVER.md** for more detail.
