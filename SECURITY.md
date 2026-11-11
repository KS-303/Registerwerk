# Hinweise zur sicheren Nutzung

- Modbus TCP und Ethernet-RTU sind nicht verschlüsselt oder authentifiziert. Nur in freigegebenen Netzen und an Geräten verwenden, für die du berechtigt bist.
- **Nur-Lesen** ist standardmäßig aktiv und erlaubt nur FC 01–04. Netzwerkbefehle werden zusätzlich im Hauptprozess geprüft. Web Serial bleibt eine Renderer-Berechtigung; dies ist kein hardwareseitiger Schreibschutz.
- Schreibbefehle werden nicht automatisch wiederholt. Nach einem Timeout kann ein Befehl trotzdem ausgeführt worden sein. Vor einem neuen Versuch den Anlagenzustand prüfen.
- RTU-Antworten besitzen keine Transaktions-ID. CRC, passende Geräte-/Funktions-/Längenprüfung und Ruhephasen verringern Fehlzuordnungen, schließen sehr späte gleichartige Antworten aber nicht vollständig aus.
- Die gepackte Windows-App deaktiviert zusätzliche Node-Start- und Debug-Optionen und prüft ihr ASAR-Archiv. Das reduziert Angriffswege, schützt aber nicht vor dem Austausch der gesamten unsignierten Anwendung.
- Windows-App und Installer sind **unsigniert**. Windows kann warnen. Updates nur aus den [offiziellen Releases](https://github.com/KS-303/Registerwerk/releases) beziehen.
- Die Update-Prüfsumme erkennt Abweichungen von den Release-Metadaten, bestätigt aber keine unabhängig geprüfte Herausgeberidentität. Download und Installation erfordern getrennte Zustimmung.
- Projekt-JSON und IOOPT können Geräteinformationen, IP-Adressen oder Projektnamen enthalten. Vor dem Weitergeben prüfen. Lokale Sitzungen bleiben bei Deinstallation erhalten.

Keine Telemetrie und keine automatische Geräteverbindung. Für Bedienung und Fehlerdiagnose siehe [README.md](README.md) und die integrierte Hilfe.
