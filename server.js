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
            videoCallParticipants: [], // Tracking für Video Call Teilnehmer
            categories: [
                'Marvel Rivals Helden',
                'Fähigkeiten & Ultimates', 
                'Maps & Modi',
                'Teams & Strategien',
                'Game Mechanics'
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
    
    // Video Call Events mit Tracking
    socket.on('player-joined-call', (data) => {
        const { lobbyCode, playerName, playerId } = data;
        const lobby = lobbies.get(lobbyCode);
        
        if (lobby) {
            const participantId = playerId || socket.id;
            
            // Participant hinzufügen wenn noch nicht vorhanden
            if (!lobby.videoCallParticipants.some(p => p.id === participantId)) {
                lobby.videoCallParticipants.push({
                    id: participantId,
                    name: playerName,
                    socketId: socket.id
                });
            }
            
            console.log(`${playerName} ist dem Video Call in Lobby ${lobbyCode} beigetreten (${lobby.videoCallParticipants.length} Teilnehmer)`);
            
            // Status an alle senden
            io.to(lobbyCode).emit('video-call-status-update', {
                participantCount: lobby.videoCallParticipants.length,
                participants: lobby.videoCallParticipants
            });
            
            // Beitritt an andere melden mit vollständiger Participant-Liste
            socket.to(lobbyCode).emit('player-joined-call-notification', { 
                playerName, 
                playerId: participantId,
                allParticipants: lobby.videoCallParticipants
            });
            
            // Video-Slots für alle aktualisieren
            io.to(lobbyCode).emit('refresh-video-slots', {
                participants: lobby.videoCallParticipants,
                triggerBy: playerName
            });
        }
    });
    
    // Event für Participant-Anfrage
    socket.on('request-video-participants', (data) => {
        const { lobbyCode } = data;
        const lobby = lobbies.get(lobbyCode);
        
        if (lobby) {
            socket.emit('video-participants-response', {
                participants: lobby.videoCallParticipants,
                participantCount: lobby.videoCallParticipants.length
            });
        }
    });
    
    // Force Connect All - für Debugging/Reparatur
    socket.on('force-connect-all-participants', (data) => {
        const { lobbyCode, mySocketId } = data;
        const lobby = lobbies.get(lobbyCode);
        
        if (lobby) {
            console.log(`🔧 Force Connect All für ${mySocketId} in Lobby ${lobbyCode}`);
            console.log(`📊 Verfügbare Participants:`, lobby.videoCallParticipants.map(p => `${p.name} (${p.id})`));
            
            // Sende komplette Participant-Liste zurück
            socket.emit('force-connect-response', {
                allParticipants: lobby.videoCallParticipants,
                yourSocketId: mySocketId
            });
            
            // Benachrichtige alle anderen, dass jemand force connect macht  
            socket.to(lobbyCode).emit('someone-force-connecting', {
                requesterName: lobby.videoCallParticipants.find(p => p.socketId === socket.id)?.name || 'Unbekannt',
                requesterId: mySocketId
            });
        }
    });
    
    socket.on('player-left-call', (data) => {
        const { lobbyCode, playerName, playerId } = data;
        const lobby = lobbies.get(lobbyCode);
        
        if (lobby) {
            const participantId = playerId || socket.id;
            
            // Participant entfernen
            lobby.videoCallParticipants = lobby.videoCallParticipants.filter(p => p.id !== participantId);
            
            console.log(`${playerName} hat den Video Call in Lobby ${lobbyCode} verlassen (${lobby.videoCallParticipants.length} Teilnehmer)`);
            
            // Status an alle senden
            io.to(lobbyCode).emit('video-call-status-update', {
                participantCount: lobby.videoCallParticipants.length,
                participants: lobby.videoCallParticipants
            });
            
            // Austritt an andere melden
            socket.to(lobbyCode).emit('player-left-call-notification', { 
                playerName, 
                playerId: participantId 
            });
        }
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
                
                // Aus Video Call entfernen
                const videoParticipantIndex = lobby.videoCallParticipants.findIndex(p => p.socketId === socket.id);
                if (videoParticipantIndex !== -1) {
                    const removedParticipant = lobby.videoCallParticipants.splice(videoParticipantIndex, 1)[0];
                    console.log(`${removedParticipant.name} hat den Video Call verlassen`);
                    
                    // Video-Slots für alle aktualisieren
                    io.to(lobbyCode).emit('refresh-video-slots', {
                        participants: lobby.videoCallParticipants,
                        triggerBy: `${removedParticipant.name} (left)`
                    });
                    
                    // Status aktualisieren
                    io.to(lobbyCode).emit('video-call-status-update', {
                        participantCount: lobby.videoCallParticipants.length,
                        participants: lobby.videoCallParticipants
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
    // Marvel Rivals spezifische Fragen - basierend auf dem beliebten Hero Shooter
    const questions = {
        'Marvel Rivals Helden': {
            100: 'Welcher Held kann Netze schießen und an Wänden laufen?',
            200: 'Welcher Charakter trägt einen Schild und kann ihn werfen?',
            300: 'Welcher Held kann sich in Eis verwandeln und Eiswände bauen?',
            400: 'Welcher Magier kann Portale öffnen und die Realität verbiegen?',
            500: 'Welcher Charakter kann zwischen Normal- und Hulk-Form wechseln?'
        },
        'Fähigkeiten & Ultimates': {
            100: 'Was passiert wenn Spider-Man sein Ultimate aktiviert?',
            200: 'Welche Fähigkeit hat Iron Mans Repulsor-Strahl?',
            300: 'Was bewirkt Storms Ultimate "Lightning Storm"?',
            400: 'Welche Heilfähigkeit hat Rocket Raccoon?',
            500: 'Was ist das mächtigste Ultimate von Doctor Strange?'
        },
        'Maps & Modi': {
            100: 'Wie heißt der Hauptspielmodus in Marvel Rivals?',
            200: 'Auf welcher bekannten Marvel-Location basiert eine der Maps?',
            300: 'Wie viele Capture Points gibt es normalerweise pro Map?',
            400: 'Welche Map spielt in New York City?',
            500: 'Auf welcher kosmischen Location kämpft man in Marvel Rivals?'
        },
        'Teams & Strategien': {
            100: 'Aus wie vielen Spielern besteht ein Team?',
            200: 'Welche Rolle ist am besten zum Heilen geeignet?',
            300: 'Welcher Held eignet sich am besten als Tank?',
            400: 'Was ist eine effektive Counter-Strategie gegen fliegende Helden?',
            500: 'Welche Team-Combo aus Tank, DPS und Support ist am stärksten?'
        },
        'Game Mechanics': {
            100: 'Wie regeneriert man Gesundheit in Marvel Rivals?',
            200: 'Was passiert wenn man aus der Map fällt?',
            300: 'Wie lädt sich die Ultimate-Fähigkeit auf?',
            400: 'Was ist der Unterschied zwischen Schild und Rüstung?',
            500: 'Wie funktioniert das Respawn-System in Marvel Rivals?'
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