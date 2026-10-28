# Pruefstand 28.10.2026

## Bestanden

- Vier Node-Tests fuer Portauswahl, ungueltige/veraltete Auswahl, An-/Abstecken, Abbruch und Fristablauf.
- Tatsaechlicher Start mit Electron 45.1.0 in der Linux-Testumgebung.
- Sicherer App-Ursprung und vorhandenes Web Serial; kein Node.js-Zugriff im Renderer.
- Integrierte Hilfe und gemeinsame Geraeteadressen.
- Eigene COM-Port-Auswahl ueber echte Electron-IPC, ohne automatische Adapterwahl.
- Echter Aufruf von navigator.serial.requestPort bis zur Portauswahl und Abbruch mit Escape.
- JSON-Export ueber Electron-Download, lokale Wiederherstellung und JSON-Import.
- Windows-Konfiguration gegen das Schema von electron-builder 26.18.0 validiert.
- GitHub-Workflow als YAML geprueft.
- JavaScript und CSS der bestehenden HTML unveraendert in die App uebernommen.

## Noch offen

Der GitHub-Workflow wurde nicht ausgefuehrt, weil aktuell kein Repository ueber die Verbindung sichtbar ist. Die Windows-EXE wurde daher noch nicht gebaut und nicht unter Windows gestartet. Es fanden keine Tests an einem echten RS485-Adapter oder Modbus-Geraet statt.

Die Linux-Testumgebung verwendet fuer den Entwicklertest den Headless-Modus. Die ausgelieferte Windows-App behaelt ihre Renderer-Sandbox.

## Grundlage

Registerwerk-RTU-korrigiert.html, gespeicherter Stand 11.

SHA-256 der Original-HTML: `e686c08bca0c4599a281a9e034d3f24caaaf00457464c5e4dfc135eacea308f4`

Das Projekt enthaelt einen Workflow fuer Windows x64. Der Build erzeugt eine portable EXE und einen NSIS-Installer.
