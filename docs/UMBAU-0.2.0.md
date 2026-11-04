# Registerwerk 0.2.0 – Bestand und Umbau

Basis: GitHub KS-303/Registerwerk, Commit 1b7e6604f3b3f50c4db2103a876cb2abf574662c (0.1.10).
Vor dem Umbau: 11 Node-Tests und vollständige vorhandene Electron-Smoke-Suite erfolgreich unter Linux. Netzwerkprüfungen nutzen lokale simulierte Teilnehmer, keine Anlagen.

## Funktionsinventur und Zielzuordnung

| Bestand 0.1.10 | Ziel in 0.2.0 | Vorhandener Prüfumfang |
|---|---|---|
| RTU über Web Serial, bewusste COM-Auswahl, Hotplug in Auswahl, Auswahlabbruch | Verbindung | IPC-Portauswahl automatisiert; echte USB-Hardware offen |
| 9600/8N1, Parameter, Timeout, Fehlerpause | Verbindung | Standardwerte/Import automatisiert |
| Modbus TCP mit MBAP und Transaktions-ID | Verbindung | lokaler TCP-Server, Fragmente, Ausnahme, Timeout |
| Transparente Ethernet-RTU-Brücke mit CRC | Verbindung | lokaler Server, CRC/Slave/FC/Länge, Timeout-Reconnect |
| RTU Empfangspuffer, CRC, Störbytes, Echo, Busruhe, begrenztes Warten | unveränderter Kommunikationskern | reale RS485- und Echo-Hardware offen |
| FC01/02/03/04 lesen; UINT/INT16/32, FLOAT32, HEX16, BOOL, 4 Bytefolgen | Datenpunkte | TCP-Lesesimulation; komplette Datentypmatrix ergänzen |
| Faktor, Offset, Stellen, Registerbit, Adresseingabebasis, Registeroffset | Datenpunkte / Messparameter | Adressüberschneidung automatisiert |
| Hinzufügen, Löschen, Liste leeren, Aktivieren, gemeinsame Geräteadresse | Datenpunkte | gemeinsame Adresse automatisiert |
| Einmal lesen, Messlauf, Stoppen, Fehlerüberspringen und Backoff | Datenpunkte; globale Stoppaktion | Lese-Simulation; Seitenwechsel ergänzen |
| Gerät 1–247 suchen; FC01–04, Prüfadresse, Antwort/Exception, Punkt übernehmen | Bus-Scan | Timeout, Reconnect, ungültige/fragmentierte Antworten |
| FC03/04 zusammenhängend 1–125 Register lesen | Registerabfrage | Kern unverändert; Simulation ergänzen |
| FC05/06/15/16 schreiben, Vorschau, Bestätigung, einmal senden, Rücklesen | Registerabfrage / Schreibbefehl | echte Geräteprüfung offen; Simulation ergänzen |
| TX/RX, CRC, Ausnahme, begrenztes Protokoll mit Leeren | Telegramme | Simulation prüft Protokoll |
| Statistik pro Punkt, Trend bis 8 Kurven / 600 Werte, Reset | Statistik und Trend | simulierte Werte/Fehler, Reset |
| Doppelte/überlappende Adressen, BOOL-Bits | Statistik und Trend | automatisiert |
| JSON v1–3, Metadaten, 500 Punkte, 2 MB, Import/Export/Entladen | Projekte; Schnellmenü bleibt | Datei-API und echter Electron-Download |
| Bis 5 lokale Sitzungssicherungen und Wiederherstellung | Projekte / Einstellungen | Neuladen automatisiert |
| TXI2.OPEN IOOPT laden/bearbeiten/exportieren, Feldfehler, Mehrfachauswahl, Zusätze, Formate 0–9 | Projekte; Exportmenü bleibt | bestehende umfangreiche XML-Suite; Nutzer bestätigte Tool-Import 0.1.8 |
| Offline-Hilfe, Tooltips, F1/Escape, Fokusführung | Hilfe | Öffnen/Schließen automatisiert |
| GitHub-Updateprüfung, manuelles Laden/Installieren, Aktivitätssperre | Updates | Controller-Mocks + Electron-Laden; Windows-Installation offen |
| Kontextisolation, Sandbox, CSP, IPC-Absenderprüfung, keine Renderer-Netzverbindungen | Desktop-Hauptprozess | sichere Origin, kein require, IPC Smoke |
| Installer + Portable | nur NSIS-Installer | Windows-Build separat erforderlich |

„TX-Tests“ waren bislang IOOPT-Entwicklungstests, kein eigener Telegramm-Sendeautomat. JSON-Geräteprofile werden als Registerwerk-Projekte geladen; eine separate Profilbibliothek existiert im Bestand nicht. Trendwerte sind flüchtig, kein bisheriger Datei-Logger. Diese Unterschiede dürfen nicht als übernommene, bereits vorhandene Funktionen ausgegeben werden.

## Plan und Architekturentscheidung

1. Basis festhalten, bestehende Tests unverändert als Regression behalten.
2. Fluent-orientierte Shell als separates Renderer-Modul: vorhandene DOM-Knoten einmalig zu Seiten zuordnen, niemals beim Navigieren neu erzeugen. UI-Zustand bleibt erhalten.
3. Schmale Zustands-/Bedienadapter im bestehenden Kern; keine Neufassung von Frameaufbau, CRC oder IOOPT-Serialisierung.
4. Versionierte lokale Einstellungen im Hauptprozess: Whitelist, Größenlimit, atomarer Austausch, letzte gültige Sicherung. Projekte behalten Schema 1–3 und liegen getrennt von persönlichen Einstellungen.
5. NSIS pro Benutzer, stabile App-ID/AppData, kein Dienst/Autostart, Daten bei Deinstallation erhalten. Portable-Build entfällt.
6. Updatequelle fest auf KS-303/Registerwerk; SHA512-Prüfung über electron-updater plus Authenticode-Herausgeberprüfung. Fehlt ein vertrauenswürdiger Herausgeber, integrierte Downloads/Installation sperren. Signierzertifikat muss der Herausgeber stellen.
7. Regression, neue Einstellungs-/Sicherheitstests, Seitenwechsel während Kommunikation, visuelle Kontrolle. Windows- und Hardwaretests separat benennen.

Die Electron-Sicherheits- und Microsoft-PowerToys-Einstellungen-Dokumentation wurde am 04.11.2026 konsultiert:
https://www.electronjs.org/docs/latest/tutorial/security
https://learn.microsoft.com/de-de/windows/powertoys/general
