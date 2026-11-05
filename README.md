# Registerwerk 0.2.4

Registerwerk ist ein Modbus-Prüf- und Auslesewerkzeug für Windows. Es unterstützt RTU über USB-RS485, Modbus TCP direkt am Gerät und RTU über Ethernet-Brücken wie den Waveshare RS485 TO ETH. Die App liest Datenpunkte, zeigt Messwerte und Rohdaten an und ermöglicht gezielte Schreibbefehle. Eine Hilfe ist direkt integriert.

## Windows-Arbeitsoberfläche

Registerwerk 0.2.4 nutzt weiterhin Electron und den bisherigen Modbus-Kern. Die portable Ausgabe entfällt. Die installierte App läuft ohne Browserfenster und ohne Administratorrechte im Normalbetrieb.

| Arbeitsbereich | Inhalt |
|---|---|
| Verbindung | RTU, Modbus TCP, Ethernet-RTU; COM-Auswahl und Parameter |
| Datenpunkte | Registerliste, Einzelabfrage, Messlauf, Messparameter und Adressierung |
| Bus-Scan | Geräteadressen gezielt prüfen, Ergebnisse übernehmen |
| Registerabfrage | Registerblock lesen, bestätigte Schreibbefehle |
| Statistik und Trend | Kommunikationsstatistik, Werteverlauf und Adressprüfung |
| Telegramme | TX/RX und begrenztes Kommunikationsprotokoll |
| Projekte und Vorlagen | JSON öffnen/exportieren/entladen, IOOPT öffnen/exportieren |
| Einstellungen | Design, Tabellen, Nur-Lesen, Wiederherstellung und Updates |
| Hilfe | Offline-Anleitung und Fehlerdiagnose, auch über F1 |

Seitenwechsel lassen Verbindung und laufende Vorgänge bestehen. Die Statusleiste unten zeigt Schnittstelle, Aktivität und die letzten TX/RX-Zeiten. **Messlauf stoppen**, **Scan stoppen** und **Verbindung trennen** bleiben dort erreichbar.

Die Datenpunkttabelle startet als **Messansicht**. **Registerdetails anzeigen** blendet Funktion, Datentyp, Bit, Faktor, Offset und Stellen zur Bearbeitung ein. Weitere Parameter stehen unter **Messparameter und Adressierung**. Fehler werden am Feld und beim Lesen auch im Zeilenstatus angezeigt; ein verstecktes Fehlerfeld wird zur Korrektur geöffnet.

## Schnellstart

1. Auf der Seite **Verbindung** unter **Verbindungsart** RTU, Modbus TCP oder Ethernet-RTU-Brücke wählen.
2. Über **Projekt → Projekt laden** eine Registerwerk-JSON laden oder **Datenpunkt hinzufügen** wählen.
3. Geräteadresse und Verbindungseinstellungen mit dem angeschlossenen Gerät abgleichen.
4. Bei RTU den USB-RS485-Port auswählen. Bei TCP IP-Adresse und Port eintragen und **TCP-Verbindung herstellen** wählen.
5. Mit **Einmal abfragen** prüfen, ob die Werte stimmen. Anschließend bei Bedarf **Messlauf starten** wählen.
6. Die Konfiguration über **Projekt exportieren** sichern.

## Verbindung einstellen

### RTU über USB-RS485

Vorbelegt sind **9600 Baud, 8 Datenbits, keine Parität und 1 Stoppbit (8N1)**. Diese Vorbelegung muss zur tatsächlichen Gerätekonfiguration passen.

| Einstellung | Bedeutung |
|---|---|
| Baudrate | Übertragungsgeschwindigkeit des Geräts. |
| Parität | Keine, gerade oder ungerade – entsprechend der Geräteeinstellung. |
| Datenbits | Modbus RTU verwendet 8 Datenbits. |
| Stoppbits | 1 oder 2, passend zum Gerät. |
| Antwort-Timeout | Wartezeit auf eine gültige Antwort. Bei langsamer Übertragung oder langen Antworten wird sie bei Bedarf automatisch verlängert. |
| Sicherheitsabstand | Zusätzliche Wartezeit nach Kommunikationsfehlern. |

