# Deploying to a Local Screeps Server (WSL + Windows)

## The Problem

When running the Screeps server on **Windows** and your code in **WSL2**, API-based deployment can fail because:

1. **Connection**: `localhost` in WSL points to the WSL VM, not the Windows host
2. **Authentication**: Your server may have `useNativeAuth: true` and the screepsmod-auth routes (`/api/auth/signin`, `/api/authmod`) return 404

## Solution 1: Local Folder Deployment (Recommended when API auth fails)

From WSL, run:

```bash
pnpm run deploy:local
```

This builds your code and copies `dist/main.js` and `dist/main.js.map.js` into your local server's script folder. No server auth required.

**Path detection:** On WSL we auto-detect your Windows Screeps script folder under `C:\Users\<You>\AppData\Local\Screeps\scripts\`. If you have multiple script folders (e.g. multiple servers), we use the most recently modified one. To force a specific folder:

```bash
export SCREEPS_LOCAL_PATH="/mnt/c/Users/YOU/AppData/Local/Screeps/scripts/YourName___21025"
pnpm run deploy:local
```

## Solution 2: API Deployment (when screepsmod-auth works)

If your server has screepsmod-auth properly loaded:

1. **Set a password** (one-time):
   - Web: http://YOUR_SERVER:21025/authmod/password/
   - Or in server CLI: `setPassword('YourUsername', 'YourPassword')`

2. **From WSL**, use the WSL-specific push command:
   ```bash
   pnpm run push-pserver-wsl
   ```

3. **Get a token** (optional, for passwordless deploys):
   ```bash
   pnpm run get-token-wsl
   ```
   Then add the token to `screeps.json` and remove email/password.

## Fixing screepsmod-auth 404

If `/api/authmod` returns 404, the auth mod may not be loading. Try:

1. Reinstall: `npm install isolated-vm && npm install screeps && npx screeps init && npm install screepsmod-auth && npm run screeps install`
2. Ensure screepsmod-auth is in your `mods.json` or `package.json` mods
3. Restart the server after mod changes
