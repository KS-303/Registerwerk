# Registerwerk 0.3.0

Modbus-Prüfwerkzeug für **Windows x64**: Datenpunkte lesen, Werte beobachten, Geräte suchen und gezielte Schreibbefehle ausführen. Unterstützt **Modbus RTU**, **Modbus TCP** und transparente **Ethernet-RTU-Brücken**, beispielsweise Waveshare RS485 TO ETH.

## Installieren und aktualisieren

1. Unter [Releases](https://github.com/KS-303/Registerwerk/releases) das Setup der gewünschten veröffentlichten Version herunterladen: `Registerwerk-Setup-<Version>-x64.exe`.
2. Setup ausführen. Eine neue Portable-Ausgabe wird nicht mehr angeboten.
3. Registerwerk über Startmenü oder Desktopverknüpfung starten.

Die installierte App kann beim Start im Hintergrund nach Updates suchen. **Download und Installation benötigen jeweils deine Zustimmung**; es gibt keinen ungefragten Neustart. Vor der Installation Verbindungen trennen und ungesicherte Vorlagen exportieren. Unter Einstellungen ist die automatische Updateprüfung abschaltbar.

Versionen bis einschließlich 0.2.3 benötigen einmal ein aktuelles Setup, weil sie noch die frühere Signatursperre enthalten. Projektdateien vor einem Update als JSON sichern. Das Setup ist unsigniert; Windows kann warnen. Weitere Hinweise: [Sicherheit](SECURITY.md).

## In wenigen Schritten zum Messwert

1. **Verbindung** öffnen und RTU, Modbus TCP oder Ethernet-RTU wählen.
2. Über **Projekt → Projekt laden** eine Registerwerk-JSON öffnen oder **Datenpunkt hinzufügen** wählen.
3. Geräteadresse, Registeradresse, Funktion und Datenformat anhand der Geräteunterlage prüfen.
4. Verbindung herstellen und mit **Einmal abfragen** beginnen.
5. Bei passenden Werten **Messlauf starten** wählen. **Messlauf stoppen** beendet die Abfragen.
6. Die Konfiguration über **Projekt → Projekt exportieren** sichern.

**F1 / Hilfe** öffnet die ausführliche Offline-Anleitung. Seitenwechsel unterbrechen eine laufende Messung nicht. Die Statusleiste zeigt Verbindung und Aktivität.

## Verbindung wählen

| Verbindungsart | Angaben |
|---|---|
| RTU über USB-RS485 | COM-Port, Baudrate, Parität und Stoppbits wie am Gerät. Slave-ID **1–247**. |
| Modbus TCP | IP-Adresse/Hostname und TCP-Port, meist **502**. Unit-ID **0–255** gemäß Gerätehandbuch. |
| Ethernet-RTU-Brücke | IP-Adresse und TCP-Serverport des Gateways. Slave-ID **1–247**; serielle Parameter müssen zu Gateway und Endgerät passen. |

Für Waveshare **TCP Server** und den lokalen Listen-Port verwenden. Transparente RTU-Weiterleitung einschalten; zusätzliche Heartbeat-/Registrierungsdaten und RFC2217 dürfen den Datenstrom nicht verändern. **„Brücke aufgebaut“ bestätigt nur die TCP-Verbindung**, noch keine Kommunikation mit einem RTU-Endgerät.

RTU benötigt einen Adapter mit automatischer Senderichtungsumschaltung. Ein belegter COM-Port kann nicht gleichzeitig von einem anderen Programm genutzt werden. Für Parameteränderungen zuerst trennen. Timeout und Fehler-Wartezeit stehen unter **Erweiterte Verbindungseinstellungen**.

## Datenpunkte und Adressierung

| Feld | Bedeutung |
|---|---|
| Ein | Punkt bei Einzelabfrage und Messlauf berücksichtigen. |
| Bezeichnung | Frei wählbarer Name. |
| Gerät | Empfänger: Slave-ID bzw. Unit-ID, nicht die Registeradresse. |
| Bereich | FC 01: Coils, FC 02: diskrete Eingänge, FC 03: Holding Register, FC 04: Input Register. |
| Adresse | Register- oder Bitadresse aus der Herstellerunterlage. |
| Format | BOOL, HEX16, UINT16, INT16, UINT32, INT32 oder FLOAT32. |
| Bit | Bei BOOL aus einem Register: Bit **0–15**. Für Coils nicht nötig. |
| Faktor / Offset | `Anzeigewert = Rohwert × Faktor + Offset`. |
| Stellen | Angezeigte Nachkommastellen. |
| Wert / Rohwert / Status | Ausgewerteter Wert, empfangene Daten und Ergebnis der Abfrage. |

**Registerdetails anzeigen** blendet weitere Konfigurationsspalten ein. 32-Bit-Werte benötigen zwei Register; die Bytefolgen **ABCD, BADC, CDAB, DCBA** sind wählbar.

Unter **Messparameter und Adressierung** sind Adressbasis und Registeroffset einstellbar:

`Protokolladresse = Eingabeadresse − Basis + Registeroffset`

Basis ist 0 bei 0-basierter und 1 bei 1-basierter Eingabe. Die Prüfadresse des Bus-Scans ist immer 0-basiert. Herstellerangaben wie „4xxxx“ nicht ungeprüft als Protokolladresse verwenden.

**Alle Geräteadressen gleich** übernimmt die Geräteadresse der ersten Zeile für alle Punkte, auch später hinzugefügte. Für mehrere Geräte ausschalten. Beim Wechsel der Verbindungsart werden unzulässige IDs nicht automatisch geändert.

**Suche und Mehrfachbearbeitung** lässt sich aufklappen: Punkte filtern, rechts markieren und eine gemeinsame Aktion anwenden. Filter verändern nur die Anzeige. Zum Bearbeiten mehrerer Punkte zuerst trennen. Zeilen lassen sich duplizieren oder einzeln löschen; **Datenpunktliste leeren** entfernt nach Bestätigung alle Punkte.

## Lesen, Scan und Diagnose

- **Einmal abfragen:** Alle aktivierten Punkte einmal lesen.
- **Messlauf:** Wiederholt lesen; Pausen zwischen Punkten und Durchläufen sind einstellbar.
- **Einzelne Datenpunktfehler überspringen:** Gesunde Geräte weiter lesen, ausgefallene mit zunehmenden Pausen erneut prüfen. Ohne diese Option stoppt der Lauf beim ersten Fehler.
- **Bus Scan:** Einen gewählten Geräteadressbereich mit einstellbaren Lesefunktionen und Prüfadresse durchsuchen. Antworten und Geräteausnahmen zeigen erreichbare Teilnehmer; Ergebnisse können als Datenpunkte übernommen werden. Kein IP-Netzwerkscan.
- **Registerbereich lesen:** 1–125 zusammenhängende Register mit FC 03/04, einschließlich Hexadezimal-, Dezimal- und Binäranzeige.
- **Statistik / Trend:** Erfolge, Timeouts, Geräteausnahmen und Antwortzeiten. Bis zu acht ausgewählte Punkte; analoge Kurven und digitale Signalzeilen getrennt. Bis zu 600 Messungen je Punkt im Arbeitsspeicher, keine Langzeitaufzeichnung.
- **Adressen prüfen:** Überlappungen anhand von Gerät, Funktion, Adressbasis, Offset und Registerbreite erkennen. Es werden keine Telegramme gesendet.
- **Telegramm-Monitor:** Gesendete/empfangene Daten und Fehler ansehen. **Leeren** entfernt nur das sichtbare Protokoll.

Ein einzelner **Timeout trennt TCP/Ethernet-RTU nicht**. TCP verwirft verspätete Antworten anhand der Transaktions-ID. Ethernet-RTU verwirft Echo, Störbytes und CRC-Fehler und wartet nach einem Timeout vor der nächsten Anfrage auf Ruhe. Der größte Wert aus 250 ms, Timeout und Fehler-Wartezeit gilt; neue Empfangsdaten verlängern die Ruhephase. Nach höchstens dreifacher Wartezeit ohne Ruhe wird ohne Senden abgebrochen.

RTU besitzt keine Transaktions-ID: Sehr späte Antworten gleicher Geräteadresse/Funktion/Länge lassen sich auch danach nicht sicher unterscheiden. Timeout passend zum Gerät einstellen. **Bus freigeben** ist nur bei serieller RTU verfügbar. Ein echter Socket-/Netzwerkfehler beendet die Verbindung; bewusst neu verbinden.

## Schreiben

**Einstellungen → Nur-Lesen** ist standardmäßig aktiv und erlaubt ausschließlich FC 01–04. Zum Schreiben bewusst ausschalten, dann **Registerabfrage → Schreibbefehl** öffnen.

Unterstützt werden **FC 05/06** für ein Coil/Register und **FC 15/16** für mehrere Coils/Register. Die Vorschau zeigt Adresse und Werte vor dem Senden. Coils verwenden 0/1; Register unterstützen UINT/INT16/32 und FLOAT32. Mehrere Werte mit Semikolon oder Leerzeichen trennen; bei FLOAT32 ist ein Dezimalkomma möglich. Faktor und Offset der Lesetabelle gelten nicht für Schreibwerte.

**Schreibbefehle werden genau einmal gesendet, niemals automatisch wiederholt.** Nach einem Timeout kann der Befehl trotzdem ausgeführt worden sein. Vor einem neuen Versuch den Anlagenzustand prüfen. Nach positiver Quittung wird zurückgelesen; nicht jedes Kommando-Register unterstützt das. TCP-Unit-ID 0 kann an einem Gateway Broadcast bedeuten – Geräteunterlage beachten.

## Projekte und lokale Sitzungen

**Projekt → Laden / Entladen / Exportieren** verwaltet die JSON-Konfiguration mit Datenpunkten, Verbindungseinstellungen und optionalen Gerätehinweisen. Unterstützt werden bis zu **500 Datenpunkte** und Projektversionen 1–3. Vor dem Laden oder Entladen die Verbindung trennen.

Bis zu **fünf lokale Sitzungen** können wiederhergestellt, benannt und gelöscht werden. Die Startauswahl zeigt Zeitpunkt und Schnittstelle; **Neue Sitzung** beginnt ohne Wiederherstellung. Startverhalten und erneute Nachfrage sind einstellbar. Geräte werden nie automatisch verbunden.

**Projekt entladen** leert die Arbeitsliste und Hinweise, löscht aber nicht alle älteren Sitzungssicherungen. Für deren Entfernung die Sitzungsverwaltung verwenden. Lokale Daten liegen unter `%APPDATA%\Registerwerk` und bleiben bei Deinstallation erhalten. Für Sicherungen und andere Rechner eine Projekt-JSON exportieren.

## TXI2.OPEN-Vorlagen

Über **Export → TXI2.OPEN - Vorlage exportieren** Datenpunkte in eine IOOPT-Vorlage übernehmen. **TXI2.OPEN - Vorlage öffnen** lädt eine vorhandene Vorlage zum Weiterarbeiten.

- Gewünschte Punkte markieren und TX-Typ, Funktionscode, Protokolladresse, Fremd-Signaltyp und Konversionsangaben prüfen.
- Namen frei wählen, übernehmen oder leer lassen; Beschreibungen, Einheiten und Wertebereiche sind optional.
- Mehrere Zusätze wie `/R15`, `/S`, `/F`, `/R1–R4`, `/GN`, `/G`, `/D=` und `/M=` auf ausgewählte Punkte anwenden.
- Fehler erscheinen am Feld und in der Übersicht. **IOOPT exportieren …** öffnet die Auswahl von Dateiname und Speicherort.

Eine Vorlage beschreibt einen Gerätetyp; aus einem Projekt nur Punkte derselben Geräteadresse übernehmen. Höchstens 160 Punkte je TXI2.OPEN-Modul. **Faktor/Offset werden nicht automatisch übertragen**; Skalierung und nicht eindeutig abbildbare Bytefolgen im Zielsystem prüfen. Geräteadresse, IP, Port und Zielkommunikation im TX Open Tool projektieren. Die integrierte Hilfe erklärt die Konversionen und Zusätze genauer.

## Darstellung und Hilfe

Hell, Dunkel oder Windows-Einstellung, Akzentfarben, Tabellendichte, Namensbreite und Rohwertanzeige sind einstellbar. Seitenleiste und Bedienbereiche lassen sich verkleinern bzw. einklappen. Fenster- und Darstellungseinstellungen bleiben erhalten. **Darstellung zurücksetzen** verändert keine Projekte oder Verbindungseinstellungen.

Bei Problemen mit Messwerten zuerst Geräteadresse, Funktionscode, Registeradresse, Adressbasis, Datentyp und Bytefolge prüfen. Bei Timeouts zusätzlich Verbindung, Versorgung und serielle Parameter kontrollieren. **F1** enthält weitere Erklärungen und Fehlerhilfen.

## Wichtige Grenzen

Keine Telemetrie und keine automatischen Geräteverbindungen. Modbus ist unverschlüsselt und ohne Authentifizierung. Nur-Lesen ist ein Softwareschutz, keine hardwareseitige Schreibsperre. Simulationstests ersetzen keine Prüfung mit dem eigenen Gerät. Weitere Hinweise stehen in [SECURITY.md](SECURITY.md), Änderungen in [CHANGELOG.md](CHANGELOG.md).

Copyright © 2026 Kevin Schmidt. Der öffentliche Quellcode steht derzeit unter keiner Open-Source-Lizenz (`UNLICENSED`).
