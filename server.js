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
        console.log('Create-lobby data:', data);
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
            recentlyAnswered: [], // Temporär deaktivierte Fragen
            videoCallParticipants: [], // Tracking für Video Call Teilnehmer
            categories: [
                'Rund um Marvel',
                'Team-Ups', 
                'Game-Mechanics',
                'Voice-Lines',
                'Wo ist das?'
            ]
        };
        
        lobbies.set(lobbyCode, lobby);
        socket.join(lobbyCode);
        
        socket.emit('lobby-created', { 
            lobbyCode, 
            lobby,
            isAdmin: true 
        });
        
        console.log(`Lobby ${lobbyCode} erstellt von ${data.adminName}`);
    });
    
    // Lobby beitreten
    socket.on('join-lobby', (data) => {
        console.log('Join-lobby data:', data);
        console.log('Verfügbare Lobbies:', Array.from(lobbies.keys()));
        const lobby = lobbies.get(data.lobbyCode);
        
        if (!lobby) {
            socket.emit('error', { message: 'Lobby nicht gefunden' });
            return;
        }
        
        if (lobby.players.length >= 4) {
            console.log('Lobby ist voll - Aktuelle Spieler:', lobby.players.length, lobby.players);
            socket.emit('error', { message: 'Lobby ist voll' });
            return;
        }
        
        const player = {
            id: socket.id,
            name: data.playerName
        };
        
        lobby.players.push(player);
        lobby.scores[socket.id] = 0;
        
        socket.join(data.lobbyCode);
        
        // Dem beitretenden Spieler bestätigen, dass er erfolgreich beigetreten ist
        socket.emit('joined-lobby-success', { 
            lobbyCode: data.lobbyCode,
            lobby,
            isAdmin: socket.id === lobby.admin 
        });
        
        // Allen anderen in der Lobby die aktualisierte Lobby-Info senden
        // Jedem Spieler individuell senden mit korrektem isAdmin Status
        const socketsInRoom = io.sockets.adapter.rooms.get(data.lobbyCode);
        if (socketsInRoom) {
            for (const socketId of socketsInRoom) {
                if (socketId !== socket.id) { // Nicht an den beitretenden Spieler
                    io.to(socketId).emit('lobby-updated', { 
                        lobby,
                        isAdmin: socketId === lobby.admin 
                    });
                }
            }
        }
        
        console.log(`${data.playerName} ist Lobby ${data.lobbyCode} beigetreten`);
    });
    
    // Spiel starten
    socket.on('start-game', (data) => {
        console.log('Start-game event received:', data);
        console.log('Socket ID:', socket.id);
        
        const lobby = lobbies.get(data.lobbyCode);
        console.log('Found lobby:', lobby ? 'yes' : 'no');
        
        if (!lobby) {
            console.log('Lobby not found');
            socket.emit('error', { message: 'Lobby nicht gefunden' });
            return;
        }
        
        console.log('Lobby admin:', lobby.admin);
        console.log('Is admin?', socket.id === lobby.admin);
        
        if (socket.id !== lobby.admin) {
            console.log('Not admin - cannot start game');
            socket.emit('error', { message: 'Nur der Admin kann das Spiel starten' });
            return;
        }
        
        console.log('Number of players:', lobby.players.length);
        
        lobby.gameState = 'playing';
        
        console.log('Emitting game-started event to lobby:', data.lobbyCode);
        io.to(data.lobbyCode).emit('game-started', { lobby });
        
        console.log(`Spiel in Lobby ${data.lobbyCode} gestartet`);
    });
    
    // Frage auswählen
    socket.on('select-question', (data) => {
        const lobby = lobbies.get(data.lobbyCode);
        
        if (!lobby || socket.id !== lobby.admin) {
            return;
        }
        
        const questionKey = `${data.category}-${lobby.currentRound === 1 ? data.points : data.points / 2}`;
        
        // Überprüfung ob Frage bereits beantwortet wurde (für graue Buttons)
        if (lobby.answeredQuestions.includes(questionKey)) {
            console.log(`Question ${questionKey} already answered, ignoring click`);
            return;
        }
        
        const question = getQuestion(data.category, data.points, lobby.currentRound);
        
        io.to(data.lobbyCode).emit('question-selected', {
            category: data.category,
            points: data.points,
            question: question,
            currentPlayer: lobby.players[lobby.currentPlayer]
        });
        
        console.log(`Frage ausgewählt: ${data.category} - ${data.points}`);
    });
    
    // Antwort verarbeiten
    socket.on('process-answer', (data) => {
        console.log('Process answer received:', data);
        const lobby = lobbies.get(data.lobbyCode);
        
        if (!lobby) {
            console.log('Lobby not found for process-answer');
            return;
        }
        
        if (socket.id !== lobby.admin) {
            console.log('Not admin - cannot process answer');
            return;
        }
        
        const questionKey = `${data.category}-${lobby.currentRound === 1 ? data.points : data.points / 2}`;
        console.log('Processing answer for endless game mode');
        
        // Frage permanent deaktivieren
        lobby.answeredQuestions.push(questionKey);
        
        console.log(`Question ${questionKey} permanently disabled (turned gray)`);
        
        if (lobby.players[lobby.currentPlayer]) {
            const playerId = lobby.players[lobby.currentPlayer].id;
            
            if (data.correct) {
                console.log(`Player ${lobby.players[lobby.currentPlayer].name} answered correctly: +${data.points} points`);
                lobby.scores[playerId] += data.points;
            } else {
                console.log(`Player ${lobby.players[lobby.currentPlayer].name} answered incorrectly: -${Math.floor(data.points * 0.5)} points`);
                // Bei falscher Antwort: 50% der Punkte abziehen (negative Scores erlaubt)
                lobby.scores[playerId] -= Math.floor(data.points * 0.5);
            }
            
            console.log(`New score for ${lobby.players[lobby.currentPlayer].name}: ${lobby.scores[playerId]}`);
        }
        
        // Nächster Spieler
        lobby.currentPlayer = (lobby.currentPlayer + 1) % lobby.players.length;
        
        // Prüfen ob alle Fragen der aktuellen Runde beantwortet wurden
        const totalQuestions = lobby.categories.length * 5; // 5 Kategorien * 5 Fragen = 25 Fragen pro Runde
        const questionsPerRound = totalQuestions;
        
        // Zählen der beantworteten Fragen in der aktuellen Runde
        const currentRoundQuestions = lobby.answeredQuestions.filter(q => {
            const expectedPoints = lobby.currentRound === 1 ? 
                [100, 200, 300, 400, 500] : 
                [200, 400, 600, 800, 1000];
            
            return expectedPoints.some(points => {
                const keyPoints = lobby.currentRound === 1 ? points : points / 2;
                return q.includes(`-${keyPoints}`);
            });
        }).length;
        
        console.log(`Round ${lobby.currentRound}: ${currentRoundQuestions}/${questionsPerRound} questions answered`);
        
        if (currentRoundQuestions >= questionsPerRound && lobby.currentRound === 1) {
            // Alle Fragen von Runde 1 beantwortet - Runde 2 starten
            lobby.currentRound = 2;
            lobby.currentPlayer = 0;
            
            // Für Runde 2: answeredQuestions leeren, damit alle Buttons wieder verfügbar sind
            lobby.answeredQuestions = [];
            
            console.log('Starting Round 2! Cleared answered questions for fresh start.');
            
            io.to(data.lobbyCode).emit('round-end', {
                lobby,
                nextRound: 2
            });
        } else {
            // Normale Antwort-Verarbeitung
            io.to(data.lobbyCode).emit('answer-processed', {
                lobby
            });
        }
        
        console.log(`Next player: ${lobby.players[lobby.currentPlayer] ? lobby.players[lobby.currentPlayer].name : 'Unknown'}`);
    });
    
    // Video Call Events
    socket.on('force-connect', (data) => {
        const lobby = lobbies.get(data.lobbyCode);
        if (lobby) {
            if (!lobby.videoCallParticipants) {
                lobby.videoCallParticipants = [];
            }
            
            if (!lobby.videoCallParticipants.includes(socket.id)) {
                lobby.videoCallParticipants.push(socket.id);
            }
            
            socket.to(data.lobbyCode).emit('force-connect', {
                from: socket.id,
                isAdmin: socket.id === lobby.admin,
                playerName: socket.id === lobby.admin ? lobby.adminName : 
                    lobby.players.find(p => p.id === socket.id)?.name || 'Unbekannt'
            });
        }
    });
    
    socket.on('webrtc-offer', (data) => {
        socket.to(data.to).emit('webrtc-offer', {
            from: socket.id,
            offer: data.offer
        });
    });
    
    socket.on('webrtc-answer', (data) => {
        socket.to(data.to).emit('webrtc-answer', {
            from: socket.id,
            answer: data.answer
        });
    });
    
    socket.on('webrtc-ice-candidate', (data) => {
        socket.to(data.to).emit('webrtc-ice-candidate', {
            from: socket.id,
            candidate: data.candidate
        });
    });
    
    // Verbindung getrennt
    socket.on('disconnect', () => {
        console.log('Benutzer getrennt:', socket.id);
        
        // Spieler aus allen Lobbies entfernen
        for (let [lobbyCode, lobby] of lobbies) {
            if (lobby.admin === socket.id) {
                // Admin verlässt - Lobby schließen
                io.to(lobbyCode).emit('lobby-closed');
                lobbies.delete(lobbyCode);
                console.log(`Lobby ${lobbyCode} geschlossen (Admin verlassen)`);
            } else {
                // Spieler entfernen
                const playerIndex = lobby.players.findIndex(p => p.id === socket.id);
                if (playerIndex !== -1) {
                    lobby.players.splice(playerIndex, 1);
                    delete lobby.scores[socket.id];
                    
                    // Video Call Teilnehmer entfernen
                    if (lobby.videoCallParticipants) {
                        const videoIndex = lobby.videoCallParticipants.indexOf(socket.id);
                        if (videoIndex !== -1) {
                            lobby.videoCallParticipants.splice(videoIndex, 1);
                        }
                    }
                    
                    // Aktuellen Spieler-Index anpassen wenn nötig
                    if (lobby.currentPlayer >= lobby.players.length && lobby.players.length > 0) {
                        lobby.currentPlayer = 0;
                    }
                    
                    io.to(lobbyCode).emit('lobby-updated', { lobby });
                    console.log(`Spieler aus Lobby ${lobbyCode} entfernt`);
                }
            }
        }
    });
});

