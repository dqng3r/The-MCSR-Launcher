import React, { useState, useEffect } from "react";
import { LogIn, AlertCircle, Terminal, UserCheck, Minus, X, LogOut, ShieldCheck, Copy, Check, UserPlus, Sun, Moon, SlidersHorizontal } from "lucide-react";
import mcsrLogo from "./logo.svg";
import mcsrLogoLight from "./logo-light.svg";
const { ipcRenderer, clipboard, shell } = window.require("electron");

export default function App() {
  const [step, setStep] = useState("loading");
  const [theme, setTheme] = useState("dark");
  const [modsOpen, setModsOpen] = useState(false);
  const [pacemanOpen, setPacemanOpen] = useState(false);
  const [pacemanToken, setPacemanToken] = useState("");
  const [hotbarSelected, setHotbarSelected] = useState(false);
  const [mods, setMods] = useState<any[]>([]);
  const [enabledMods, setEnabledMods] = useState<string[]>([]);
  const [recommendedSettings, setRecommendedSettings] = useState(false);
  const [godSensitivity, setGodSensitivity] = useState(false);
  const [autoOpenNinjabrainBot, setAutoOpenNinjabrainBot] = useState(false);
  const [errorCopied, setErrorCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [offlineName, setOfflineName] = useState("Speedrunner");
  const [mcProfile, setMcProfile] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([ipcRenderer.invoke('get-session'), ipcRenderer.invoke('get-settings'), ipcRenderer.invoke('get-mods')]).then(([savedProfile, settings, bundledMods]: any[]) => {
      setTheme(settings?.theme === "light" ? "light" : "dark");
      setEnabledMods(settings?.enabledMods || bundledMods.map(mod => mod.mod_id));
      setRecommendedSettings(settings?.recommendedSettings === true);
      setGodSensitivity(settings?.godSensitivity === true);
      setAutoOpenNinjabrainBot(settings?.autoOpenNinjabrainBot === true);
      setMods(bundledMods);
      if (savedProfile && savedProfile.name) {
        setMcProfile(savedProfile);
        setStep("ready");
      } else {
        setStep("login");
      }
    }).catch(() => setStep("login"));

    ipcRenderer.on('mc-log', (e: any, data: string) => {
      setLogs(prev => [...prev, data].slice(-20));
    });

    // Reset UI to launch screen when Minecraft exits
    ipcRenderer.on('mc-close', () => {
      setStep("ready");
    });
  }, []);

  const changeTheme = (nextTheme: string) => {
    setTheme(nextTheme);
    ipcRenderer.invoke('save-settings', { theme: nextTheme, enabledMods, recommendedSettings, godSensitivity, autoOpenNinjabrainBot });
  };

  const toggleMod = (modId: string) => {
    const nextMods = enabledMods.includes(modId)
      ? enabledMods.filter(id => id !== modId)
      : [...enabledMods, modId];
    setEnabledMods(nextMods);
    ipcRenderer.invoke('save-settings', { theme, enabledMods: nextMods, recommendedSettings, godSensitivity, autoOpenNinjabrainBot });
  };

  const saveOptionSettings = (nextRecommended: boolean, nextGodSensitivity: boolean) => {
    setRecommendedSettings(nextRecommended);
    setGodSensitivity(nextGodSensitivity);
    ipcRenderer.invoke('save-settings', { theme, enabledMods, recommendedSettings: nextRecommended, godSensitivity: nextGodSensitivity, autoOpenNinjabrainBot });
  };

  const toggleNinjabrainBot = (enabled: boolean) => {
    setAutoOpenNinjabrainBot(enabled);
    ipcRenderer.invoke('save-settings', { theme, enabledMods, recommendedSettings, godSensitivity, autoOpenNinjabrainBot: enabled });
  };

  const saveProfileAndContinue = async (profileData: any) => {
    setMcProfile(profileData);
    await ipcRenderer.invoke('save-session', profileData);
    setStep("ready");
  };

  const logout = async () => {
    await ipcRenderer.invoke('clear-session');
    setMcProfile(null);
    setStep("login");
  };

  const startAuth = async () => {
    try {
      setStep("auth_pending");
      setStatusMsg("Opening Microsoft sign-in...");
      const result = await ipcRenderer.invoke('microsoft-login');
      if (!result.success) throw new Error(result.error);
      await saveProfileAndContinue(result.profile);
    } catch (err) {
      setStatusMsg(`Auth Error: ${String(err)}`);
      setStep("error");
    }
  };

  const copyError = () => {
    clipboard.writeText(statusMsg);
    setErrorCopied(true);
  };

  const openPacemanAuth = () => shell.openExternal("https://auth.aristois.net/auth");

  const connectPaceman = () => {
    const params = new URLSearchParams({
      client_id: "d6wgllgvaa3q3xv5ji4q9uvk2iveau",
      redirect_uri: "https://paceman.gg/api/twitch/oauth",
      response_type: "code",
      scope: "openid",
      force_verify: "false",
      state: pacemanToken.trim()
    });
    shell.openExternal(`https://id.twitch.tv/oauth2/authorize?${params.toString()}`);
    setPacemanOpen(false);
  };

  const openMpkEditor = () => shell.openExternal("https://repeater64.github.io/AdvancedMpkEditor/");

  const selectPracticeHotbar = async () => {
    const result = await ipcRenderer.invoke('select-practice-hotbar');
    if (result.success) setHotbarSelected(true);
  };

  const openInstanceFolder = async (instance: "rsg" | "practice") => {
    const result = await ipcRenderer.invoke('open-instance-folder', instance);
    if (!result.success) {
      setStatusMsg(`Could not open instance folder: ${result.error}`);
      setStep("error");
    }
  };


  const launchGame = async (instance: "rsg" | "practice") => {
    setStep("launching");
    const profileToUse = mcProfile || { name: offlineName, id: "00000000000000000000000000000000", mcToken: "0" };
    const result = await ipcRenderer.invoke('launch-mc', {
      mcToken: profileToUse.mcToken,
      uuid: profileToUse.id,
      name: profileToUse.name,
      enabledMods,
      recommendedSettings,
      godSensitivity,
      autoOpenNinjabrainBot,
      instance
    });

    if (!result.success) {
      setStatusMsg(`Engine Crash: ${result.error}`);
      setStep("error");
    }
  };

  const useOfflineMode = async () => {
    await saveProfileAndContinue({
      id: "00000000000000000000000000000000",
      name: offlineName || "Speedrunner",
      mcToken: "0",
      isOnline: false
    });
  };

  return (
    <div className={`app-shell theme-${theme}`} style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column", backgroundColor: "#060811", color: "#f8fafc", overflow: "hidden" }}>
      <div className="titlebar" style={{ height: "60px", backgroundColor: "#0b0f19", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", WebkitAppRegion: "drag" } as any}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img className="mcsr-logo mcsr-logo-small" src={theme === "light" ? mcsrLogoLight : mcsrLogo} alt="MCSR Launcher" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px", WebkitAppRegion: "no-drag" } as any}>
          <button className="toolbar-button" onClick={() => setModsOpen(!modsOpen)} title="Manage built-in speedrunning mods"><SlidersHorizontal size={15} /> Mods</button>
          <button className="toolbar-button" onClick={() => setPacemanOpen(true)} title="Connect PaceMan tracker">PaceMan</button>
          <button className="toolbar-button" onClick={() => shell.openExternal("https://github.com/jojoe77777/Toolscreen/releases/latest")} title="Download ToolScreen">ToolScreen download</button>
          <button className="toolbar-icon" onClick={() => changeTheme(theme === "dark" ? "light" : "dark")} title={theme === "dark" ? "Use light mode" : "Use dark mode"}>{theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}</button>
          <button onClick={() => ipcRenderer.send('window-minimize')} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", padding: "6px", display: "flex" }}>
            <Minus size={16} />
          </button>
          <button onClick={() => ipcRenderer.send('window-close')} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", padding: "6px", display: "flex" }}>
            <X size={16} />
          </button>
        </div>
      </div>

      {modsOpen && <div className="mods-menu">
        <div className="mods-menu-header"><div><strong>Speedrunning Mods</strong><span>Built-in pack only</span></div><button className="toolbar-icon" onClick={() => setModsOpen(false)} title="Close mod menu"><X size={15} /></button></div>
        <div className="mods-list">
          <label className="mod-row"><input type="checkbox" checked={recommendedSettings} onChange={event => saveOptionSettings(event.target.checked, godSensitivity)} /><span>Recommended settings</span></label>
          <label className={`mod-row ${!recommendedSettings ? "mod-row-disabled" : ""}`}><input type="checkbox" checked={godSensitivity} disabled={!recommendedSettings} onChange={event => saveOptionSettings(recommendedSettings, event.target.checked)} /><span>God sens (0.02291165)</span></label>
          <div className="settings-note">Applies render distance, gamma, FOV, controls, audio, HUD, graphics, particles, and view settings before launch.</div>
          {mods.map(mod => <label className="mod-row" key={mod.mod_id}><input type="checkbox" checked={enabledMods.includes(mod.mod_id)} onChange={() => toggleMod(mod.mod_id)} /><span>{mod.name}</span></label>)}
        </div>
      </div>}

      <div className="tools-dock"><label className="bot-toggle"><input type="checkbox" checked={autoOpenNinjabrainBot} onChange={event => toggleNinjabrainBot(event.target.checked)} /><span><strong>NinjaBrainBot</strong><small>Open with RSG</small></span></label></div>

      {pacemanOpen && <div className="modal-backdrop" onClick={() => setPacemanOpen(false)}>
        <div className="paceman-dialog" onClick={event => event.stopPropagation()}>
          <div className="mods-menu-header"><div><strong>Connect PaceMan</strong><span>Official PaceMan authorization</span></div><button className="toolbar-icon" onClick={() => setPacemanOpen(false)} title="Close PaceMan dialog"><X size={15} /></button></div>
          <p className="dialog-copy">Get your six-character Minecraft Auth Token, then use it to authorize PaceMan.</p>
          <button className="secondary-action" onClick={openPacemanAuth}>Get Minecraft Auth Token</button>
          <input className="paceman-input" value={pacemanToken} maxLength={6} onChange={event => setPacemanToken(event.target.value.replace(/[^a-zA-Z0-9]/g, ""))} placeholder="Six-character token" aria-label="Minecraft Auth Token" />
          <button className="primary-action" disabled={pacemanToken.length !== 6} onClick={connectPaceman}>Authorize PaceMan</button>
          <p className="dialog-footnote">Credentials stay on the official Microsoft, Aristois, Twitch, and PaceMan pages.</p>
        </div>
      </div>}

      <div className="app-content" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", position: "relative" }}>
        {step === "loading" && <p style={{ color: "#64748b", fontSize: "0.95rem" }}>Initializing launcher environment...</p>}

        {step === "login" && (
          <div className="surface auth-panel" style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)", padding: "2.5rem", borderRadius: "1rem", width: "360px", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)", textAlign: "center" }}>
            <img className="mcsr-logo mcsr-logo-large" src={theme === "light" ? mcsrLogoLight : mcsrLogo} alt="MCSR Launcher" />
            <h2 style={{ margin: "0 0 0.25rem 0", fontSize: "1.5rem", fontWeight: "700" }}>Welcome</h2>
            <p style={{ margin: "0 0 2rem 0", color: "#64748b", fontSize: "0.85rem" }}>Minecraft 1.16.1 Speedrunning Launcher</p>

            <button onClick={startAuth} style={{ width: "100%", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "white", padding: "0.85rem", fontSize: "0.95rem", fontWeight: "600", borderRadius: "0.5rem", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)" }}>
              <LogIn size={18} /> Microsoft Login
            </button>

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "1.5rem 0" }}></div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <input
                type="text"
                value={offlineName}
                onChange={(e) => setOfflineName(e.target.value)}
                placeholder="Offline Username"
                style={{ backgroundColor: "#090d16", border: "1px solid rgba(255,255,255,0.1)", color: "white", padding: "0.75rem", borderRadius: "0.5rem", textAlign: "center", fontSize: "0.9rem", outline: "none" }}
              />
              <button onClick={useOfflineMode} style={{ backgroundColor: "#1e293b", color: "#cbd5e1", padding: "0.75rem", fontSize: "0.85rem", fontWeight: "600", borderRadius: "0.5rem", border: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                <UserCheck size={16} /> Play Local / Offline
              </button>
            </div>
          </div>
        )}

        {step === "auth_pending" && (
          <div className="surface auth-panel" style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255,255,255,0.08)", padding: "2rem", borderRadius: "1rem", textAlign: "center", maxWidth: "400px" }}>
            <p style={{ fontSize: "0.95rem", color: "#94a3b8", marginBottom: "1rem" }}>{statusMsg}</p>
            <p style={{ color: "#64748b", fontSize: "0.8rem" }}>Complete sign-in in the Microsoft window...</p>
          </div>
        )}

        {step === "ready" && mcProfile && (
          <div className="ready-screen" style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: "500px" }}>
            <div className="surface profile-panel" style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255,255,255,0.08)", padding: "1rem 1.5rem", borderRadius: "0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: "2.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <img src={`https://minotar.net/helm/${mcProfile.name}/48.png`} alt="Skin" style={{ borderRadius: "0.375rem" }} />
                <div style={{ textAlign: "left" }}>
                  <p style={{ fontSize: "1.1rem", fontWeight: "700", margin: 0, color: "#f8fafc" }}>{mcProfile.name}</p>
                  <span style={{ fontSize: "0.75rem", color: mcProfile.isOnline ? "#34d399" : "#94a3b8", display: "flex", alignItems: "center", gap: "4px" }}>
                    <ShieldCheck size={12} /> {mcProfile.isOnline ? "Microsoft Authenticated" : "Local / Offline Profile"}
                  </span>
                </div>
              </div>
              <button className="account-button" onClick={logout} title="Add or switch account" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#f1f5f9", padding: "0.5rem", borderRadius: "0.375rem", cursor: "pointer" }}>
                <UserPlus size={16} /> <span>Add / Switch Account</span>
              </button>
            </div>

            <div className="launch-actions">
              <button className="launch-button" onClick={() => launchGame("rsg")} style={{ width: "auto", minWidth: "180px", background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", color: "#022c22", padding: "1.05rem 2.5rem", fontSize: "1.3rem", fontWeight: "800", borderRadius: "0.9rem", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 30px rgba(16, 185, 129, 0.25)", letterSpacing: "1px" }}>RSG</button>
              <button className="practice-button" onClick={() => launchGame("practice")}>PRACTICE</button>
            </div>
            <div className="practice-tools">
              <button className="secondary-action" onClick={openMpkEditor}>Open MPK Editor</button>
              <button className="secondary-action" onClick={selectPracticeHotbar}>{hotbarSelected ? "Hotbar selected" : "Select hotbar.nbt"}</button>
            </div>
            <div className="instance-folders">
              <button className="secondary-action" onClick={() => openInstanceFolder("rsg")}>Open RSG folder</button>
              <button className="secondary-action" onClick={() => openInstanceFolder("practice")}>Open Practice folder</button>
            </div>
          </div>
        )}

        {step === "launching" && (
          <div className="logs-panel" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#02040a", borderRadius: "0.75rem", border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
            <div style={{ backgroundColor: "#0b0f19", padding: "0.65rem 1rem", display: "flex", alignItems: "center", gap: "0.5rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <Terminal size={16} color="#38bdf8" />
              <span style={{ color: "#94a3b8", fontSize: "0.8rem", fontWeight: "600" }}>Live Game Logs</span>
            </div>
            <div style={{ padding: "1rem", flex: 1, overflowY: "hidden", textAlign: "left", fontFamily: "monospace", fontSize: "0.8rem", color: "#34d399", display: "flex", flexDirection: "column", gap: "0.25rem", justifyContent: "flex-end" }}>
              {logs.map((log, i) => <div key={i} style={{ opacity: 0.85 }}>{String(log)}</div>)}
            </div>
          </div>
        )}

        {step === "error" && (
          <div className="surface error-panel" style={{ background: "rgba(127, 29, 29, 0.2)", border: "1px solid rgba(248, 113, 113, 0.3)", padding: "2rem", borderRadius: "0.75rem", maxWidth: "500px", textAlign: "center" }}>
            <AlertCircle size={32} color="#f87171" style={{ margin: "0 auto 1rem auto" }} />
            <p style={{ fontSize: "0.85rem", color: "#fecaca", wordBreak: "break-all", userSelect: "text", whiteSpace: "pre-wrap", fontFamily: "monospace", margin: "0 0 1rem 0" }}>{statusMsg}</p>
            <button onClick={copyError} style={{ background: "#7f1d1d", color: "#fecaca", padding: "0.6rem 0.85rem", fontSize: "0.8rem", fontWeight: "600", borderRadius: "0.375rem", border: "1px solid rgba(248,113,113,0.3)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.4rem", marginBottom: "1.5rem" }}>
              {errorCopied ? <Check size={15} /> : <Copy size={15} />} {errorCopied ? "Copied" : "Copy error"}
            </button>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
              <button onClick={() => setStep("login")} style={{ backgroundColor: "transparent", color: "white", border: "1px solid rgba(255,255,255,0.2)", padding: "0.5rem 1rem", borderRadius: "0.375rem", cursor: "pointer", fontSize: "0.85rem" }}>Try Login Again</button>
              <button onClick={useOfflineMode} style={{ backgroundColor: "#1e293b", color: "white", border: "none", padding: "0.5rem 1rem", borderRadius: "0.375rem", cursor: "pointer", fontSize: "0.85rem" }}>Play Offline Instead</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
