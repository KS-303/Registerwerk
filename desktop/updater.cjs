'use strict';

class UpdateController {
  constructor({ updater, version, mode, notify, canInstall, prepare, rollback, confirm, schedule = setImmediate }) {
    Object.assign(this, { updater, notify, canInstall, prepare, rollback, confirm, schedule });
    this.installPending = false;
    this.state = { version, mode, supported: mode === 'installed', phase: 'idle', availableVersion: '', percent: 0,
      message: mode === 'installed' ? 'Updateprüfung läuft beim Start im Hintergrund.' :
        'Integrierte Updates gibt es für die installierte Windows-Version. Diese Ausgabe bitte manuell aktualisieren.' };
    if (!this.state.supported) return;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.setFeedURL({ provider: 'github', owner: 'KS-303', repo: 'Registerwerk', releaseType: 'release' });
    updater.on('checking-for-update', () => this.set({ phase: 'checking', message: 'GitHub Releases wird geprüft …' }));
    updater.on('update-available', (info) => this.set({ phase: 'available', availableVersion: info.version,
      message: `Version ${info.version} ist verfügbar. Der Download beginnt erst nach deinem Klick.` }));
    updater.on('update-not-available', () => this.set({ phase: 'latest', availableVersion: '', message: 'Diese Version ist aktuell.' }));
    updater.on('download-progress', (info) => this.set({ phase: 'downloading', percent: Math.max(0, Math.min(100, Math.round(info.percent || 0))),
      message: 'Update wird heruntergeladen …' }));
    updater.on('update-downloaded', (info) => this.set({ phase: 'ready', availableVersion: info.version, percent: 100,
      message: 'Update ist heruntergeladen. Zur Installation Geräteverbindung trennen und „Jetzt installieren“ wählen.' }));
    updater.on('error', (error) => this.failed(error));
  }
  snapshot() { return { ...this.state }; }
  set(value) { Object.assign(this.state, value); this.notify(this.snapshot()); }
  failed(error) {
    this.rollback?.();
    const missing = ['ERR_UPDATER_NO_PUBLISHED_VERSIONS', 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND', 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'].includes(error?.code);
    this.set({ phase: 'error', message: missing ? 'Es ist noch keine Update-Version auf GitHub veröffentlicht.' :
      'Update fehlgeschlagen: ' + String(error?.message || error || 'Unbekannter Fehler').slice(0, 450) });
  }
  async check() {
    if (!this.state.supported || ['checking', 'downloading', 'ready', 'installing'].includes(this.state.phase) || this.installPending) return this.snapshot();
    this.set({ phase: 'checking', message: 'GitHub Releases wird geprüft …' });
    try { await this.updater.checkForUpdates(); } catch (error) { this.failed(error); }
    return this.snapshot();
  }
  async download() {
    if (!this.state.supported || this.state.phase !== 'available') return this.snapshot();
    this.set({ phase: 'downloading', percent: 0, message: 'Update wird heruntergeladen …' });
    try { await this.updater.downloadUpdate(); } catch (error) { this.failed(error); }
    return this.snapshot();
  }
  async install() {
    if (!this.state.supported || this.state.phase !== 'ready' || this.installPending) return this.snapshot();
    this.installPending = true;
    try {
      if (!(await this.canInstall())) {
        this.set({ message: 'Installation gesperrt: Abfragen beenden und Geräteverbindung trennen.' });
      } else if (await this.confirm(this.state.availableVersion)) {
        // Check again after the native confirmation; communication may have started meanwhile.
        if (!(await this.prepare())) {
          this.set({ message: 'Installation gesperrt. Geräteverbindung trennen und offene Projekteingaben prüfen oder exportieren.' });
        } else {
          this.set({ phase: 'installing', message: 'Registerwerk wird geschlossen und das Update installiert …' });
          this.schedule(() => { try { this.updater.quitAndInstall(false, true); } catch (error) { this.failed(error); } });
        }
      }
    } catch (error) { this.failed(error); }
    finally { this.installPending = false; }
    return this.snapshot();
  }
}
module.exports = { UpdateController };
