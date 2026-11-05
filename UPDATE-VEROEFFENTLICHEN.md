# Windows-Build und Release veröffentlichen

## Automatischer Release-Entwurf

1. Das vollständige Paket einschließlich `.github/workflows/windows.yml` in **einem Commit** nach `main` hochladen. `package.json` und `package-lock.json` müssen dieselbe neue Versionsnummer enthalten.
2. Unter **Actions → Windows-App bauen** den automatisch gestarteten Lauf öffnen. Der Workflow installiert Abhängigkeiten, führt Tests aus und baut den Windows-Installer.
3. Bei Erfolg erstellt er aus genau diesen Build-Dateien unter **Releases** einen Entwurf mit dem passenden Tag, z. B. `v0.2.3`. Setup, Blockmap und `latest.yml` werden angehängt. Zusätzlich steht der Build als Actions-Artefakt bereit.
4. Den Installer unter Windows testen und den Entwurf prüfen. Erst **Publish release** veröffentlicht ihn. Ein Entwurf wird nicht als reguläres Update angeboten.

Ein bestehender Release oder Entwurf mit derselben Version wird nicht überschrieben. Änderungen an der App benötigen eine neue Versionsnummer. Pull Requests erzeugen keinen Release; ein manueller Workflow-Lauf nur dann, wenn „Release-Entwurf erstellen“ gewählt wird. Ein Tag `v…` muss zur Paketversion passen. Abhängig von den Repository-Einstellungen muss GitHub Actions Releases schreiben dürfen.

## Signatur und Updates

Der aktuell konfigurierte GitHub-Workflow führt `npm run build:win` **unsigniert** aus, auch wenn er einen Release-Entwurf erstellt. Ein Zertifikat ist dafür nicht eingerichtet. Windows kann bei unsignierten Dateien warnen. Die eingebaute vertrauensgebundene Update-Installation bleibt ohne entsprechend signierte und konfigurierte App gesperrt; eine Release-Veröffentlichung allein aktiviert sie nicht. Den Installer vor dem Weitergeben und Installieren prüfen.

`npm run build:win:signed` ist ein separater Build-Pfad. Er benötigt ein geeignetes Zertifikat sowie `CSC_LINK`, gegebenenfalls `CSC_KEY_PASSWORD` und den vollständigen Zertifikat-Subject in `REGISTERWERK_PUBLISHER_NAME`. Hardware- und Cloud-Zertifikate benötigen eine passende Integration. Dieser Signierpfad ist im aktuellen GitHub-Workflow nicht eingerichtet und muss vor einem signierten Release separat eingerichtet und auf Windows getestet werden. Geheimnisse niemals in Git oder in Chats veröffentlichen.

Lokale Projektdateien vor Updates als JSON exportieren. Die tatsächliche Windows-Installation, ein Upgrade mit Erhalt der Einstellungen und reale Gerätekommunikation sollten vor Veröffentlichung praktisch geprüft werden.
