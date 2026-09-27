No source-code changes are needed. Use these PowerShell commands whenever you want to run it.

### Terminal 1 — API

```powershell
cd C:\Users\kumanave\NJ_SPL

$nodeDir = "$PWD\tools\node-v22.20.0-win-x64"
$env:Path = "$nodeDir;$env:Path"

npm install
npm test
npm run dev
```

API: http://localhost:3001  
Health: http://localhost:3001/health

### Terminal 2 — Web UI

```powershell
cd C:\Users\kumanave\NJ_SPL

$nodeDir = "$PWD\tools\node-v22.20.0-win-x64"
$env:Path = "$nodeDir;$env:Path"

npm install --prefix web
npm run web
```

Open: http://127.0.0.1:5173/

### Normal rerun

After dependencies are installed, only these are needed:

```powershell
# Terminal 1
cd C:\Users\kumanave\NJ_SPL
$env:Path = "$PWD\tools\node-v22.20.0-win-x64;$env:Path"
npm run dev
```

```powershell
# Terminal 2
cd C:\Users\kumanave\NJ_SPL
$env:Path = "$PWD\tools\node-v22.20.0-win-x64;$env:Path"
npm run web
```

Press `Ctrl+C` in each terminal to stop the servers.