Die erweiterten Einstellungen enthalten Timeout und Sicherheitsabstand. Zum Ändern der seriellen Parameter zuerst **Verbindung trennen** wählen.

Die COM-Port-Auswahl zeigt verfügbare Ports und aktualisiert sich beim An- und Abstecken. Es wird kein Adapter automatisch ausgewählt. **Abbrechen** oder **Esc** beendet die Auswahl.

Für RS485 wird ein Adapter mit automatischer Senderichtungsumschaltung benötigt. Versorgung und Busverdrahtung müssen zum angeschlossenen Gerät passen.

### Modbus TCP direkt

**Modbus TCP · direkt zum Gerät** wählen und IP-Adresse sowie TCP-Port des Endgeräts eintragen. Der Standardport ist **502**. Die Spalte **Gerät** enthält dabei die Modbus-Unit-ID. Die seriellen Parameter werden bei direkter TCP-Verbindung nicht verwendet. Der Bus Scan, Registerbereich-Leser und Schreibbefehle verwenden dieselbe TCP-Verbindung.

### Ethernet-RTU-Brücke

**Ethernet-RTU-Brücke** wählen und IP-Adresse sowie den TCP-Serverport des Gateways angeben. Registerwerk sendet das vollständige Modbus-RTU-Telegramm einschließlich CRC über den TCP-Socket und erwartet am Gateway eine transparente Weiterleitung zur RS485-Seite.

Für einen Waveshare RS485 TO ETH das Gerät als **TCP Server** konfigurieren und seinen lokalen Listen-Port in Registerwerk eintragen. Baudrate, Parität und Stoppbits müssen in der App, am Gateway und am RTU-Endgerät übereinstimmen. RFC2217 sowie zusätzliche Heartbeat- oder Registrierungsdaten ausschalten, sofern sie im transparenten Datenstrom mitgesendet würden.

Eine Meldung **„Ethernet-RTU-Brücke aufgebaut“** bestätigt nur, dass der TCP-Port des Gateways erreichbar ist. Zum Nachweis der Modbus-Kommunikation muss ein RTU-Endgerät korrekt angeschlossen sein und auf die gewählte Unit-ID, Funktion und Registeradresse antworten. Ein Ping ist dafür nicht erforderlich.

## Datenpunkte anlegen und bearbeiten

Jede Tabellenzeile beschreibt einen Datenpunkt. Für alle Konfigurationsspalten **Registerdetails anzeigen** einschalten.

| Spalte | Funktion |
|---|---|
| Ein | Aktiviert den Punkt für Einzelabfrage und Messlauf. |
| Bezeichnung | Frei wählbarer Name. |
| Gerät | Modbus-Geräteadresse beziehungsweise Slave-ID von 1 bis 247. |
| Bereich | Modbus-Lesefunktion gemäß Herstellerunterlage. |
| Adresse | Register- oder Bitadresse des Datenpunkts. |
| Format | Datentyp und gegebenenfalls Byte-Reihenfolge. |
| Bit | Bei BOOL aus einem Register die Bitnummer von 0 bis 15. |
| Faktor | Multipliziert den gelesenen Zahlenwert. |
| Offset | Wird nach der Multiplikation addiert. |
| Stellen | Anzahl der angezeigten Nachkommastellen. |
| Wert | Ausgewerteter Messwert. |
| Rohwert | Empfangene Daten vor der Skalierung, meist hexadezimal. |
| Status | Ergebnis oder Fehler der letzten Abfrage. |

**Geräteadresse und Registeradresse sind unterschiedliche Angaben:** Die Spalte **Gerät** bestimmt den Empfänger, die Spalte **Adresse** den gelesenen Datenpunkt.

### Alle Geräteadressen gleich

Wenn alle Zeilen zu einem Gerät gehören, **Alle Geräteadressen gleich** einschalten. Die Geräteadresse der ersten Zeile wird sofort auf die gesamte Liste übertragen. Spätere Änderungen dort gelten automatisch für alle Zeilen und neu hinzugefügte Datenpunkte.

