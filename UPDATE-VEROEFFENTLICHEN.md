# Windows-Installer und Updates ab 0.2.0

## Testversion ohne Zertifikat

1. Den vollständigen Quellordner in das Repository übernehmen, einschließlich `source`, `desktop`, `renderer`, `scripts`, `test`, `package.json`, `package-lock.json` und `.github/workflows/windows.yml`.
2. **Actions → Windows-App bauen → Run workflow** wählen. **Release-Entwurf erstellen** ausgeschaltet lassen.
3. Nach erfolgreichem Lauf unten **Artifacts → Registerwerk-Windows-x64** herunterladen. ZIP entpacken und `Registerwerk-Setup-0.2.0-x64.exe` installieren.
4. Diese Ausgabe ist **unsigniert**. Sie ist ein Testinstaller, keine Produktionsfreigabe. Ihr integrierter Update-Download bleibt gesperrt; GitHub-Prüfung und manuelle Installation bleiben möglich.
5. Alte Portable-Verknüpfungen nicht weiterverwenden. Eigene Projekte vor dem Umstieg als JSON exportieren. Das AppData-Profil und die App-ID bleiben gleich.

## Signierten Release vorbereiten

Ein tatsächliches Windows-Codesigning-Zertifikat des Herausgebers ist erforderlich; es ist nicht im Quellpaket enthalten. Für die hier vorgesehene PFX-Signierung in GitHub unter **Settings → Secrets and variables → Actions** hinterlegen:

- Secret `CSC_LINK`: Base64-kodierte PFX-Datei (oder eine von electron-builder unterstützte sichere Zertifikatquelle).
- Secret `CSC_KEY_PASSWORD`: Kennwort des PFX-Zertifikats.
- Repository-Variable `REGISTERWERK_PUBLISHER_NAME`: **vollständiger Subject des Zertifikats**, beginnend mit `CN=`, exakt wie bei `Get-AuthenticodeSignature`. Kein erfundener Anzeigename.

Zertifikate oder Kennwörter niemals in das Repository committen. Hardware-/Cloud-Signing benötigt einen dazu passenden Build-Adapter; diese Variante ist hier nicht eingerichtet.

## Veröffentlichung

1. Tests ausführen. Version in `package.json` und `package-lock.json` synchron erhöhen; keine bestehende Release-Version wiederverwenden.
2. Unter **Run workflow** den Haken **Release-Entwurf erstellen** setzen oder einen passenden Tag, hier `v0.2.0`, anlegen.
3. Der Workflow verlangt nun eine Signatur. Fehlendes Zertifikat, falscher Herausgeber oder ungültige Signatur brechen den Release-Build ab. Das ist beabsichtigt.
4. Nach dem Build wird ein **Entwurf** unter Releases mit Setup, Blockmap und `latest.yml` angelegt. Noch nicht veröffentlichen.
5. Auf Windows installieren und alle Punkte aus `docs/PRUEFBERICHT-0.2.0.md` prüfen: Erstinstallation, Update über bestehende Version, Projekt-/Einstellungserhalt, Startmenü, Deinstallation, Gerätekommunikation und signiertes Update.
6. Erst danach den Release veröffentlichen. Ein Actions-Artefakt oder unveröffentlichter Entwurf ist kein App-Update.

Die bereits eingebauten Sicherheitsprüfungen älterer App-Versionen werden durch einen neuen Release nicht rückwirkend verändert. Für den Übergang zur verbindlichen Signaturprüfung die erste signierte 0.2.0 bewusst per Setup installieren.

## Im Programm

**Updates → Nach Updates suchen → Update herunterladen → Verbindung trennen → Jetzt installieren.** Der Download installiert nichts beim normalen Schließen. Aktive Kommunikation, ungesicherte TX-Vorlagen und nicht sicherbare Projekte blockieren die Installation.

Updatequelle ist fest `KS-303/Registerwerk`. Der Download prüft SHA512. Die installierte signierte App verifiziert zusätzlich Windows-Authenticode und den erwarteten Herausgeber; die Signatur wird vor dem Installieren erneut geprüft. Nicht überprüfbar bedeutet Ablehnung, nicht Freigabe.

Ein Offline-Update erfolgt mit einem vorher vertrauenswürdig bezogenen und geprüften Setup. AppData und eigene Projekte bleiben bei Updates erhalten. Die reguläre Deinstallation entfernt keine eigenen Projektdateien oder das Benutzerprofil.

## Lokal unter Windows bauen

```powershell
npm ci
npm test
npm run smoke
npm run build:win
```

Für einen signierten Build die genannten Variablen in einer sicheren Build-Umgebung setzen und `npm run build:win:signed` ausführen. `desktop/update-trust.json` wird dabei für das Paket automatisch erzeugt und anschließend auf den vorherigen Quellzustand zurückgesetzt. Nicht manuell einen Herausgeber eintragen, um einen unsignierten Build als signiert auszugeben.
