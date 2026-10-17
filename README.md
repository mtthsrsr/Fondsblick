# Fondsblick

Deutschsprachige Desktop-App zur Analyse von Fonds, ETFs und Portfolios. Lokal gespeicherte Bestände, Produktsuche per ISIN, Quellenlinks und Aufschlüsselung nach Ländern und Einzelanlagen.

Fondsblick konzentriert sich auf Produkt- und Portfolioanalysen. Gespeicherte Produkte lassen sich löschen und die letzte Löschung während der Sitzung rückgängig machen.

## Herunterladen

Öffne **[Releases](https://github.com/mtthsrsr/Fondsblick/releases)** und wähle unter **Assets**:

| Gerät | Datei |
| --- | --- |
| Windows-PC mit Intel/AMD | `win-x64.exe` |
| Windows-PC mit ARM-Prozessor | `win-arm64.exe` |
| Mac mit Apple-Chip (M1/M2/M3/M4 usw.) | `mac-arm64.dmg` |
| Mac mit Intel-Prozessor | `mac-x64.dmg` |

Die Dateien beginnen zusätzlich mit dem App-Namen und der Versionsnummer. Die automatisch angebotenen „Source code“-Archive sind für Entwickler, keine Installer.

Windows: Installer starten. macOS: DMG öffnen und die App in Programme ziehen. Benötigt ein vom mitgelieferten Electron 43 unterstütztes 64-Bit-Betriebssystem. Windows 7/8 und alte macOS-Versionen werden nicht unterstützt.

**Erste öffentliche Vorabversion:** Die Pakete haben keine kommerzielle Windows-Signatur und keine Apple-Notarisierung. Betriebssysteme können deshalb beim ersten Öffnen warnen oder die Ausführung blockieren. Sicherheitsfunktionen nicht pauschal deaktivieren. Die Pakete werden automatisch gebaut; ein vollständiger manueller Test auf allen Zielgeräten steht noch aus. Fehler bitte über Issues melden.

## Funktionen und Grenzen

- Produktsuche und Anbieterinformationen mit überprüfbaren Quellenlinks.
- Gewichtung des Portfolios nach manuell gepflegten EUR-Marktwerten bzw. Stückzahl × EUR-Kurs.
- Unbekannte Anteile bleiben unbekannt; Top-10-Daten sind keine vollständige Bestandsliste.
- Zertifikate werden nicht fälschlich als direkte Fonds- oder Aktienbestände behandelt.
- Eigene Angaben sowie CSV-/Excel-Bestandslisten können ergänzt werden.
- Anbieter können Formate ändern oder Anfragen blockieren. Datenstände immer prüfen.
- Keine garantierten Echtzeitkurse, keine automatische Bankanbindung und keine Anlageberatung.

Persönliche Portfolios sind nicht enthalten. Die App speichert lokal im Benutzer-Appdatenverzeichnis unter `Fondsblick`. ISIN-Anfragen gehen an die jeweiligen Datenanbieter. JSON-Sicherungen können persönliche Finanzdaten enthalten: nicht in öffentliche Issues hochladen.

## Selbst bauen

Node.js 22 und npm installieren, dann im Projektordner:

```sh
npm ci
npm run typecheck
npm test
npm start
```

Installer auf dem jeweiligen Betriebssystem bauen:

```sh
npm run dist
```

GitHub Actions baut die vier Zielplattformen bei Versions-Tags (`v…`). Erst wenn alle Builds erfolgreich waren, wird ein öffentliches Pre-Release mit Installern und SHA-256-Prüfsummen angelegt. Ein manueller Workflow-Lauf erzeugt lediglich Actions-Artefakte.

## Lizenz und Datenquellen

Eigener Anwendungscode: MIT, siehe LICENSE. Fremdbibliotheken behalten ihre jeweiligen Lizenzen. SheetJS 0.20.3 liegt als offizielles Paket in `vendor/`; seine Apache-2.0-Lizenz ist im Paket enthalten. Anbieter-Webseiten und komplette heruntergeladene Bestandslisten sind nicht Bestandteil der Testdaten. Tests verwenden synthetische Beispiele. Produktnamen und öffentlich bezogene Marktdaten bleiben ihren jeweiligen Rechteinhabern zugeordnet.
