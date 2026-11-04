# Registerwerk 0.2.0 – Prüfbericht

Stand: 04.11.2026. Ausgangspunkt: 0.1.10 / GitHub-Commit `1b7e6604f3b3f50c4db2103a876cb2abf574662c`.

**Ergebnis: funktionsfähiger Entwicklungsstand mit neuer Desktop-Oberfläche. Keine Produktionsfreigabe.**

## Ausgeführt

- Saubere Installation mit `npm ci` aus dem Lockfile.
- **24 Node-Tests bestanden.** Portsteuerung, Updatezustände, Einstellungen/Recovery, Authenticode-Ergebnisvalidierung und ursprünglicher RTU-Parser.
- **41 Electron-Prüfgruppen bestanden.** Die bestehende Suite und zusätzliche Prüfungen wurden nach Integration mehrfach ausgeführt. Der abschließende Lauf meldet `REGISTERWERK_SMOKE_PASS`.
- Realer Electron-Prozess mit isoliertem Renderer, tatsächlichen IPC-Aufrufen, lokalen TCP-Servern und echten Datei-Downloads. Keine Modbus-Endgeräte vorhanden.
- Visuelle Kontrolle von Hell/Dunkel, Verbindung, Datenpunkten, Einstellungen und Hilfe bei 1500×1000 sowie 1024×768. Screenshots liegen in `docs/screenshots`.
- Windows-x64-Anwendungsordner per electron-builder erzeugt; ASAR auf Desktopmodule, Shell und Updater-Laufzeitabhängigkeiten geprüft. Windows-Ausführung nicht möglich.
- NSIS-Installerbau versucht; abgebrochen bei `spawn wine ENOENT`. Hier fehlen Windows bzw. Wine. Kein fertiger Installer wird ausgeliefert.
- JavaScript-Syntax und `git diff --check` geprüft. Buildschema von electron-builder im Paketierungsversuch akzeptiert. GitHub-Workflow als YAML geprüft, jedoch nicht auf GitHub ausgeführt.

Reproduzierbare Ausgaben: `test-results-node.txt`, `test-results-electron.txt`, `build-windows-package.txt`, `package-check.txt`, `npm-audit-production.json`, `npm-audit-complete.json`.

In den Electron-Logs sind absichtlich ausgelöste IPC-Fehler enthalten (Timeout, Übergröße, Nur-Lesen, unzulässiger Einstellungsschlüssel). Diese sind Teil der Negativtests. Linux-Meldungen zu DBus/udev stammen aus der Testumgebung. Der Linux-Testprozess als Container-root verwendet `--no-sandbox`; das ist nicht Teil der Windows-Startkonfiguration. Die Windows-Sandbox wurde hier nicht praktisch getestet.

## Funktionsvergleich und Teststatus

