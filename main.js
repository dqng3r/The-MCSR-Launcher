const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');
const extractZip = require('extract-zip');
const { Client } = require('minecraft-launcher-core');
const { Auth } = require('msmc');
const speedrunningMods = require('./speedrunning-mods.json');

let mainWindow;
const launcherIconPath = path.join(__dirname, 'src', 'logo.ico');
if (process.platform === 'win32') app.setAppUserModelId('com.mcsr.client');
const sessionPath = path.join(app.getPath('userData'), 'session.json');
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const ninjabrainBotPath = path.join(app.getPath('userData'), 'ninjabrainbot', 'Ninjabrain-Bot-1.5.2.jar');
const ninjabrainBotUrl = 'https://github.com/Ninjabrain1/Ninjabrain-Bot/releases/download/1.5.2/Ninjabrain-Bot-1.5.2.jar';
const minecraftVersion = '1.16.1';
const practiceRootName = '.mcsr-practice';
const rsgRootName = '.mcsr';
const practiceMapUrl = 'https://github.com/Dibedy/The-MCSR-Practice-Map/releases/download/latest/MCSR.Practice.v2.0.0.zip';
const fabricLoaderVersion = '0.16.0';
const fabricVersionId = `fabric-loader-${fabricLoaderVersion}-${minecraftVersion}`;

const recommendedOptions = {
  entityDistanceScaling: '0.5',
  renderDistance: '8',
  gamma: '5.0',
  fov: '1.0',
  toggleSprint: '1',
  'key_key.sprint': 'key.keyboard.left.control',
  hitboxes: 'true',
  chunkborders: 'true',
  pieDirectory: 'root.gameRenderer.level.entities.block_entities',
  chatScale: '0.6',
  soundCategory_music: '0.0',
  showSubtitles: 'true',
  enableVsync: 'false',
  fullscreen: 'true',
  graphicsMode: '1',
  guiScale: '4',
  autoJump: 'false',
  renderClouds: '0',
  particles: '1',
  bobView: 'false'
};

function writeRecommendedOptions(rootPath, godSensitivity) {
  const optionsPath = path.join(rootPath, 'options.txt');
  const values = { ...recommendedOptions };
  values.mouseSensitivity = godSensitivity ? '0.02291165' : '0.5';

  const existing = fs.existsSync(optionsPath) ? fs.readFileSync(optionsPath, 'utf8') : '';
  const lines = existing.split(/\r?\n/).filter(Boolean);
  const knownKeys = new Set(Object.keys(values));
  const updated = lines.filter(line => {
    const key = line.slice(0, line.indexOf(':'));
    return key !== 'sensitivity' && !knownKeys.has(key);
  });
  updated.push(...Object.entries(values).map(([key, value]) => `${key}:${value}`));
  fs.writeFileSync(optionsPath, `${updated.join('\n')}\n`);

  const standardSettingsPath = path.join(rootPath, 'config', 'mcsr', 'standardsettings.json');
  fs.mkdirSync(path.dirname(standardSettingsPath), { recursive: true });
  const standardSettings = fs.existsSync(standardSettingsPath)
    ? JSON.parse(fs.readFileSync(standardSettingsPath, 'utf8'))
    : {};
  Object.assign(standardSettings, {
    fov: 110.0,
    graphicsMode: 1,
    renderDistance: 8.0,
    gamma: 5.0,
    enableVsync: false,
    fullscreen: true,
    bobView: false,
    guiScale: 4,
    renderClouds: 0,
    particles: 1,
    entityDistanceScaling: 0.5,
    soundCategory_music: 0.0,
    showSubtitles: true,
    autoJump: false,
    mouseSensitivity: godSensitivity ? 0.02291165 : standardSettings.mouseSensitivity ?? 0.5,
    chatScale: 0.6,
    toggleSprint: 1,
    hitboxes: { enabled: true, value: true },
    chunkborders: { enabled: true, value: true },
    pieDirectory: { enabled: true, value: 'root.gameRenderer.level.entities.block_entities' }
  });
  const extraOptionsPath = path.join(rootPath, 'config', 'mcsr', 'extra-options.json');
  const extraOptions = fs.existsSync(extraOptionsPath)
    ? JSON.parse(fs.readFileSync(extraOptionsPath, 'utf8'))
    : {};
  Object.assign(extraOptions, {
    distortionEffectScale: 0.0,
    fovEffectScale: 0.0
  });
  fs.writeFileSync(extraOptionsPath, JSON.stringify(extraOptions, null, 2));
  fs.writeFileSync(standardSettingsPath, JSON.stringify(standardSettings, null, 2));
}

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const request = https.get(url, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadFile(response.headers.location, destination).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed (${response.statusCode}): ${url}`));
        return;
      }

      const temporaryPath = `${destination}.download`;
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
      const file = fs.createWriteStream(temporaryPath);
      response.pipe(file);
      file.on('finish', () => file.close(() => {
        fs.renameSync(temporaryPath, destination);
        resolve();
      }));
      file.on('error', error => {
        file.close(() => {});
        if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
        reject(error);
      });
    });
    request.on('error', reject);
  });
}

async function ensureFile(url, destination) {
  if (fs.existsSync(destination) && fs.statSync(destination).size > 0) return;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  await downloadFile(url, destination);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Metadata download failed (${response.status}): ${url}`);
  return response.json();
}