Die übrigen Geräteadressfelder sind dabei gesperrt. Für mehrere Geräte am selben Bus die Option ausschalten. Die Registeradressen bleiben individuell.

### Lesefunktionen und Formate

| Funktion | Bereich |
|---|---|
| FC 01 | Coils |
| FC 02 | Diskrete Eingänge |
| FC 03 | Holding Register |
| FC 04 | Input Register |

Unterstützt werden **BOOL, HEX16, UINT16, INT16, UINT32, INT32 und FLOAT32**. 32-Bit-Werte benötigen zwei Register. Die Byte-Reihenfolgen **ABCD, BADC, CDAB und DCBA** sind wählbar. Funktion, Datentyp und Reihenfolge aus der Herstellerliste übernehmen.

Für numerische Messwerte gilt:

`Anzeigewert = gelesener Zahlenwert × Faktor + Offset`

Beispiel: `216 × 0,1 + 0 = 21,6`.

### Adressbasis und Registeroffset

Unter **Adresseingabe** festlegen, ob Adressen 0- oder 1-basiert eingegeben werden. Danach wird der zusätzliche Registeroffset berücksichtigt:

`Protokolladresse = Eingabeadresse − Basis + Registeroffset`

Basis ist 0 bei 0-basierter und 1 bei 1-basierter Eingabe. Ohne Offset wird aus Eingabe 1000 entsprechend Protokolladresse 1000 oder 999. Die Adresskonvention der Herstellerunterlage beachten.

Einzelne Zeilen lassen sich über **×** entfernen. **Datenpunktliste leeren** entfernt nach Bestätigung die gesamte Liste. Während laufender Abfragen ist die Bearbeitung gesperrt.

## TXI2.OPEN-Punktvorlagen

Über **Export → TXI2.OPEN - Vorlage exportieren** lassen sich Datenpunkte des geladenen Registerwerk-Projekts in einer IOOPT-Vorlage aufbereiten. **Export → TXI2.OPEN - Vorlage öffnen** öffnet eine vorhandene Vorlage mit einem Gerät. Der Editor übernimmt die vorhandene XML-Struktur und lässt die ausgewählten Punkte bearbeiten.

1. Datenpunkte auswählen und über **Bearbeiten** TX-Typ, Funktionscode, Protokolladresse, Fremd-Signaltyp, MappingInfo 3 und 4 sowie bei Bedarf Einheit und Wertebereich prüfen.
2. Für mehrere markierte Punkte gleichzeitig Zusätze wie `/R15`, `/S`, `/F`, `/R1` bis `/R4`, `/GN` oder `/G` auswählen und hinzufügen oder entfernen. Weitere Zusätze, beispielsweise `/D=` und `/M=`, können im Fremd-Signaltyp eingetragen werden.
3. I/O-Namen übernehmen, leer lassen oder neutrale Namen wählen. Beschreibungen, Einheiten sowie Standardwerte und Wertebereiche sind wählbar. Lokale Pfade und Benutzernamen können neutralisiert und die Gerätekennung ersetzt werden.
4. **IOOPT exportieren …** öffnet in der Windows-App den Speicherdialog. Dateinamen und Zielordner wählen. Die exportierte IOOPT kann später erneut geladen werden.

TXI2.OPEN unterstützt höchstens 160 Punkte je Modul. Eine IOOPT ist eine Gerätevorlage; bei der Übernahme aus einem Projekt dürfen für eine Vorlage nur Punkte derselben Geräteadresse ausgewählt werden. Die Geräteadresse wird im TX-Open-Projekt zugeordnet.

Bus- und Geräte-Kommunikation lassen sich getrennt bearbeiten. Bei einem direkten TCP-Projekt wird `IPv4` vorgeschlagen; IP-Adresse, Port und TX-Kommunikationsparameter werden nicht automatisch übertragen und müssen im TX Open Tool ergänzt werden. Eine in Registerwerk verwendete Ethernet-RTU-Brücke bestimmt nicht automatisch, wie das TX-Modul angeschlossen ist. Busabschluss und TX-Verbindung separat prüfen.