| Funktion aus 0.1.10 | In 0.2.0 | Beleg / Grenze |
|---|---|---|
| RTU, COM-Auswahl, Hotplug, Abbruch | erhalten | IPC-Auswahl und Parser automatisiert; USB-/RS485-Hardware offen |
| CRC, Fragmente, Echo, Störbytes, Exception, Puffergrenze | erhalten | Node führt die ursprünglichen Parserfunktionen aus; falsche ID/FC/Länge, 20.000 Störbytes und Recovery geprüft |
| Busruhe, Sendefehler, Rückoffzeiten | Kern erhalten | Quellprüfung; Busruhe unter realen elektrischen Störungen offen |
| Modbus TCP | erhalten | echte lokale Sockets, Fragmentierung, MBAP, Unit-ID, Timeout, Abbruch |
| Ethernet-RTU / Waveshare | erhalten | echte lokale TCP-Sockets mit RTU-Frames; CRC, ungültige Antwort, stille Teilnehmer; echter Waveshare offen |
| Bus-Scan mit Reconnect nach Timeout | erhalten | erste ID still, nächste ID antwortet; CRC/ID/FC geprüft, Ausnahme erkannt; Seitenwechsel während Scan geprüft |
| FC01/02/03/04 lesen | erhalten | beide Netzwerkbetriebsarten; FC04 zusätzlich als Bereichsabfrage |
| UINT/INT16/32, FLOAT32, vier Bytefolgen, HEX, BOOL | erhalten | TCP und Ethernet-RTU mit bekannten unabhängigen Antwortbytes; Faktor 0,1; Registerbit und Coil |
| Gemeinsame Geräteadressen, Punktverwaltung | erhalten | vorhandener Integrationstest; Einzel-Löschen jetzt mit Bestätigung, Grenze 500 Punkte auch beim Hinzufügen |
| Einzelabfrage / Messlauf / Stoppen | erhalten | lokaler Server; Navigation während Messlauf sendet weiter; globaler Stopp erhält Verbindung |
| FC05/06/15/16 schreiben | erhalten, Nur-Lesen standardmäßig aktiv | UI-Vorschau/Bestätigung, tatsächliche Socket-Anfrage genau einmal, Rücklesen; Timeout ohne Wiederholung; keine reale Anlagenprüfung |
| Registerbereich 1–125 | erhalten | FC04-Bereich simuliert; Grenzen im ursprünglichen Code beibehalten |
| Statistik / Trend | erhalten | Erfolge, Ausnahme, Timeout, mittlere Werte, Reset und Trendselektion; 600 Punkte/8 Kurven bleiben |
| Adressprüfung | erhalten | 16-/32-Bit-Überlappung, getrennte Geräte, unterschiedliche BOOL-Bits |
| JSON v1–3, Import/Export, Entladen | Schema erhalten | Datei-API und Download, Metadaten, getrennte Geräte; manipulierte Strukturen abgelehnt ohne Listenänderung |
| Lokale Sitzungssicherung | erhalten, Wiederherstellung jetzt abschaltbar | Neuladen, Wiederherstellung und bewusst leerer Start geprüft; altes Profil unverändert adressiert |
| IOOPT laden/bearbeiten/exportieren | erhalten | bestehende XML-Suite: Mehrfachauswahl, Zusätze, Codes 0–9, optionale Felder, Fehlerkorrektur, erneutes Laden |
| Tatsächlicher TX-Open-Import | bisheriger Nutzerbeleg gilt für Vorgängerversion | XML-Serializer nicht neu geschrieben; erneuter Import dieser Version am Windows-TX-Tool offen |
| Hilfe / Tooltips / Validierung | erhalten und erweitert | Hilfe als Arbeitsseite, F1-Ziel, Navigation, ursprüngliche TX-Feldvalidierung; versteckte Eingaben werden zur Fehlerkorrektur sichtbar |
| GitHub-Updates | erhalten, strengere Freigabe | Controller-Tests und Installationssperren; ohne konfigurierten Herausgeber ist integrierter Download bewusst gesperrt |
| NSIS-Installer | Konfiguration aktualisiert | nur Installer, keine neue Portable-Ausgabe; endgültiger Build/Installation benötigt Windows |
| Darstellungs-/Fenstereinstellungen | neu | Schema, atomarer Austausch, beschädigte Datei, Backup, Reset, Monitorwechsel-Geometrie; Windows-DPI praktisch offen |
| Status/Navigation | neu | vorhandene DOM-Knoten bleiben identisch; keine Neuinstanzierung der Kommunikation |

## Gefundene und behobene Punkte

1. **Persönliche Einstellungen fehlten:** eigene versionierte Datei im Benutzerprofil, begrenzte Whitelist, keine frei wählbaren Dateipfade, atomarer Austausch und letzte gültige Sicherung. Fehler beim Speichern werden angezeigt.
2. **Keine zuverlässige Signaturpflicht für Updates:** fehlender Herausgeber kann beim verwendeten Updater zu übersprungener Signaturprüfung führen; dessen Standardprüfer enthält zudem Kompatibilitätsausnahmen bei nicht verfügbarem PowerShell. Die neue Verifikationsschranke lehnt ohne exakte Herausgeberkonfiguration oder ohne prüfbares Authenticode-Ergebnis ab. Prüfskript ist konstant, Dateiname wird über eine Umgebungsvariable übergeben, keine Shell-Interpolation. Signatur wird vor der Installation erneut geprüft.
3. **Projektfelder ließen teilweise ungeeignete Datentypen durch:** Arrays als Einstellungsobjekte, boolesche Zahlen und nichttextuelle Bezeichnungen werden abgelehnt. Numerische Zeichenketten bleiben für bisherige Projektkompatibilität zulässig.
4. **Navigation könnte Validierung verstecken:** fachliche Felder werden auch auf ausgeblendeten Arbeitsseiten geprüft; Fehler öffnen die passende Seite und Registerdetails. Verbindungs-/Projektparameter werden während laufender Vorgänge gesperrt, Projektwechsel während Verbindungsaufbau abgewiesen.
5. **Schreibschutz fehlte:** standardmäßige Nur-Lesen-Betriebsart; Prüfung vor der UI-Schreibaktion und für Netzwerkbefehle zusätzlich im Hauptprozess. Der Renderer besitzt wegen des beibehaltenen Web-Serial-Kerns weiterhin die serielle Berechtigung; das ist keine hardwareseitige Schreibsperre.
6. **Unklare TCP-Schreibfehler:** auch Timeout-/Verbindungsfehlermeldungen ohne eigenen Fehlercode erklären, dass der Befehl trotzdem ausgeführt worden sein kann.
7. **Punktgrenze nur beim Import:** Hinzufügen ist ebenfalls auf 500 Punkte begrenzt. Einzel-Löschen fragt vor dem Entfernen nach.
8. **Build-Abhängigkeiten/Workflow:** Laufzeit-Audit im Workflow; Actions auf die am 04.11.2026 aufgelösten Commit-SHAs festgelegt; Release-Build erfordert Signatur und prüft Setup/App nochmals. Kein ungefragtes Hochladen oder Veröffentlichen vorgenommen.