ipcMain.handle('get-settings', async () => {
  try {
    if (fs.existsSync(settingsPath)) return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (error) {
    console.error('Failed to read settings', error);
  }
  return { theme: 'dark', enabledMods: speedrunningMods.map(mod => mod.mod_id), recommendedSettings: false, godSensitivity: false, autoOpenNinjabrainBot: false };
});

ipcMain.handle('get-mods', async () => speedrunningMods.map(({ name, mod_id }) => ({ name, mod_id })));

ipcMain.handle('get-ninjabrainbot-status', async () => ({ installed: fs.existsSync(ninjabrainBotPath) && fs.statSync(ninjabrainBotPath).size > 0 }));

ipcMain.handle('install-ninjabrainbot', async () => {
  try {
    fs.mkdirSync(path.dirname(ninjabrainBotPath), { recursive: true });
    await ensureFile(ninjabrainBotUrl, ninjabrainBotPath);
    return { success: true, path: ninjabrainBotPath };
  } catch (error) {
    console.error('Failed to install Ninjabrain Bot', error);
    return { success: false, error: error.stack || String(error) };
  }
});

ipcMain.handle('select-practice-hotbar', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Practice hotbar.nbt',
    properties: ['openFile'],
    filters: [{ name: 'Minecraft hotbar', extensions: ['nbt'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };
  const practiceRoot = path.join(app.getPath('userData'), practiceRootName);
  fs.mkdirSync(practiceRoot, { recursive: true });
  fs.copyFileSync(result.filePaths[0], path.join(practiceRoot, 'hotbar.nbt'));
  return { success: true };
});

ipcMain.handle('save-settings', async (event, settings) => {
  try {
    const allowedModIds = new Set(speedrunningMods.map(mod => mod.mod_id));
    const enabledMods = Array.isArray(settings?.enabledMods)
      ? settings.enabledMods.filter(modId => allowedModIds.has(modId))
      : speedrunningMods.map(mod => mod.mod_id);
    const safeSettings = {
      theme: settings?.theme === 'light' ? 'light' : 'dark',
      enabledMods,
      recommendedSettings: settings?.recommendedSettings === true,
      godSensitivity: settings?.godSensitivity === true,
      autoOpenNinjabrainBot: settings?.autoOpenNinjabrainBot === true
    };
    fs.writeFileSync(settingsPath, JSON.stringify(safeSettings, null, 2));
    return safeSettings;
  } catch (error) {
    console.error('Failed to save settings', error);
    return null;
  }
});

async function installSpeedrunningPack(rootPath, sendLog, enabledModIds) {
  const modsPath = path.join(rootPath, 'mods');
  fs.mkdirSync(modsPath, { recursive: true });
  const enabled = new Set(enabledModIds);
  const selectedMods = speedrunningMods.filter(mod => enabled.has(mod.mod_id));

  for (const mod of speedrunningMods) {
    if (!enabled.has(mod.mod_id)) {
      const disabledPath = path.join(modsPath, mod.filename);
      if (fs.existsSync(disabledPath)) fs.unlinkSync(disabledPath);
    }
  }

  sendLog(`Preparing Fabric ${fabricLoaderVersion} and ${selectedMods.length} speedrunning mods...`);
  const profileUrl = `https://meta.fabricmc.net/v2/versions/loader/${minecraftVersion}/${fabricLoaderVersion}/profile/json`;
  const versionPath = path.join(rootPath, 'versions', fabricVersionId, `${fabricVersionId}.json`);
  fs.mkdirSync(path.dirname(versionPath), { recursive: true });
  const fabricProfile = await fetchJson(profileUrl);
  let versionProfile = fs.existsSync(versionPath)
    ? JSON.parse(fs.readFileSync(versionPath, 'utf8'))
    : null;

  if (!versionProfile || !versionProfile.downloads?.client) {
    sendLog(`Preparing vanilla ${minecraftVersion} metadata for Fabric...`);
    const manifest = await fetchJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    const vanillaVersion = manifest.versions.find(version => version.id === minecraftVersion);
    if (!vanillaVersion) throw new Error(`Minecraft ${minecraftVersion} was not found in Mojang's version manifest`);
    const vanillaProfile = await fetchJson(vanillaVersion.url);

    versionProfile = {
      ...vanillaProfile,
      ...fabricProfile,
      id: fabricVersionId,
      inheritsFrom: minecraftVersion,
      downloads: vanillaProfile.downloads,
      assetIndex: vanillaProfile.assetIndex,
      assets: vanillaProfile.assets,
      libraries: [...(vanillaProfile.libraries || []), ...(fabricProfile.libraries || [])]
    };
    fs.writeFileSync(versionPath, JSON.stringify(versionProfile, null, 2));
  }

  for (const mod of selectedMods) {
    sendLog(`Checking ${mod.name}...`);
    await ensureFile(mod.download_url, path.join(modsPath, mod.filename));
  }
}

async function installPracticeMap(practiceRoot, sendLog) {
  const worldsPath = path.join(practiceRoot, 'saves');
  const worldDestination = path.join(worldsPath, 'MCSR Practice');
  const markerPath = path.join(practiceRoot, '.mcsr-practice-map-installed');
  if (fs.existsSync(path.join(worldDestination, 'level.dat'))) return;

  const findWorld = directory => {
    if (!fs.existsSync(directory)) return null;
    if (fs.existsSync(path.join(directory, 'level.dat'))) return directory;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== 'saves') {
        const world = findWorld(path.join(directory, entry.name));
        if (world) return world;
      }
    }
    return null;
  };

  const rootContainsWorld = fs.existsSync(path.join(practiceRoot, 'level.dat'));
  let worldSource = rootContainsWorld ? practiceRoot : findWorld(practiceRoot);
  const archivePath = path.join(practiceRoot, 'MCSR.Practice.v2.0.0.zip');
  if (!worldSource) {
    if (!fs.existsSync(archivePath)) {
      sendLog('Downloading the official MCSR Practice Map...');
      await ensureFile(practiceMapUrl, archivePath);
    }
    await extractZip(archivePath, { dir: practiceRoot });
    fs.unlinkSync(archivePath);
    worldSource = findWorld(practiceRoot);
  }

  if (!worldSource) throw new Error('The Practice Map archive did not contain a Minecraft world (level.dat).');
  fs.mkdirSync(worldsPath, { recursive: true });
  if (path.resolve(worldSource) === path.resolve(practiceRoot)) {
    const worldEntries = [
      'level.dat', 'level.dat_old', 'session.lock', 'icon.png', 'region', 'entities', 'poi',
      'data', 'playerdata', 'advancements', 'stats', 'DIM-1', 'DIM1'
    ];
    fs.mkdirSync(worldDestination, { recursive: true });
    for (const entry of worldEntries) {
      const sourcePath = path.join(practiceRoot, entry);
      if (fs.existsSync(sourcePath)) fs.renameSync(sourcePath, path.join(worldDestination, entry));
    }
  } else if (path.resolve(worldSource) !== path.resolve(worldDestination)) {
    if (fs.existsSync(worldDestination)) fs.rmSync(worldDestination, { recursive: true, force: true });
    fs.renameSync(worldSource, worldDestination);
  }
  fs.writeFileSync(markerPath, 'MCSR Practice Map v2.0.0');
}

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 950,
    height: 600,
    icon: launcherIconPath,
    resizable: false,
    frame: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-close', () => mainWindow?.close());