MappingInfo 3 ist `0` ohne Bitzuordnung und `1–16` für eine Bitposition. Registerwerk-Bits `0–15` werden entsprechend um eins erhöht. MappingInfo 4 steht bei Bitzuordnung für die Bitanzahl; ohne Bitzuordnung sind die Konversionen 0–9 einstellbar: keine, Register tauschen, BCD16A/B, BCD32A/B, ACM16, U32BITMOD10000, S32BITMOD10000 und Bytes tauschen. Es gilt die Kompatibilität zur jeweiligen TX-Protokollversion und zum Datentyp.

**Faktor und Offset werden nicht automatisch in die IOOPT übertragen.** Der Editor markiert betroffene Punkte; ihre Skalierung muss in der Zielprojektierung berücksichtigt werden. Ein Bestätigungshaken ist nicht erforderlich. Fehlerhafte Eingaben erscheinen beim Export in der Datenpunktübersicht und am Feld. Nicht eindeutig übertragbare Byte-Reihenfolgen müssen ebenfalls manuell gewählt und geprüft werden. Schreibfunktionen werden aus einer Registerwerk-Leseliste nicht automatisch erfunden. Leere Namen und neu erzeugte Vorlagen müssen im TX Open Tool auf Import und Funktion geprüft werden.

Grundlage: [Siemens TX Modbus Engineering-Anleitung CM110571](https://sid.siemens.com/v/u/A6V10243805).

## Einzelabfrage und Messlauf

- **Einmal abfragen:** Liest jeden aktivierten Datenpunkt einmal.
- **Messlauf starten:** Fragt die aktivierten Punkte fortlaufend ab.
- **Messlauf stoppen:** Beendet den Lauf nach Abschluss der aktuellen Anfrage.
- **Pause zwischen Datenpunkten:** Abstand zwischen den Abfragen innerhalb eines Durchlaufs.
- **Pause zwischen Durchläufen:** Abstand vor dem nächsten vollständigen Durchlauf.

**Einzelne Datenpunktfehler überspringen** ist standardmäßig aktiv. Gesunde Geräte werden weiter gelesen; fehlerhafte Punkte und ausgefallene Geräte werden mit zunehmenden Pausen erneut geprüft. Ohne diese Option stoppt der Lauf beim ersten Datenpunktfehler.

Bei einem Fehler werden alte Messwerte des betroffenen Punkts geleert. Ein Verbindungsverlust oder dauerhaft unruhiger Bus hält den Messlauf an.

### Bus freigeben

Nach einem Timeout wartet die App vor einer Wiederholung auf Busruhe. Das Warten ist begrenzt. Wird der Bus nicht ruhig, erscheint eine Fehlermeldung und die betroffene Anfrage wird nicht gesendet.

**Bus freigeben** wartet auf Ruhe und verwirft alte Empfangsdaten, ohne ein Telegramm zu senden. **Freigabe abbrechen** beendet das Warten, ohne die Verbindung zu trennen.

## Bus Scan

Der Bus Scan sucht innerhalb eines gewählten Geräteadressbereichs nach antwortenden Geräten. Einstellbar sind erste und letzte Geräteadresse, Prüfadresse, Prüf-Funktionen und Timeout.

Der Scan sendet echte Leseanfragen. Eine gültige Antwort oder Modbus-Ausnahme zählt als Reaktion. Ein stilles Gerät kann trotzdem vorhanden sein, wenn es auf die gewählte Funktion oder Prüfadresse nicht antwortet. Bei TCP und Ethernet-RTU wird die Verbindung nach einem Timeout wiederhergestellt; bei Ethernet-RTU wartet Registerwerk zusätzlich, damit verspätete Antworten möglichst nicht der nächsten Anfrage zugeordnet werden. Ein kompletter Scan kann dadurch länger dauern. Ist keine erneute Verbindung möglich, bricht der Scan mit Verbindungsfehler ab.

- Die Prüfadresse ist immer **0-basiert**.
- Aus einem erfolgreichen Ergebnis lässt sich ein Datenpunkt anlegen.
- Mit anderen Einstellungen kann der Scan wiederholt werden.
- **Scan abbrechen** beendet den laufenden Scan.

## Registerbereich lesen

Liest **1 bis 125 zusammenhängende Register** mit FC 03 oder FC 04. Geräteadresse, Startadresse und Registeranzahl festlegen.

Die eingestellte Adressbasis und der Registeroffset werden angewendet. Die Ergebnistabelle zeigt Eingabeadresse, Protokolladresse sowie Hexadezimal-, Dezimal- und Binärwerte.

## Kommunikationsstatistik, Trend und Adressprüfung

Über **Statistik / Trend** bei der Datenpunktliste öffnet sich die Auswertung. Sie zählt Datenpunkt-Leseversuche ab Übergabe an den Transport. Erfolgreiche Antworten, Timeouts, Geräteausnahmen, sonstige Fehler und Abbrüche werden getrennt gezählt. Die Erfolgsquote bezieht sich auf abgeschlossene Erfolge und Fehler; Abbrüche zählen nicht. Die mittlere Antwortzeit gilt für erfolgreiche Antworten einschließlich Transportübergabe.

Im Werteverlauf können bis zu acht Punkte gewählt werden. Alle Kurven verwenden eine gemeinsame automatische Skala. Registerwerk speichert maximal 600 Messungen je Punkt im Arbeitsspeicher, inklusive Fehlerlücken; beim Beenden oder Zurücksetzen gehen sie verloren. Es erfolgt keine Datei- oder Langzeitaufzeichnung. BOOL wird als 0/1 gezeigt, Zahlen werden vor der Anzeigerundung verwendet.

**Adressen prüfen** berücksichtigt Geräteadresse, Funktionsbereich, Adressbasis, Offset und Registerbreite. Überschneidungen und unterschiedliche Bits desselben Registers werden als Hinweise angezeigt, da sie bewusst gewünscht sein können. Die Prüfung erzeugt keine Modbus-Anfragen.

## Schreibbefehle

Standardmäßig ist **Einstellungen → Nur-Lesen** aktiv. Für einen beabsichtigten Schreibzugriff ausschalten, dann unter **Registerabfrage → Schreibbefehl** Geräteadresse, Funktion, Startadresse, Format und Werte eingeben. Vor dem Senden zeigt eine Bestätigung die eingegebene und umgerechnete Adresse, das Format, die Klartextwerte und die Anzahl der Register beziehungsweise Coils.

| Funktion | Schreibzugriff |
|---|---|
| FC 05 | Einzelnes Coil |
| FC 06 | Einzelnes 16-Bit-Register |
| FC 15 | Mehrere Coils |
| FC 16 | Mehrere Register, auch für 32-Bit-Werte |

Für Register sind UINT16, INT16, UINT32, INT32 und FLOAT32 mit passender Byte-Reihenfolge verfügbar. Coils verwenden 0 oder 1.

- FLOAT32 akzeptiert Dezimalkomma und Dezimalpunkt: `23,5` ist ein Wert und belegt zwei Register.
- Mehrere Werte mit **Semikolon oder Leerzeichen** trennen, etwa `23,5; 24,0`.
- Faktor und Offset der Datenpunkttabelle werden nicht auf Schreibwerte angewendet.

**Schreibbefehle werden genau einmal gesendet und nicht automatisch wiederholt.** Fehlt die Quittung, kann der Befehl trotzdem ausgeführt worden sein. Vor einem weiteren Versuch den Anlagenzustand prüfen.

Nach positiver Quittung wird der Bereich zurückgelesen. Schreib- oder Kommando-Register können dieses Rücklesen ablehnen; das bedeutet nicht automatisch, dass der Schreibbefehl fehlgeschlagen ist.

## Projekte öffnen, exportieren und wiederherstellen

**Projekt → Projekt laden** lädt eine Registerwerk-JSON und ersetzt die aktuelle Liste sowie die Einstellungen. Dafür muss die Verbindung getrennt sein. Der Import unterstützt bis zu **500 Datenpunkte**.

**Projekt → Projekt entladen** entfernt alle Datenpunkte, Projekthinweise und sichert diesen leeren Zustand lokal. Ältere Sitzungssicherungen sind dadurch nicht sicher gelöscht. Die Verbindungseinstellungen bleiben erhalten. Dafür muss die Verbindung getrennt sein.

**Projekt → Projekt exportieren** speichert Datenpunktkonfiguration, Verbindungseinstellungen, Adressbasis, Registeroffset und die Optionen für gemeinsame Geräteadressen und Fehlerbehandlung. Optional können Gerätebezeichnung und Hinweise hinterlegt werden. COM-Port-Freigaben werden nicht übertragen.

Zusätzlich sichert die App Änderungen lokal und stellt eine Sitzung beim nächsten Start nach Möglichkeit wieder her. Es bleiben höchstens fünf Sitzungssicherungen erhalten. Die Windows-App speichert im bestehenden Profil `%APPDATA%\Registerwerk`. Unter Einstellungen lässt sich die automatische Wiederherstellung abschalten; eine Verbindung wird nie automatisch aufgebaut.

Für die Sicherung und Übertragung auf andere Rechner eine **Projekt-JSON exportieren**.

## Telegramm-Monitor und Fehlerbehebung

Der Monitor zeigt gesendete und empfangene Telegramme sowie Kommunikationsfehler. **Leeren** entfernt nur das sichtbare Protokoll.

| Beobachtung | Prüfen |
|---|---|
| Port lässt sich nicht öffnen | Adapter, Treiber und Zugriff durch andere Programme. |
| Keine gültige Antwort / Timeout | Versorgung, Verdrahtung, Slave-ID, serielle Parameter, Funktion und Registeradresse; bei Bedarf Timeout erhöhen. |
| Modbus-Ausnahme 1 | Unterstützt das Gerät die gewählte Funktion? |
| Modbus-Ausnahme 2 | Registeradresse, Adressbasis, Offset und benötigte Registeranzahl. |
| CRC- oder serielle Lesefehler | Verbindungseinstellungen, Verdrahtung und Störungen am Bus. |
| Bus nicht ruhig | Fremdverkehr, weiteren Master oder Störungen beseitigen; anschließend erneut abfragen oder Bus freigeben. |
| Unplausibler Wert | Datentyp, Byte-Reihenfolge, Faktor, Offset und Bitnummer. |

## Integrierte Hilfe

**Hilfe** oder **F1** öffnet die Anleitung innerhalb der App. Die Navigation wechselt zurück zum Arbeitsbereich. **Esc** schließt weiterhin Dialoge. Die Hilfe funktioniert offline und unterbricht einen laufenden Messlauf nicht.

## Persönliche Einstellungen

Design **Hell / Dunkel / Windows-Einstellung**, Akzentfarbe, Tabellendichte, Namensspaltenbreite, Rohwertanzeige, Registerdetails, letzte Seite und eingeklappte Navigationsgruppen werden gespeichert. Fenstergröße und Position werden beim Schließen übernommen. Bei entferntem Monitor wird das Fenster in den sichtbaren Arbeitsbereich verschoben.

`%APPDATA%\Registerwerk\settings.json` enthält ausschließlich persönliche Einstellungen und bevorzugte Verbindungsparameter. Projektdateien behalten ihr Format. Zuletzt bewusst verwendete Verbindungsparameter gelten beim Start ohne wiederhergestelltes Projekt; ein geladenes Projekt hat Vorrang. Der letzte COM-Port wird als Hinweis gespeichert und muss erneut ausgewählt werden.

Die Einstellungen haben eine Schema-Version und eine letzte gültige Sicherung. Eine beschädigte Datei wird zurückgestellt; eine gültige Sicherung oder Standardwerte ermöglichen den Start. **Darstellung zurücksetzen** setzt nur die Optik und Navigation zurück, nicht Projekte oder Kommunikationsparameter.

## Versionsupdates und Installation

Die installierte App kann beim Start GitHub Releases prüfen; diese Option ist abschaltbar. **Update verfügbar** erscheint dauerhaft hervorgehoben. Es gibt keinen automatischen Download oder Neustart. Vor einer Installation müssen Verbindungen und Vorgänge beendet sowie TX-Änderungen exportiert werden.

Integrierte Updates laden den Installer nach ausdrücklicher Auswahl von GitHub. Der SHA512-Abgleich prüft die Datei gegen die Update-Metadaten auf Übertragungsfehler, bestätigt aber nicht die Herausgeberidentität. Das Setup ist unsigniert. Ein manuelles Offline-Update ist mit einem geprüften Setup möglich. Der Wechsel von Portable zu 0.2.0 erfolgt einmal über Setup; eigene Projekte vorher exportieren.

**Bauen:** Node 24 installieren, `npm ci`, `npm test`, `npm run smoke`, anschließend unter Windows `npm run build:win`. Das erzeugt einen unsignierten NSIS-Installer. Hinweise zu Releases siehe [UPDATE-VEROEFFENTLICHEN.md](UPDATE-VEROEFFENTLICHEN.md).

Nach einem Upload auf den Hauptbranch baut GitHub die App und erstellt bei Erfolg einen Release-Entwurf. Alternativ unter **Actions → Windows-App bauen → Run workflow** einen Testlauf starten. Im Lauf unter **Artifacts → Registerwerk-Windows-x64** herunterladen, ZIP entpacken und `Registerwerk-Setup-0.2.4-x64.exe` ausführen. Der aktuelle Workflow baut unsigniert. Startmenü und Desktopverknüpfung werden eingerichtet. Die Desktopverknüpfung kann im Installer abgewählt werden. Persönliche Daten werden bei Deinstallation nicht gelöscht.

## Sicherheits- und Teststatus

Keine Telemetrie, keine automatischen Geräteverbindungen, keine IP-Netzscans und keine eingehenden Serverdienste. Modbus TCP selbst bleibt unverschlüsselt und ohne Authentifizierung; segmentierte, freigegebene Automationsnetze verwenden.

Der konkrete Prüfumfang und verbleibende Grenzen stehen in [docs/PRUEFBERICHT-0.2.0.md](docs/PRUEFBERICHT-0.2.0.md), die Funktionsinventur in [docs/UMBAU-0.2.0.md](docs/UMBAU-0.2.0.md). Simulationen ersetzen keine Prüfung mit dem eigenen Adapter, Waveshare und Endgerät. Windows-Installation, Signaturprüfung mit echtem Zertifikat, Upgrade und Deinstallation sind vor einer Produktionsfreigabe noch praktisch zu prüfen.

## Quellstruktur

- `source/Registerwerk.html`: bestehende Fachlogik und Ansichten; Kommunikation und IOOPT bleiben weitgehend unverändert.
- `source/shell.js`, `source/shell.css`: Desktop-Navigation, Gestaltung und Personalisierung.
- `desktop/main.cjs`: isoliertes Electron-Fenster, TCP und freigegebene IPC-Schnittstellen.
- `desktop/settings.cjs`, `desktop/signature.cjs`, `desktop/updater.cjs`: Einstellungen, Authenticode und Updates.
- `scripts/sync-html.cjs`: erzeugt `renderer/index.html`, `app.js`, `app.css`, `shell.js`, `shell.css`. Änderungen in diesen generierten Dateien werden überschrieben.
- `renderer/desktop-ui.js`, `desktop.css`: COM- und Update-Dialoge.
- `test/`, `scripts/*smoke*.cjs`: automatisierte Prüfungen.

`npm start` bereitet den Renderer vor und startet die Desktop-App. Das alleinige Öffnen der HTML-Quelldatei zeigt weiterhin die ältere Browseransicht, nicht die neue Windows-Shell. Es werden keine externen Fonts, Skripte oder Designbibliotheken nachgeladen.