## Verbleibende Sicherheitsbefunde

`npm audit --omit=dev`: **0 gemeldete Befunde**. Das bedeutet nicht, dass die Anwendung frei von Sicherheitslücken ist.

Vollständiges `npm audit`: **15 moderate Meldungen, 0 hoch, 0 kritisch**. Sie betreffen die Entwicklungs-/Build-Abhängigkeitskette, maßgeblich `minimatch <11.0.1` (GHSA-g3hv-75wg-m249) und davon abhängige Werkzeuge. Kein blindes `npm audit fix --force`: npm schlägt unter anderem ein starkes electron-builder-Downgrade vor; das würde weder die neue Toolchain noch ihre Sicherheit zuverlässig verbessern. Ein geprüftes Upgrade dieser Kette bleibt offen. Projektdateien werden nicht als Buildmuster oder Buildskripte verwendet.

Klassisches Modbus TCP ist nicht authentifiziert/verschlüsselt. Eine Netzwerkverbindung zum Gateway beweist keine erfolgreiche RS485-Kommunikation. Verspätete RTU-Antworten gleicher Geräte-ID/Funktion/Länge können ohne Transaktions-ID nicht in jedem Fall zweifelsfrei zugeordnet werden; die bestehenden Schutzpausen und der Scan-Reconnect bleiben erhalten.

Die neue Architektur trennt Shell, Einstellungen, Updateprüfung und Desktopzugriffe. Der vorhandene Fachkern bleibt größtenteils in der bisherigen Quelldatei, um keine unnötige Protokoll-Neuentwicklung zu erzwingen. Eine vollständige Aufteilung dieses Altbestands in unabhängige Kommunikations-, Projekt- und Diagnosemodule ist noch nicht abgeschlossen.

## Vor Produktionsfreigabe noch auszuführen

- Windows-NSIS-Build, Erstinstallation ohne Administratorrechte, Startmenü/Desktopwahl, Startzeit, Deinstallation.
- Upgrade von der bisher installierten Ausgabe: vorhandene JSON-Projekte, lokale Sitzungen und persönliche Einstellungen erhalten; keine automatische Verbindung.
- Signiertes Setup mit echtem Herausgeberzertifikat; gültiges Folgeupdate, falscher Herausgeber, manipulierte Datei und nicht verfügbare Signaturprüfung unter Windows. Ohne Zertifikat kein signierter Release und kein integrierter Download.
- Windows-Hell/Dunkel-Wechsel, mehrere Monitore und DPI-Skalierung, Fensterwiederherstellung.
- USB-RS485 mit Abziehen während Anfrage, realer Busruhe, Echo/Störungen; direktes TCP-Gerät; echter Waveshare mit mindestens zwei Teilnehmern und stiller Geräteadresse vor einem antwortenden Gerät.
- Schreibzugriffe an einem freigegebenen Prüfgerät; tatsächlicher Anlagenzustand und Rücklesen.
- Erneuter IOOPT-Import im Siemens TX Open Tool und Prüfung am TXI2.OPEN.

Diese offenen Prüfungen werden nicht durch die bestandenen Simulationen ersetzt.
