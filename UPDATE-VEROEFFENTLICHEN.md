# Updates veröffentlichen

## Erstinstallation

Die bisherige Version 0.1.0 kann sich nicht selbst aktualisieren. Den Installer von Version 0.1.1 einmal herunterladen und ausführen. Danach zeigt die installierte App den Button **Updates**.

## Neue Version bereitstellen

1. Änderungen prüfen und die Versionsnummer in `package.json` sowie `package-lock.json` erhöhen.
2. Den erweiterten Workflow `.github/workflows/windows.yml` verwenden.
3. Auf GitHub **Actions → Windows-App bauen → Run workflow** öffnen und **Release-Entwurf erstellen** einschalten. Alternativ einen passenden Versions-Tag wie `v0.1.1` erstellen.
4. Nach erfolgreichem Build unter **Releases** den neuen Entwurf öffnen. Der Installer, seine Blockmap und `latest.yml` müssen als Dateien enthalten sein.
5. Installer testen und anschließend den Release veröffentlichen. Die App berücksichtigt nur veröffentlichte reguläre Releases.

Normale Commits auf `main` erzeugen weiterhin nur Build-Artefakte. Sie veröffentlichen kein Update. Eine Versionsnummer darf für eine neue Veröffentlichung nicht wiederverwendet werden.

## Updates auf dem Rechner

**Updates → Nach Updates suchen → Update herunterladen → Geräteverbindung trennen → Jetzt installieren.** Die Installation benötigt eine zusätzliche Bestätigung. Ein heruntergeladenes Update wird beim normalen Schließen nicht automatisch installiert.

Portable EXE und Ordner-Version werden weiterhin manuell ersetzt. Projekte vorher als JSON sichern; das App-Profil wird bei einer regulären Aktualisierung nicht gelöscht.

## Noch keine Veröffentlichung vorhanden

Solange kein regulärer GitHub Release mit passender `latest.yml` existiert, meldet die App, dass keine Update-Version veröffentlicht ist. Ein Actions-Artefakt oder ein Release-Entwurf allein reicht nicht.
