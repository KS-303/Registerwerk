# Erweiterungen der Bedienung

- In den Einstellungen stehen weitere Akzentfarben und drei Startverhalten zur Auswahl. Der Schalter oberhalb der Seitenleiste klappt sie auf Symbole zusammen; der Name erscheint als Tooltip.
- Die Startauswahl zeigt bis zu fünf lokale Arbeitsstände und eine neue Sitzung. Projekte, Register und Verbindungsparameter werden lokal gesichert, jedoch keine Verbindung und kein Messlauf automatisch gestartet. Unter Projekte können Stände gesichert, umbenannt und gelöscht werden. Bei mehr als fünf Ständen werden ältere automatisch entfernt. Auch beim Beenden wird gespeichert, sofern die Eingaben gültig sind und der lokale Speicher verfügbar ist. Für dauerhafte Sicherung Projekte exportieren.
- Suche und Filter ändern nur die Anzeige. Die Auswahl für Mehrfachaktionen steht rechts in jeder Zeile. Änderungen an Geräteadresse und Funktion erfordern die Trennung der Verbindung und eine Bestätigung. Das Duplizieren legt einen eigenen Datenpunkt an.
- Unter dem Messwert steht die Uhrzeit der letzten gültigen Messung; der Tooltip zeigt das vollständige Datum. Nach einem Fehler bleibt der letzte gültige Wert als veraltet markiert stehen.
- Der Trend trennt analoge und digitale Datenpunkte. Digitale Signale haben eigene Zeilen; der Zeitraum und die sichtbaren Kurven sind wählbar. Trend und Statistik sind flüchtig und werden nicht in Sitzungen gesichert.
- Die kurze Einführung kann über die Hilfe erneut aufgerufen werden.

## Prüfstand

24 Node-Tests und Electron-Smoke-Tests mit simulierten TCP- und Ethernet-RTU-Geräten, IOOPT-Export und Wiederherstellung bestanden. Neue Prüfungen decken Suche, Mehrfachaktion, Duplizieren, Akzent, Seitenleiste und Sitzungsauswahl nach Neuladen ab. Ein Windows-Installer, reale RS485-Geräte, das Siemens TX Open Tool und signierte Updates wurden für diesen Stand nicht erneut getestet.

Die Paketversion ist 0.2.1. Für die Updateerkennung muss ein passender Release mit dem Tag v0.2.1 bereitgestellt werden; die vorhandene Vertrauenskonfiguration für den Update-Download bleibt Voraussetzung.
