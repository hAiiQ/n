const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();

// Force HTTPS on Render.com (außer localhost)
app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https' && process.env.NODE_ENV === 'production') {
        res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
        next();
    }
});

// Security Headers für Webcam-Zugriff
app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=*, microphone=*');
    res.setHeader('Feature-Policy', 'camera *; microphone *');
    next();
});

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, 'public')));

// Spielzustand
let lobbies = new Map();

// Socket.io Verbindungslogik
io.on('connection', (socket) => {
    console.log('Neuer Benutzer verbunden:', socket.id);
    
    // Lobby erstellen
    socket.on('create-lobby', (data) => {
        const lobbyCode = generateLobbyCode();
        const lobby = {
            id: lobbyCode,
            admin: socket.id,
            adminName: data.adminName,
            players: [],
            gameState: 'waiting', // waiting, playing, finished
            currentRound: 1,
            currentPlayer: 0,
            scores: {},
            answeredQuestions: [],
            categories: [
                'Marvel Helden',
                'DC Comics', 
                'Superhelden-Filme',
                'Comic Geschichte',
                'Superkräfte'
            ]
        };
        
        lobbies.set(lobbyCode, lobby);
        socket.join(lobbyCode);
        
        socket.emit('lobby-created', { lobbyCode, lobby });
        console.log(`Lobby ${lobbyCode} erstellt von ${data.adminName}`);
    });
    
    // Lobby beitreten
    socket.on('join-lobby', (data) => {
        const { lobbyCode, playerName } = data;
        const lobby = lobbies.get(lobbyCode);
        
        if (!lobby) {
            socket.emit('error', 'Lobby nicht gefunden');
            return;
        }
        
        if (lobby.players.length >= 4) {
            socket.emit('error', 'Lobby ist voll');
            return;
        }
        
        const player = {
            id: socket.id,
            name: playerName,
            score: 0
        };
        
        lobby.players.push(player);
        lobby.scores[socket.id] = 0;
        socket.join(lobbyCode);
        
        // Bestätigung an den Spieler senden
        socket.emit('joined-lobby-success', { lobby, lobbyCode });
        
        // Anderen Spielern mitteilen
        socket.to(lobbyCode).emit('player-joined', { lobby, newPlayer: player });
        console.log(`${playerName} ist Lobby ${lobbyCode} beigetreten`);
    });
    
    // Spiel starten
    socket.on('start-game', (lobbyCode) => {
        const lobby = lobbies.get(lobbyCode);
        if (lobby && lobby.admin === socket.id && lobby.players.length >= 1) {
            lobby.gameState = 'playing';
            io.to(lobbyCode).emit('game-started', lobby);
            console.log(`Spiel in Lobby ${lobbyCode} gestartet`);
        }
    });
    
    // Frage auswählen
    socket.on('select-question', (data) => {
        const { lobbyCode, category, points } = data;
        const lobby = lobbies.get(lobbyCode);
        
        if (lobby && lobby.admin === socket.id) {
            const questionKey = `${category}-${points}`;
            if (!lobby.answeredQuestions.includes(questionKey)) {
                lobby.answeredQuestions.push(questionKey);
                
                const question = getQuestion(category, points, lobby.currentRound);
                io.to(lobbyCode).emit('question-selected', { 
                    question, 
                    category, 
                    points,
                    currentPlayer: lobby.players[lobby.currentPlayer] 
                });
            }
        }
    });
    
    // Antwort bewerten
    socket.on('answer-result', (data) => {
        const { lobbyCode, correct, points, playerId } = data;
        const lobby = lobbies.get(lobbyCode);
        
        if (lobby && lobby.admin === socket.id) {
            if (correct) {
                lobby.scores[playerId] += points;
            } else {
                lobby.scores[playerId] -= Math.floor(points / 2);
            }
            
            // Nächster Spieler
            lobby.currentPlayer = (lobby.currentPlayer + 1) % lobby.players.length;
            
            // Prüfen ob Runde beendet
            const totalQuestions = lobby.categories.length * 5;
            if (lobby.answeredQuestions.length >= totalQuestions && lobby.currentRound === 1) {
                lobby.currentRound = 2;
                lobby.answeredQuestions = [];
                lobby.currentPlayer = 0;
                io.to(lobbyCode).emit('round-end', { lobby, nextRound: 2 });
            } else if (lobby.answeredQuestions.length >= totalQuestions && lobby.currentRound === 2) {
                lobby.gameState = 'finished';
                io.to(lobbyCode).emit('game-end', { lobby, finalScores: lobby.scores });
            }
            
            io.to(lobbyCode).emit('answer-processed', { 
                lobby, 
                scores: lobby.scores,
                currentPlayer: lobby.players[lobby.currentPlayer]
            });
        }
    });
    
    // Video Call Events
    socket.on('player-joined-call', (data) => {
        const { lobbyCode, playerName, playerId } = data;
        socket.to(lobbyCode).emit('player-joined-call-notification', { 
            playerName, 
            playerId: playerId || socket.id 
        });
        console.log(`${playerName} ist dem Video Call in Lobby ${lobbyCode} beigetreten`);
    });
    
    socket.on('player-left-call', (data) => {
        const { lobbyCode, playerName, playerId } = data;
        socket.to(lobbyCode).emit('player-left-call-notification', { 
            playerName, 
            playerId: playerId || socket.id 
        });
        console.log(`${playerName} hat den Video Call in Lobby ${lobbyCode} verlassen`);
    });
    
    // WebRTC Signaling - Korrigierte Parameter-Behandlung
    socket.on('webrtc-offer', (data) => {
        const { to, offer, lobbyCode } = data;
        
        // Validierung
        if (!to || !offer) {
            console.error('Invalid offer data:', data);
            return;
        }
        
        socket.to(to).emit('webrtc-offer', {
            from: socket.id,
            offer: offer,
            lobbyCode: lobbyCode
        });
        
        console.log(`📤 WebRTC Offer: ${socket.id} → ${to}`);
    });
    
    socket.on('webrtc-answer', (data) => {
        const { to, answer, lobbyCode } = data;
        
        // Validierung
        if (!to || !answer) {
            console.error('Invalid answer data:', data);
            return;
        }
        
        socket.to(to).emit('webrtc-answer', {
            from: socket.id,
            answer: answer,
            lobbyCode: lobbyCode
        });
        
        console.log(`📤 WebRTC Answer: ${socket.id} → ${to}`);
    });
    
    socket.on('ice-candidate', (data) => {
        const { to, candidate, lobbyCode } = data;
        
        // Validierung
        if (!to || !candidate) {
            console.error('Invalid ICE candidate data:', data);
            return;
        }
        
        socket.to(to).emit('ice-candidate', {
            from: socket.id,
            candidate: candidate,
            lobbyCode: lobbyCode
        });
        
        console.log(`🧊 ICE Candidate: ${socket.id} → ${to}`);
    });
    
    // Verbindung getrennt
    socket.on('disconnect', () => {
        console.log('Benutzer getrennt:', socket.id);
        
        // Spieler aus Lobbies entfernen
        lobbies.forEach((lobby, lobbyCode) => {
            if (lobby.admin === socket.id) {
                // Admin hat verlassen - Lobby schließen
                io.to(lobbyCode).emit('lobby-closed', 'Admin hat die Lobby verlassen');
                lobbies.delete(lobbyCode);
            } else {
                // Spieler entfernen
                const playerIndex = lobby.players.findIndex(p => p.id === socket.id);
                if (playerIndex !== -1) {
                    const removedPlayer = lobby.players.splice(playerIndex, 1)[0];
                    delete lobby.scores[socket.id];
                    
                    // Aktuellen Spieler anpassen
                    if (lobby.currentPlayer >= lobby.players.length && lobby.players.length > 0) {
                        lobby.currentPlayer = 0;
                    }
                    
                    io.to(lobbyCode).emit('player-left', { 
                        lobby, 
                        removedPlayer: removedPlayer.name 
                    });
                }
            }
        });
    });
});

