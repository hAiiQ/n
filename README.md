# Superhelden Jeopardy

Ein modernes Jeopardy-Spiel für 4 Spieler mit Webcam-Support, inspiriert vom Marvel Rivals Design.

## Features

- **Lobby-System**: Ein Admin erstellt eine Lobby, 4 Spieler können beitreten
- **Echtzeitspiel**: Socket.io für sofortige Synchronisation aller Spieler
- **Webcam-Integration**: Automatische Kamera-Aktivierung beim Spielstart
- **Voice Chat**: Spiel funktioniert mit Discord Voice Chat
- **Marvel-Design**: Modernes UI inspiriert von Marvel Rivals
- **Responsive**: Funktioniert auf Desktop und Mobile

## Spielregeln

- 5 Kategorien mit je 5 Fragen
- 2 Runden:
  - Runde 1: 100, 200, 300, 400, 500 Punkte
  - Runde 2: 200, 400, 600, 800, 1000 Punkte
- Falsche Antwort = -50% der Punkte
- Admin wählt Fragen aus und bewertet Antworten
- Spieler kommunizieren über Voice Chat

## Installation und Start

### Lokal entwickeln

```bash
# Dependencies installieren
npm install

# Server starten
npm run dev
```

Der Server läuft dann auf `http://localhost:3000`

### Für Produktion

```bash
npm start
```

## Deployment auf Render

1. Repository auf GitHub pushen
2. Neuen Web Service auf Render.com erstellen
3. GitHub Repository verknüpfen
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Auto-Deploy aktivieren

## Technologie-Stack

- **Backend**: Node.js + Express + Socket.io
- **Frontend**: Vanilla JavaScript + HTML5 + CSS3
- **Webcam**: WebRTC für Peer-to-Peer Verbindungen
- **Deployment**: Render.com
- **Design**: Marvel Rivals inspiriertes UI

## Ordnerstruktur

```
jeopardy-game/
├── server.js          # Express Server mit Socket.io
├── package.json       # Abhängigkeiten und Skripte
├── README.md          # Diese Datei
└── public/           # Frontend Dateien
    ├── index.html    # Haupt-HTML
    ├── styles.css    # Marvel-inspirierte Styles
    └── app.js        # Frontend JavaScript
```

## Browser-Anforderungen

- Moderne Browser mit WebRTC Support
- Kamera-Berechtigung erforderlich
- Mikrofon-Berechtigung empfohlen (für Voice Chat)

## Kategorien und Fragen

Das Spiel kommt mit 5 vorgefertigten Superhelden-Kategorien:

1. **Marvel Helden** - Spider-Man, Captain America, etc.
2. **DC Comics** - Superman, Batman, etc.
3. **Superhelden-Filme** - MCU, DC Movies, etc.
4. **Comic Geschichte** - Entstehung der Comics
5. **Superkräfte** - Fähigkeiten der Helden

Fragen können einfach im `server.js` angepasst werden.

## Lizenz

MIT License - Freie Nutzung und Anpassung erlaubt.