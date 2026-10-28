# Registerwerk

Registerwerk ist ein Modbus-RTU-Prüf- und Auslesewerkzeug für Windows. Es liest Datenpunkte über einen seriellen RS485-Adapter, zeigt Messwerte und Rohdaten an und ermöglicht gezielte Schreibbefehle. Die App arbeitet offline. Eine Hilfe ist direkt integriert.

## Schnellstart

1. USB-RS485-Adapter anschließen.
2. Über **Projekt öffnen** eine Registerwerk-JSON laden oder **Datenpunkt hinzufügen** wählen.
3. Geräteadresse und Verbindungseinstellungen mit dem angeschlossenen Gerät abgleichen.
4. **Port auswählen und verbinden** anklicken, den passenden COM-Port auswählen und verbinden.
5. Mit **Einmal abfragen** prüfen, ob die Werte stimmen. Anschließend bei Bedarf **Messlauf starten** wählen.
6. Die Konfiguration über **Projekt exportieren** sichern.

## Verbindung einstellen

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

## Datenpunkte anlegen und bearbeiten

Jede Tabellenzeile beschreibt einen Datenpunkt.

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

Der Scan sendet echte Leseanfragen. Eine gültige Antwort oder Modbus-Ausnahme zählt als Reaktion. Ein stilles Gerät kann trotzdem vorhanden sein, wenn es auf die gewählte Funktion oder Prüfadresse nicht antwortet.

- Die Prüfadresse ist immer **0-basiert**.
- Aus einem erfolgreichen Ergebnis lässt sich ein Datenpunkt anlegen.
- Mit anderen Einstellungen kann der Scan wiederholt werden.
- **Scan abbrechen** beendet den laufenden Scan.

## Registerbereich lesen

Liest **1 bis 125 zusammenhängende Register** mit FC 03 oder FC 04. Geräteadresse, Startadresse und Registeranzahl festlegen.

Die eingestellte Adressbasis und der Registeroffset werden angewendet. Die Ergebnistabelle zeigt Eingabeadresse, Protokolladresse sowie Hexadezimal-, Dezimal- und Binärwerte.

## Schreibbefehle

Über **Schreibbefehl** Geräteadresse, Funktion, Startadresse, Format und Werte eingeben. Vor dem Senden zeigt eine Bestätigung die eingegebene und umgerechnete Adresse, das Format, die Klartextwerte und die Anzahl der Register beziehungsweise Coils.

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

**Projekt öffnen** lädt eine Registerwerk-JSON und ersetzt die aktuelle Liste sowie die Einstellungen. Dafür muss die Verbindung getrennt sein. Der Import unterstützt bis zu **500 Datenpunkte**.

**Projekt exportieren** speichert Datenpunktkonfiguration, Verbindungseinstellungen, Adressbasis, Registeroffset und die Optionen für gemeinsame Geräteadressen und Fehlerbehandlung. Optional können Gerätebezeichnung und Hinweise hinterlegt werden. COM-Port-Freigaben werden nicht übertragen.

Zusätzlich sichert die App Änderungen lokal und stellt eine Sitzung beim nächsten Start nach Möglichkeit wieder her. Es bleiben höchstens fünf Sitzungssicherungen erhalten. Auch die portable Windows-Version speichert auf dem jeweiligen Rechner unter `%APPDATA%\Registerwerk`.

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

**Hilfe** oder **F1** öffnet die Anleitung innerhalb der App. **Esc** schließt sie. Die Hilfe funktioniert offline und unterbricht einen laufenden Messlauf nicht.

## Windows-Version bauen

Im GitHub-Repository unter **Actions → Windows-App bauen → Run workflow** starten. Nach erfolgreichem Build das Paket **Registerwerk-Windows-x64** unter **Artifacts** herunterladen. Es enthält die portable EXE und den Installer.

Die portable EXE startet ohne Installation; der Installer richtet die App mit Verknüpfungen ein. Ein erfolgreicher Build ersetzt keinen Feldtest mit dem eigenen Adapter und Gerät.