ipcMain.handle('open-instance-folder', async (event, instance) => {
  const instanceName = instance === 'practice' ? practiceRootName : rsgRootName;
  const instancePath = path.join(app.getPath('userData'), instanceName);
  try {
    fs.mkdirSync(instancePath, { recursive: true });
    const error = await shell.openPath(instancePath);
    return error ? { success: false, error } : { success: true, path: instancePath };
  } catch (error) {
    return { success: false, error: error.stack || String(error) };
  }
});

ipcMain.handle('get-session', async () => {
  try {
    if (fs.existsSync(sessionPath)) {
      const data = fs.readFileSync(sessionPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Failed to read session", e);
  }
  return null;
});

ipcMain.handle('save-session', async (event, profile) => {
  try {
    fs.writeFileSync(sessionPath, JSON.stringify(profile, null, 2));
    return true;
  } catch (e) {
    console.error("Failed to save session", e);
    return false;
  }
});

ipcMain.handle('clear-session', async () => {
  try {
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
    }
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('microsoft-login', async () => {
  try {
    const authManager = new Auth('select_account');
    const xbox = await authManager.launch('electron', {
      width: 500,
      height: 650,
      resizable: false,
      parent: mainWindow
    });
    const minecraft = await xbox.getMinecraft();
    if (!minecraft.profile) throw new Error('No active Minecraft profile found on this account');

    const token = minecraft.mclc(true);
    return {
      success: true,
      profile: {
        id: minecraft.profile.id,
        name: minecraft.profile.name,
        mcToken: token.access_token,
        isOnline: true
      }
    };
  } catch (error) {
    console.error('Microsoft authentication failed', error);
    return { success: false, error: error.stack || String(error) };
  }
});

ipcMain.handle('launch-mc', async (event, options) => {
  const launcher = new Client();
  const isPractice = options?.instance === 'practice';
  const rootPath = path.join(app.getPath('userData'), isPractice ? practiceRootName : '.mcsr');
  const sendLog = data => mainWindow.webContents.send('mc-log', data);

  const username = (options && options.name && options.name.trim()) ? options.name.trim() : "Player";
  const uuid = (options && options.uuid && options.uuid.trim()) ? options.uuid.trim() : "00000000000000000000000000000000";
  const token = (options && options.mcToken && options.mcToken.trim()) ? options.mcToken.trim() : "0";

  const opts = {
    authorization: {
      access_token: token,
      client_token: "mcsr-client",
      uuid: uuid,
      name: username,
      user_properties: "{}"
    },
    root: rootPath,
    version: {
      number: minecraftVersion,
      type: "release",
      custom: fabricVersionId
    },
    memory: {
      max: "4G",
      min: "2G"
    },
    customLaunchArgs: [
      "--add-opens=java.base/java.lang=ALL-UNNAMED",
      "--add-opens=java.base/java.lang.reflect=ALL-UNNAMED",
      "--add-opens=java.base/java.util=ALL-UNNAMED"
    ],
    overrides: {
      detached: false,
      gameDirectory: rootPath,
      fw: {
        width: 854,
        height: 480
      }
    }
  };

  launcher.on('debug', sendLog);
  launcher.on('data', sendLog);
  launcher.on('download-status', (e) => sendLog(`Downloading: ${e.name}`));
  
  // Detects when Minecraft closes and notifies the UI
  launcher.on('close', code => {
    sendLog(`[MCSR] Minecraft exited with code ${code}`);
    mainWindow.webContents.send('mc-close');
  });
  
  try {
    const enabledModIds = Array.isArray(options?.enabledMods)
      ? options.enabledMods
      : speedrunningMods.map(mod => mod.mod_id);
    await installSpeedrunningPack(rootPath, sendLog, enabledModIds);
    if (isPractice) await installPracticeMap(rootPath, sendLog);
    if (options?.recommendedSettings) {
      writeRecommendedOptions(rootPath, options.godSensitivity === true);
      sendLog(`Applied recommended ${options.godSensitivity ? 'god sensitivity and ' : ''}speedrunning settings.`);
    }
    const minecraftProcess = await launcher.launch(opts);
    if (!minecraftProcess) throw new Error('Minecraft failed to start. Check the live game logs for details.');
    if (options?.autoOpenNinjabrainBot) {
      fs.mkdirSync(path.dirname(ninjabrainBotPath), { recursive: true });
      await ensureFile(ninjabrainBotUrl, ninjabrainBotPath);
      sendLog('Opening Ninjabrain Bot...');
      const botProcess = spawn('java', ['-jar', ninjabrainBotPath], { detached: true, stdio: 'ignore' });
      botProcess.unref();
    }
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.stack || String(err) };
  }
});