// Hilfsfunktionen
function generateLobbyCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getQuestion(category, points, round) {
    // Vereinfachte Fragen - in der Praxis würde man eine richtige Datenbank verwenden
    const questions = {
        'Marvel Helden': {
            100: 'Wie heißt der echte Name von Spider-Man?',
            200: 'Welche Farben hat Captain Americas Schild?',
            300: 'Aus welchem Metall bestehen Wolverines Klauen?',
            400: 'Wie heißt Thors Hammer?',
            500: 'Welche Superkraft hat Professor X?'
        },
        'DC Comics': {
            100: 'Wie heißt Supermans Heimatplanet?',
            200: 'In welcher Stadt lebt Batman?',
            300: 'Wie heißt Wonder Womans Lasso?',
            400: 'Welche Farbe hat Green Lanterns Ring?',
            500: 'Wie heißt The Flash mit echtem Namen?'
        },
        'Superhelden-Filme': {
            100: 'Wer spielte Iron Man in den Marvel-Filmen?',
            200: 'Wie viele Infinity Stones gibt es?',
            300: 'In welchem Jahr kam der erste Iron Man Film raus?',
            400: 'Wie heißt der Bösewicht im ersten Avengers Film?',
            500: 'Welcher Schauspieler spielte Batman in The Dark Knight?'
        },
        'Comic Geschichte': {
            100: 'In welchem Jahr wurde Superman erschaffen?',
            200: 'Wer schuf Spider-Man?',
            300: 'Welcher Verlag veröffentlichte die ersten X-Men Comics?',
            400: 'In welchem Jahrzehnt wurden die meisten bekannten Superhelden erschaffen?',
            500: 'Wie hieß das erste Comic mit Batman?'
        },
        'Superkräfte': {
            100: 'Welche Superkraft hat Superman nicht: Fliegen, Röntgenblick, Telepathie?',
            200: 'Was ist Hulks größte Schwäche?',
            300: 'Welches Element ist Supermans Schwäche?',
            400: 'Welche Superkraft haben sowohl Quicksilver als auch The Flash?',
            500: 'Welche Farbe hat die Energie von Scarlet Witch?'
        }
    };
    
    const basePoints = round === 1 ? points : points / 2;
    return questions[category] && questions[category][basePoints] ? 
           questions[category][basePoints] : 'Beispielfrage für ' + category;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});