// Hilfsfunktionen
function generateLobbyCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getQuestion(category, points, round) {
    // Marvel Rivals spezifische Fragen - Runde 1: Basis-Fragen, Runde 2: Experten-Fragen
    const questionsRound1 = {
        'Rund um Marvel': {
            100: 'Wie heißt Spider-Man mit richtigem Namen?',
            200: 'Wie heißt der Hammer von Thor?',
            300: 'Wie heißt Captain Americas Schildmaterial?',
            400: 'Welches Doppelleben führt Luna Snow?',
            500: 'Was für ein Gott ist Loki?'
        },
        'Team-Ups': {
            100: 'Wer von den 3 ist am wichtigsten für das Team-Up? Loki, Mantis oder Groot',
            200: 'Mit wem hat Cloak & Dagger ein Team-Up?',
            300: 'Welches Team-Up wurde in Season 2,5 permanent gebannt?',
            400: 'Welches Team-Up war in Season 1 das beste, um Gegner zu flanken und zu 1-Shotten?',
            500: '4 Charaktere bilden ein gemeinsames Team-Up. Welche 4 sind es?'
        },
        'Game-Mechanics': {
            100: 'Wie viele Spieler hat ein Team?',
            200: 'Ab wie vielen Spielern wird der Payload am schnellsten bewegt?',
            300: 'Kann man in den Gegnerischen Spawn/Safezone rein?',
            400: 'Wie hoch ist der Timer bei der Charakterauswahl?',
            500: 'Wie lange dauert es zum respawnen nach einem Tod?'
        },
        'Voice-Lines': {
            100: '"I am ready to ...!"',
            200: '"Behold, the God of ...!"',
            300: '"The ... haunts ...!"',
            400: '"My friends ...!"',
            500: '"Behold: ...!"'
        },
        'Wo ist das?': {
            100: { question: 'Wo ist das?', image: 'Runde1_100.png' },
            200: { question: 'Wo ist das?', image: 'Runde1_200.png' },
            300: { question: 'Wo ist das?', image: 'Runde1_300.png' },
            400: { question: 'Wo ist das?', image: 'Runde1_400.png' },
            500: { question: 'Wo ist das?', image: 'Runde1_500.png' }
        }
    };

    const questionsRound2 = {
        'Rund um Marvel': {
            100: 'Wie heißt Iron Man mit richtigem Namen?',
            200: 'Wer verwandelt sich wenn er sauer wird?',
            300: 'Wie heißt Tony Starks AI System?',
            400: 'Wie heißt die jüngere Tochter von Thanos?',
            500: 'Wie heißt das Raumschiff von den Guardians of the Galaxy?'
        },
        'Team-Ups': {
            100: 'Mit wem hat Thor in Season 4 ein neues Team-Up bekommen?',
            200: 'Was bringt das neue Team-Up für Black Panther mit Hulk & Namor?',
            300: 'Was bringt das neue Team-Up für Star-Lord mit Rocket Raccoon & Peni Parker?',
            400: 'Bei welchem Team-Up war es nicht schlimm, wenn man 1x gestorben ist?',
            500: 'Welches alte Team-Up war von anfang an OP, wurde aber direkt danach generft?'
        },
        'Game-Mechanics': {
            100: 'Welche Map wird am häufigsten in Ranked gespielt?',
            200: 'Wie viele Kontrollpunkte hat eine Escort Map?',
            300: 'Was ist der beste Modus um XP zu farmen?',
            400: 'Welche Map hat die meisten Flanking-Routen?',
            500: 'Auf welcher Map ist die Ultimate-Laderate am schnellsten?'
        },
        'Voice-Lines': {
            100: '"Your ... are mine!"',
            200: '"Plasma ...!"',
            300: '"You are ...!"',
            400: '"We are ...!"',
            500: '"A thousand ...!"'
        },
        'Wo ist das?': {
            100: { question: 'Wo ist das?', image: 'Runde2_100.png' },
            200: { question: 'Wo ist das?', image: 'Runde2_200.png' },
            300: { question: 'Wo ist das?', image: 'Runde2_300.png' },
            400: { question: 'Wo ist das?', image: 'Runde2_400.png' },
            500: { question: 'Wo ist das?', image: 'Runde2_500.png' }
        }
    };
    
    const questions = round === 1 ? questionsRound1 : questionsRound2;
    const basePoints = round === 1 ? points : points / 2;
    
    return questions[category] && questions[category][basePoints] ? 
           questions[category][basePoints] : `Experten-Frage für ${category} - Runde ${round}`;
}

function getWinner(lobby) {
    let maxScore = -1;
    let winner = null;
    
    for (let playerId in lobby.scores) {
        if (lobby.scores[playerId] > maxScore) {
            maxScore = lobby.scores[playerId];
            const player = lobby.players.find(p => p.id === playerId);
            winner = player ? player.name : 'Unbekannt';
        }
    }
    
    return winner;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});