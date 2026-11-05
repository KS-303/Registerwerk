# Windows-Build und Release veröffentlichen

## Automatischer Release-Entwurf

1. Das vollständige Paket einschließlich `.github/workflows/windows.yml` in **einem Commit** nach `main` hochladen. `package.json` und `package-lock.json` müssen dieselbe neue Versionsnummer enthalten.
2. Unter **Actions → Windows-App bauen** den automatisch gestarteten Lauf öffnen. Der Workflow installiert Abhängigkeiten, führt Tests aus und baut den Windows-Installer.
3. Bei Erfolg erstellt er aus genau diesen Build-Dateien unter **Releases** einen Entwurf mit dem passenden Tag, z. B. `v0.2.3`. Setup, Blockmap und `latest.yml` werden angehängt. Zusätzlich steht der Build als Actions-Artefakt bereit.
4. Den Installer unter Windows testen und den Entwurf prüfen. Erst **Publish release** veröffentlicht ihn. Ein Entwurf wird nicht als reguläres Update angeboten.

Ein bestehender Release oder Entwurf mit derselben Version wird nicht überschrieben. Änderungen an der App benötigen eine neue Versionsnummer. Pull Requests erzeugen keinen Release; ein manueller Workflow-Lauf nur dann, wenn „Release-Entwurf erstellen“ gewählt wird. Ein Tag `v…` muss zur Paketversion passen. Abhängig von den Repository-Einstellungen muss GitHub Actions Releases schreiben dürfen.

## Updates ohne Signatur

Ab Version 0.2.4 kann die installierte Windows-App verfügbare Updates nach Auswahl herunterladen und nach einer weiteren Bestätigung installieren. Der Installer bleibt unsigniert; Windows kann deshalb warnen. Die SHA512-Prüfsumme wird mit den GitHub-Update-Metadaten abgeglichen und erkennt Übertragungsfehler, bestätigt aber nicht den Herausgeber.

Die installierten Versionen bis einschließlich 0.2.3 enthalten noch die frühere Signatursperre. Deshalb muss **0.2.4 einmal manuell per Setup installiert werden**. Für spätere Updates ist ein veröffentlichter Release mit passendem Setup und `latest.yml` erforderlich. Der vollständige Update-Ablauf muss unter Windows praktisch getestet werden.

Lokale Projektdateien vor Updates als JSON exportieren. Die tatsächliche Windows-Installation, ein Upgrade mit Erhalt der Einstellungen und reale Gerätekommunikation sollten vor Veröffentlichung praktisch geprüft werden.
