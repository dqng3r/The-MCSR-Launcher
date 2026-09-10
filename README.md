# MCSR Launcher

A focused Windows launcher for Minecraft 1.16.1 speedrunning, with RSG and Practice instances, built-in speedrunning mods, recommended settings, and Microsoft account support.

## Companion tools

- **Jingle** can launch alongside Minecraft, detect the game instance, and keep resizing and borderless window controls available.
- **NinjaBrainBot** can launch automatically with RSG when enabled in the launcher.

Jingle is downloaded from its [official DuncanRuns release](https://github.com/DuncanRuns/Jingle/releases) the first time its launcher toggle is enabled. Java must be available on the system to run companion tools.

## Development

```powershell
npm install
npm run build
```

The launcher uses Electron, React, Vite, and Fabric for Minecraft 1.16.1.
