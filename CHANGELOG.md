# Version 0.3.0 – Stabile Netzwerkabfragen und aufgeräumte Dokumentation

- Betroffene minimatch-Abhängigkeiten der Buildwerkzeuge gezielt auf 11.0.1 aktualisiert; Paketfilter und Ausschlüsse mit Regressionstests abgesichert.

- Windows-App mit eingeschränkten Electron-Startfunktionen und ASAR-Integritätsprüfung; gebaute EXE wird vor Bereitstellung geprüft.
- Build-Actions auf feste Commits festgelegt; automatische Abhängigkeitsprüfung, Dependabot und CodeQL für JavaScript sowie GitHub-Workflows ergänzt.
- Release-Entwürfe warten auf erfolgreichen Windows-Build und abgeschlossene CodeQL-Analyse. CodeQL-Funde müssen zusätzlich bewertet werden; ein grüner Analysejob bedeutet nicht automatisch Fehlerfreiheit.
- Windows-Zertifikate bleiben optional; der Updateablauf bleibt unverändert.

- Öffentliche Anleitung auf Installation, Bedienung und wichtige Grenzen konzentriert.
- Interne Prüfberichte und Entwicklungsunterlagen aus dem Upload-Paket entfernt.
- Bündelt die bisher vorbereiteten Änderungen für 0.2.7 und 0.2.8; diese Zwischenstände werden übersprungen.

- Ein Geräte-Timeout trennt TCP und Ethernet-RTU nicht mehr. Fehlerüberspringen und Geräte-Backoff greifen auch bei Netzwerkverbindungen; Schreibbefehle werden weiterhin niemals automatisch wiederholt.
- TCP-Streamparser verarbeitet Fragmente und mehrere Frames, verwirft verspätete Transaktions-IDs und prüft passende Unit-ID/Funktion/Länge. Echte Socketfehler beenden die Verbindung.
- Ethernet-RTU richtet Frames nach Echo, Störungen und CRC-Fehlern neu aus; nach Timeout begrenzte Ruhephase mit Verwerfen alter Daten. Die grundsätzliche RTU-Mehrdeutigkeit bleibt dokumentiert.
- Direkter Modbus TCP erlaubt Unit-ID 0–255 in Datenpunkten, Import, Mehrfachbearbeitung, Scan, Bereichsleser und Schreibdialog. RTU/Ethernet-RTU bleiben bei 1–247; Moduswechsel verändert keine Geräteadresse stillschweigend.
- Nur-Lesen als Freigabeliste FC 01–04, bei Netzwerkbefehlen auch im Hauptprozess, bei Web Serial unmittelbar vor dem Senden im Renderer.
- Netzwerktransport in eigenes testbares Modul ausgelagert; lokale Socket-Simulationen und Electron-Regressionstests ergänzt.

# Version 0.2.6 – Darkmode

- Dunkle Darstellung im TXI2.OPEN-Editor, bei Eingabefeldern, Prüfhilfen und Statusmeldungen vereinheitlicht.

# Version 0.2.5 – Eingabedialoge

- Die Trendlegende zeigt Kurvenfarben sichtbar statt als Farbcode.
- Sitzungen umbenennen und benannt speichern funktioniert in der Windows-App.
- Auch für die Mehrfachbearbeitung von Geräteadresse und Funktionscode die nicht unterstützte Eingabe ersetzt.

# Version 0.2.4 – Updates ohne Zertifikat

- Dropdownfelder in Arbeitsseiten, Tabellen, Einstellungen und Dialogen auf ein einheitliches Erscheinungsbild abgestimmt.
- Die Signaturpflicht für den Download und die Installation von Updates entfernt. SHA512-Abgleich und bewusste Bestätigung bleiben bestehen.
- Vorherige Versionen müssen einmal manuell auf 0.2.4 aktualisiert werden.

# Version 0.2.3 – Bedienung und Release

- Suche und Mehrfachbearbeitung einklappbar und im Stil der übrigen Eingabefelder gestaltet.
- Projekt- und Exportmenü schließen sich gegenseitig. Hilfe zu Suche, Mehrfachbearbeitung, Sitzungen und Trend ergänzt.
- Nach erfolgreichem Build auf dem Hauptbranch wird ein Release-Entwurf erstellt, wenn noch keiner für die Version vorhanden ist.

# Version 0.2.1 – Bedienung und Trend

- Bedienung erweitert: Sitzungswahl, kompakte Navigation, Farben, Suche, Mehrfachaktionen, Wertalter, Trend und Einführung.
- Analoge und digitale Trends getrennt; digitale Signale erhalten eigene Zeilen.

# Version 0.2.0 – Windows-Arbeitsoberfläche


- Copyright © 2026 Kevin Schmidt in Seitenleiste, Hilfe und Windows-Build-Metadaten ergänzt.
- Neue Navigation im Fluent-Stil, Messansicht und jederzeit erreichbare Status-/Stoppaktionen.
- Bestehende Kommunikations- und IOOPT-Funktionen weiterverwendet; Seitenwechsel unterbrechen keine Vorgänge.
- Hell/Dunkel/System, Akzent, Tabellenansicht, Navigation und Fensterzustand lokal speichern.
- Versionierte persönliche Einstellungen mit Backup und Fehlerbehandlung, getrennt von Projekten.
- Nur-Lesen als Standard, präzisere Importvalidierung, sichtbar gemachte Fehlerfelder und erweiterte Hilfe.
- Portable-Build entfernt; NSIS pro Benutzer bleibt. Signierte Releases benötigen Herausgeberzertifikat; integrierte Downloads ohne Vertrauenskonfiguration gesperrt.

# Version 0.1.10

- Bus-Scan setzt bei ausbleibender Antwort über TCP und Ethernet-RTU nach sicherem Wiederverbinden fort.
- Scanantworten werden vor der Bewertung auf CRC, Geräteadresse, Funktionscode und Länge geprüft.

# Version 0.1.9

- Kommunikationsstatistik, Trendansicht und Adressprüfung ergänzt.
- TCP-Verbindungsverlust, Warnung bei veralteter TX-Vorlage und RTU-Schreibhinweise verbessert.
- Hilfe erweitert und TX-Wertebereiche auf Plausibilität geprüft.

# Version 0.1.8

- TXI2.OPEN-Export ergänzt den Dokumentkopf entsprechend der importierten Testvorlage.
- Anonymisierung ersetzt Benutzer- und Pfadangaben, statt die Strukturelemente zu entfernen.

# Version 0.1.7

- Hinweis zur Skalierung bleibt sichtbar und blockiert den Export nicht mehr.
- Fehlerhafte Datenpunkte werden beim Export in der Übersicht und an den Eingabefeldern markiert.

# Version 0.1.6

- Fehlerhafte TX-Eingaben werden beim Export direkt am betroffenen Datenpunkt markiert und erklärt.
- Hinweis und Bestätigung zur nicht übertragenen Skalierung verständlicher formuliert.

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
