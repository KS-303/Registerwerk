# Registerwerk fuer Windows

Dieses Projekt macht aus der vorhandenen Registerwerk-HTML eine eigenstaendige Windows-App. Die aktuelle Hilfe, Projektimporte, gemeinsamen Geraeteadressen und die RTU-Logik sind enthalten.

**Dieses ZIP enthaelt das Quellprojekt. Die fertigen EXE-Dateien entstehen erst durch einen erfolgreichen Windows-Build.**

## Der schnellste Weg ueber GitHub

1. Ein Repository fuer Registerwerk anlegen, vorzugsweise privat.
2. Das ZIP entpacken und **den Inhalt dieses Ordners** ins Repository uebernehmen. `package.json` und `.github` muessen direkt im Hauptverzeichnis des Repositorys liegen.
3. Nach dem Hochladen baut GitHub automatisch auf `main` oder `master`. Alternativ: **Actions > Windows-App bauen > Run workflow**.
4. Den gruenen Lauf oeffnen und unter **Artifacts** das Paket **Registerwerk-Windows-x64** herunterladen und entpacken.
5. Eine dieser Dateien verwenden:

| Datei | Verwendung |
|---|---|
| `Registerwerk-Portable-0.1.0-x64.exe` | Starten ohne Installation. |
| `Registerwerk-Setup-0.1.0-x64.exe` | Mit Installationsassistent und Verknuepfungen installieren. |

Die Versionsnummer im Namen folgt `version` in `package.json`. Es wird kein GitHub Release automatisch veroeffentlicht. Die fertigen Dateien stehen als Build-Artefakte bereit; die konfigurierte Aufbewahrung ist 30 Tage.

### Hochladen per Terminal

Das leere Repository vorher auf GitHub anlegen. Dann im entpackten Projektordner:

```powershell
git init
git branch -M main
git add .
git commit -m "Registerwerk als Windows-App vorbereiten"
git remote add origin DEINE_REPOSITORY_URL
git push -u origin main
```

`DEINE_REPOSITORY_URL` durch die HTTPS-Adresse des eigenen Repositorys ersetzen. Zugangsdaten gehoeren weder in Dateien noch in diese Anleitung.

## Erster Test mit dem Adapter

1. USB-RS485-Adapter anschliessen; benoetigten Adaptertreiber installieren.
2. App starten und eine Registerwerk-Projektdatei ueber **Projekt oeffnen** laden.
3. Falls alle Datenpunkte zu einem Geraet gehoeren: **Alle Geraeteadressen gleich** einschalten und die erste Zeile unter **Geraet** einstellen.
4. Baudrate, Paritaet und Stoppbits mit dem Geraet abgleichen. Vorbelegt sind 9600 Baud und 8N1.
5. **Port auswaehlen und verbinden** oeffnet die eigene COM-Port-Auswahl. Adapter bewusst auswaehlen und **Verbinden** anklicken. Es wird kein Port automatisch ausgewaehlt.
6. Zuerst **Einmal abfragen** verwenden. Danach bei Bedarf den Messlauf starten.

Die integrierte Hilfe bleibt ueber **Hilfe** oder **F1** erreichbar. **Esc** schliesst sie. Lokale Sicherungen liegen auf dem jeweiligen Rechner unter dem App-Profil in `%APPDATA%\Registerwerk`. Das gilt auch fuer die portable EXE; zum Uebertragen auf andere Rechner die Projekt-JSON exportieren.

## Lokal unter Windows entwickeln oder bauen

Voraussetzungen: Node.js 24 und npm. Im Projektordner:

```powershell
npm ci
npm test
npm run smoke
npm start
```

Die EXE-Dateien bauen:

```powershell
npm run build:win
```

Ergebnisse liegen in `dist`. Der GitHub-Workflow fuehrt dieselben Tests und den Windows-Build aus. Fuer den Build werden Internet und die Entwicklungsabhaengigkeiten benoetigt. Die fertige App arbeitet mit lokalen Dateien und dem seriellen Adapter offline.

## HTML aktualisieren

Die eigenstaendige HTML liegt unveraendert unter `source/Registerwerk.html`. Zum Aktualisieren diese Datei durch die neue Registerwerk-Version ersetzen und ausfuehren:

```powershell
npm run prepare:renderer
npm test
npm run smoke
```

`prepare:renderer` trennt CSS und JavaScript fuer die App ab. Die Modbus-Logik wird dabei nicht umgeschrieben. Aenderungen an `renderer/app.js`, `renderer/app.css` oder `renderer/index.html` werden bei der naechsten Vorbereitung ueberschrieben.

## Technischer Aufbau

| Bereich | Datei |
|---|---|
| Urspruengliche Registerwerk-Version | `source/Registerwerk.html` |
| Fenster, lokaler App-Ursprung, Berechtigungen, Dateidownload | `desktop/main.cjs` |
| Begrenzte Schnittstelle zur Portauswahl | `desktop/preload.cjs` |
| Portauswahl und An-/Abstecken | `desktop/port-selection.cjs`, `renderer/desktop-ui.js` |
| Erstellung der App-Oberflaeche | `scripts/sync-html.cjs` |
| Windows-Build | `.github/workflows/windows.yml` |

Die App verwendet einen stabilen lokalen Ursprung `registerwerk://app` und ein persistentes Profil. Der Renderer hat keinen Node.js-Zugriff. Nur der eigene Hauptframe kann die Portauswahl bedienen. Fremde Webseiten, neue Fenster und Netzwerkzugriffe sind gesperrt. Portnamen werden als Text angezeigt. Eine Portauswahl laeuft nach zwei Minuten ab und ist vorher abbrechbar.

## Pruefung und Grenzen

- `npm test`: Portwahl, ungueltige/veraltete Auswahl, An-/Abstecken, Abbruch und Ablauf der Auswahlfrist.
- `npm run smoke`: tatsaechlicher Electron-Start, Web Serial, Hilfe, gemeinsame Geraeteadressen, Portauswahl ueber IPC, JSON-Export und Wiederherstellung nach Neuladen.
- Echte Modbus-Kommunikation muss mit Adapter und Geraet unter Windows geprueft werden. Ein erfolgreicher Build ersetzt diesen Feldtest nicht.
- Die erste Version ist nicht digital signiert. Windows kann deshalb beim Start oder Download einen Hinweis anzeigen. Eine Signierung kann spaeter ergaenzt werden.

Das vorhandene Modbus-Logo wird fuer das App-Symbol in PNG/ICO umgesetzt.

## Weitergabe

Das Repository ist zunaechst als privat / `UNLICENSED` vorbereitet. Eine Open-Source-Lizenz oder eine Veroeffentlichung wird dadurch nicht festgelegt. Electron und die Build-Werkzeuge unterliegen ihren eigenen Lizenzen.
