# Version 0.1.5

- TXI2.OPEN-Export übersichtlicher gegliedert, mit Tooltips und erweiterter Hilfe.
- Prüfpflichtige Datenpunkte werden markiert; Fehlermeldungen führen direkt zum betroffenen Datenpunkt.

# Änderungen

## 0.1.4
- Neues Menü **Export** mit TXI2.OPEN-Punktvorlagen und Laden vorhandener IOOPT-Dateien.
- Mehrere Datenpunkte auswählen und Zusätze wie /R15 und /S gemeinsam bearbeiten.
- Konversionsdaten, I/O-Namen, Beschreibungen, Einheiten und Wertebereiche im Editor bearbeiten.
- Lokale Pfade und Benutzernamen können beim Export entfernt werden. Speichern öffnet unter Windows einen Dateidialog für IOOPT.
- Skalierung und nicht eindeutig abbildbare Byte-Reihenfolgen werden zur Prüfung markiert. Der Import im TX Open Tool ist noch im Praxistest zu bestätigen.

## 0.1.3
- Drei Verbindungsarten ergänzt: Modbus RTU über USB-RS485, direktes Modbus TCP und transparente Ethernet-RTU-Brücke.
- IP-Adresse und TCP-Port lassen sich pro Projekt speichern.
- Modbus-TCP-Telegramme werden im Electron-Hauptprozess aufgebaut und geprüft; die Renderer-Oberfläche erhält keinen direkten Netzwerkzugriff.
- Integrierte Hilfe und README um TCP- und Waveshare-Brückenbetrieb erweitert.
- Eine erfolgreiche Gateway-Verbindung wird als TCP-Erreichbarkeit beschrieben; die RTU-Kommunikation benötigt weiterhin ein angeschlossenes Endgerät.

## 0.1.2
- Updateprüfung startet beim Öffnen der installierten Windows-App automatisch im Hintergrund.
- Der Updatebutton blinkt und zeigt „Update verfügbar“, sobald eine neuere Version gefunden wurde.
- Projektmenü ergänzt: JSON laden, Projekt entladen und Projekt exportieren.
- Beim Entladen werden Datenpunkte, Hinweise und lokale Projektsicherung gelöscht; Verbindungseinstellungen bleiben erhalten.


## 0.1.1

- Versionsanzeige und Update-Dialog in der Windows-App.
- Manuelle Prüfung veröffentlichter GitHub Releases.
- Download und Installation als getrennte, bewusste Aktionen.
- Zusätzliche Installationsbestätigung; keine Installation beim normalen Schließen.
- Installation bei aktiver Verbindung oder Kommunikation gesperrt; erneute Prüfung nach Bestätigung.
- Gültige offene Projektänderungen vor Installation lokal sichern.
- Portable und Ordner-Version mit Hinweis auf manuelle Aktualisierung.
- Vorbereiteter Release-Workflow mit Update-Metadaten und unveröffentlichtem Release-Entwurf.

Version 0.1.0 muss einmal manuell über den neuen Setup-Installer aktualisiert werden.
