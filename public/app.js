// Socket.io Verbindung
const socket = io();

// Globale Variablen
let isAdmin = false;
let currentLobbyCode = null;
let currentLobby = null;
let currentQuestionData = null;
let jitsiApi = null;
let jitsiRoomName = null;

// DOM Elemente
const screens = {
    start: document.getElementById('start-screen'),
    createLobby: document.getElementById('create-lobby-screen'),
    joinLobby: document.getElementById('join-lobby-screen'),
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-screen'),
    gameEnd: document.getElementById('game-end-screen')
};

// Screen Management
function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenName].classList.add('active');
}

// Notification System
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.getElementById('notifications').appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Event Listeners für Start Screen
document.getElementById('create-lobby-btn').addEventListener('click', () => {
    showScreen('createLobby');
});

document.getElementById('join-lobby-btn').addEventListener('click', () => {
    showScreen('joinLobby');
});

document.getElementById('back-to-start').addEventListener('click', () => {
    showScreen('start');
});

document.getElementById('back-to-start-join').addEventListener('click', () => {
    showScreen('start');
});

// Lobby erstellen
document.getElementById('create-lobby-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const adminName = document.getElementById('admin-name').value.trim();
    
    if (adminName) {
        isAdmin = true;
        socket.emit('create-lobby', { adminName });
    }
});

// Lobby beitreten
document.getElementById('join-lobby-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const playerName = document.getElementById('player-name').value.trim();
    const lobbyCode = document.getElementById('lobby-code').value.trim().toUpperCase();
    
    if (playerName && lobbyCode) {
        isAdmin = false;
        socket.emit('join-lobby', { playerName, lobbyCode });
    }
});

// Spiel starten (nur Admin)
document.getElementById('start-game-btn').addEventListener('click', () => {
    if (isAdmin && currentLobbyCode) {
        socket.emit('start-game', currentLobbyCode);
    }
});

// Lobby verlassen
document.getElementById('leave-lobby-btn').addEventListener('click', () => {
    if (currentLobbyCode) {
        socket.disconnect();
        socket.connect();
        currentLobbyCode = null;
        currentLobby = null;
        isAdmin = false;
        showScreen('start');
    }
});

// Socket Event Listeners
socket.on('lobby-created', (data) => {
    currentLobbyCode = data.lobbyCode;
    currentLobby = data.lobby;
    updateLobbyScreen();
    showScreen('lobby');
    showNotification(`Lobby ${data.lobbyCode} erstellt!`, 'success');
});

socket.on('joined-lobby-success', (data) => {
    currentLobbyCode = data.lobbyCode;
    currentLobby = data.lobby;
    updateLobbyScreen();
    showScreen('lobby');
    showNotification(`Erfolgreich Lobby ${data.lobbyCode} beigetreten!`, 'success');
});

socket.on('player-joined', (data) => {
    currentLobby = data.lobby;
    updateLobbyScreen();
    showNotification(`${data.newPlayer.name} ist beigetreten!`, 'info');
});

socket.on('player-left', (data) => {
    currentLobby = data.lobby;
    if (screens.lobby.classList.contains('active')) {
        updateLobbyScreen();
    }
    showNotification(`${data.removedPlayer} hat die Lobby verlassen`, 'info');
});

socket.on('lobby-closed', (message) => {
    showNotification(message, 'error');
    showScreen('start');
    currentLobbyCode = null;
    currentLobby = null;
    isAdmin = false;
});

socket.on('game-started', (lobby) => {
    currentLobby = lobby;
    initializeGame();
    showScreen('game');
    showNotification('Spiel gestartet! 🎮 Nutzt Discord für Voice & Video Chat!', 'success');
    
    // Discord-Integration vorbereiten
    setupJitsiIntegration();
});

socket.on('question-selected', (data) => {
    showQuestion(data);
});

socket.on('answer-processed', (data) => {
    currentLobby = data.lobby;
    hideQuestion();
    updateGameScreen();
    showNotification('Antwort verarbeitet!', 'info');
});

socket.on('round-end', (data) => {
    currentLobby = data.lobby;
    updateGameScreen();
    showNotification(`Runde ${data.nextRound} beginnt!`, 'info');
    setTimeout(() => {
        generateGameBoard();
    }, 2000);
});

socket.on('game-end', (data) => {
    currentLobby = data.lobby;
    showEndScreen(data.finalScores);
});

socket.on('error', (message) => {
    showNotification(message, 'error');
});

// Video Call Events
socket.on('player-joined-call-notification', (data) => {
    showNotification(`📹 ${data.playerName} nutzt jetzt auch Jitsi Meet!`, 'info');
});

socket.on('player-left-call-notification', (data) => {
    showNotification(`📵 ${data.playerName} hat den Video Call verlassen`, 'info');
    
    // Peer Connection schließen und Video entfernen
    if (data.playerId && peerConnections[data.playerId]) {
        peerConnections[data.playerId].close();
        delete peerConnections[data.playerId];
        
        // Video-Slot zurücksetzen
        const playerSlot = document.querySelector(`[data-player-id="${data.playerId}"]`);
        if (playerSlot && playerSlot !== myVideoSlot) {
            resetVideoSlot(playerSlot);
        }
    }
    
    updateCallStatus();
});

// Jitsi Meet Integration

function resetVideoSlot(playerSlot) {
    const video = playerSlot.querySelector('.player-video');
    const placeholder = playerSlot.querySelector('.video-placeholder');
    const overlay = playerSlot.querySelector('.video-overlay');
    
    video.style.display = 'none';
    video.srcObject = null;
    placeholder.style.display = 'flex';
    playerSlot.classList.remove('active', 'admin');
    playerSlot.removeAttribute('data-player-id');
    
    if (overlay) overlay.remove();
    
    // Status Text zurücksetzen
    const statusText = placeholder.querySelector('.video-status');
    if (statusText) {
        statusText.textContent = 'Wartet auf Beitritt...';
    }
}

// Lobby Screen Update
function updateLobbyScreen() {
    document.getElementById('current-lobby-code').textContent = currentLobbyCode;
    document.getElementById('admin-display-name').textContent = currentLobby.adminName;
    document.getElementById('player-count').textContent = currentLobby.players.length;
    
    const playersList = document.getElementById('players-list');
    playersList.innerHTML = '';
    
    // Admin Card
    const adminCard = document.createElement('div');
    adminCard.className = 'player-card admin';
    adminCard.innerHTML = `
        <div class="player-name">${currentLobby.adminName}</div>
        <div class="player-role">👑 Admin</div>
    `;
    playersList.appendChild(adminCard);
    
    // Spieler Cards
    currentLobby.players.forEach(player => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card';
        playerCard.innerHTML = `
            <div class="player-name">${player.name}</div>
            <div class="player-role">🎮 Spieler</div>
        `;
        playersList.appendChild(playerCard);
    });
    
    // Leere Slots
    const emptySlots = 4 - currentLobby.players.length;
    for (let i = 0; i < emptySlots; i++) {
        const emptyCard = document.createElement('div');
        emptyCard.className = 'player-card empty-slot';
        emptyCard.textContent = 'Warte auf Spieler...';
        playersList.appendChild(emptyCard);
    }
    
    // Start Button aktivieren/deaktivieren
    const startBtn = document.getElementById('start-game-btn');
    startBtn.disabled = !isAdmin || currentLobby.players.length === 0;
}

// Game Initialization
function initializeGame() {
    generateGameBoard();
    updateGameScreen();
}

function generateGameBoard() {
    const gameBoard = document.getElementById('game-board');
    gameBoard.innerHTML = '';
    
    const categories = currentLobby.categories;
    const pointValues = currentLobby.currentRound === 1 ? 
        [100, 200, 300, 400, 500] : 
        [200, 400, 600, 800, 1000];
    
    // Kategorien Headers
    categories.forEach(category => {
        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'category-header';
        categoryHeader.textContent = category;
        gameBoard.appendChild(categoryHeader);
    });
    
    // Fragen Zellen
    for (let pointIndex = 0; pointIndex < pointValues.length; pointIndex++) {
        categories.forEach((category, categoryIndex) => {
            const points = pointValues[pointIndex];
            const questionKey = `${category}-${currentLobby.currentRound === 1 ? points : points / 2}`;
            
            const cell = document.createElement('button');
            cell.className = 'question-cell';
            cell.textContent = points;
            
            if (currentLobby.answeredQuestions.includes(questionKey)) {
                cell.disabled = true;
            } else if (isAdmin) {
                cell.addEventListener('click', () => {
                    selectQuestion(category, points);
                });
            } else {
                cell.disabled = true;
            }
            
            gameBoard.appendChild(cell);
        });
    }
}

function updateGameScreen() {
    // Runde anzeigen
    document.getElementById('current-round').textContent = currentLobby.currentRound;
    
    // Aktuellen Spieler anzeigen
    if (currentLobby.players.length > 0) {
        const currentPlayer = currentLobby.players[currentLobby.currentPlayer];
        document.getElementById('active-player-name').textContent = currentPlayer ? currentPlayer.name : 'Unbekannt';
    }
    
    // Scores anzeigen
    const scoresList = document.getElementById('scores-list');
    scoresList.innerHTML = '';
    
    currentLobby.players.forEach(player => {
        const scoreItem = document.createElement('div');
        scoreItem.className = 'score-item';
        scoreItem.innerHTML = `
            <div class="score-name">${player.name}</div>
            <div class="score-points">${currentLobby.scores[player.id] || 0}</div>
        `;
        scoresList.appendChild(scoreItem);
    });
}

function selectQuestion(category, points) {
    if (isAdmin) {
        socket.emit('select-question', {
            lobbyCode: currentLobbyCode,
            category,
            points
        });
    }
}

function showQuestion(data) {
    currentQuestionData = data;
    
    document.getElementById('question-category').textContent = data.category;
    document.getElementById('question-points').textContent = data.points;
    document.getElementById('question-text').textContent = data.question.question || data.question;
    
    // Admin Controls anzeigen/verstecken
    const adminControls = document.getElementById('admin-controls');
    if (isAdmin) {
        adminControls.style.display = 'flex';
        
        // Event Listener für Antwort-Buttons
        document.getElementById('correct-answer-btn').onclick = () => {
            processAnswer(true);
        };
        
        document.getElementById('wrong-answer-btn').onclick = () => {
            processAnswer(false);
        };
        
        document.getElementById('close-question-btn').onclick = () => {
            hideQuestion();
        };
    } else {
        adminControls.style.display = 'none';
    }
    
    document.getElementById('question-area').classList.remove('hidden');
}

function hideQuestion() {
    document.getElementById('question-area').classList.add('hidden');
    currentQuestionData = null;
}

function processAnswer(correct) {
    if (isAdmin && currentQuestionData) {
        const currentPlayer = currentLobby.players[currentLobby.currentPlayer];
        
        socket.emit('answer-result', {
            lobbyCode: currentLobbyCode,
            correct,
            points: currentQuestionData.points,
            playerId: currentPlayer.id
        });
    }
}

// Jitsi Meet Integration Status
let isJitsiActive = false;

function setupJitsiIntegration() {
    setupVideoCallControls();
    updateJitsiStatus(false);
}

function setupVideoCallControls() {
    // Jitsi Meet Controls
    document.getElementById('start-jitsi').addEventListener('click', startJitsiMeeting);
    document.getElementById('open-jitsi').addEventListener('click', openJitsiRoom);
    document.getElementById('copyRoomLink').addEventListener('click', copyRoomLink);
}

// Jitsi Meet benötigt keine Browser-Kompatibilitätsprüfung - läuft überall!

function startJitsiMeeting() {
    if (!currentLobbyCode) {
        showNotification('❌ Kein Lobby-Code verfügbar', 'error');
        return;
    }
    
    initializeJitsiMeet();
    isJitsiActive = true;
    
    showNotification('🎥 Jitsi Meet Video Call gestartet!', 'success');
}

// Jitsi Meet ist einfacher - keine komplexe Fehlerbehandlung nötig

// Alte WebRTC-Funktionen entfernt - Jitsi Meet ist viel einfacher!
// Jitsi Meet Integration
function initializeJitsiMeet() {
    if (!currentLobbyCode) return;
    
    // Eindeutigen Raum Namen erstellen
    jitsiRoomName = `jeopardy-${currentLobbyCode}`;
    
    // Jitsi Meet Container zeigen
    const jitsiContainer = document.getElementById('jitsi-container');
    const roomInfo = document.getElementById('room-info');
    const roomLink = document.getElementById('room-link');
    
    // Raum Link anzeigen
    const jitsiUrl = `https://meet.jit.si/${jitsiRoomName}`;
    roomLink.textContent = jitsiUrl;
    roomInfo.style.display = 'block';
    
    // Jitsi Meet API konfigurieren
    const domain = 'meet.jit.si';
    const options = {
        roomName: jitsiRoomName,
        width: '100%',
        height: '400px',
        parentNode: jitsiContainer,
        userInfo: {
            displayName: isAdmin ? currentLobby.adminName : getPlayerName()
        },
        configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            disableDeepLinking: true,
            prejoinPageEnabled: false
        },
        interfaceConfigOverwrite: {
            TOOLBAR_BUTTONS: [
                'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
                'fodeviceselection', 'hangup', 'profile', 'settings', 'videoquality',
                'filmstrip', 'stats', 'shortcuts', 'tileview', 'videobackgroundblur',
                'download', 'help'
            ],
            SETTINGS_SECTIONS: ['devices', 'language', 'moderator', 'profile', 'calendar'],
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false
        }
    };
    
    // Jitsi Meet API laden und initialisieren
    if (window.JitsiMeetExternalAPI) {
        jitsiApi = new JitsiMeetExternalAPI(domain, options);
        
        jitsiApi.addEventListener('videoConferenceJoined', () => {
            showNotification('✅ Video Call beigetreten', 'success');
            updateJitsiStatus(true);
        });
        
        jitsiApi.addEventListener('videoConferenceLeft', () => {
            showNotification('📵 Video Call verlassen', 'info');
            updateJitsiStatus(false);
        });
        
        jitsiApi.addEventListener('participantJoined', (participant) => {
            showNotification(`👋 ${participant.displayName} ist beigetreten`, 'info');
        });
        
        jitsiApi.addEventListener('participantLeft', (participant) => {
            showNotification(`👋 ${participant.displayName} hat verlassen`, 'info');
        });
    } else {
        console.error('Jitsi Meet API nicht geladen');
        showNotification('❌ Video Call Fehler: API nicht verfügbar', 'error');
    }
}

function updateJitsiStatus(isJoined) {
    const statusElement = document.getElementById('call-participants');
    const indicator = document.querySelector('.status-indicator');
    
    if (isJoined) {
        statusElement.textContent = 'Video Call aktiv';
        indicator.textContent = '🟢';
    } else {
        statusElement.textContent = 'Kein Video Call';
        indicator.textContent = '🔴';
    }
}

function copyRoomLink() {
    const roomLink = document.getElementById('room-link');
    if (roomLink) {
        navigator.clipboard.writeText(roomLink.textContent).then(() => {
            showNotification('📋 Raum-Link kopiert!', 'success');
        }).catch(() => {
            // Fallback für ältere Browser
            const textArea = document.createElement('textarea');
            textArea.value = roomLink.textContent;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showNotification('📋 Raum-Link kopiert!', 'success');
        });
    }
}

function openJitsiRoom() {
    if (jitsiRoomName) {
        const jitsiUrl = `https://meet.jit.si/${jitsiRoomName}`;
        window.open(jitsiUrl, '_blank');
        showNotification('🔗 Jitsi Meet Raum in neuem Tab geöffnet', 'info');
    }
}

function getPlayerNameById(playerId) {
    if (playerId === currentLobby.admin) {
        return currentLobby.adminName;
    }
    
    const player = currentLobby.players.find(p => p.id === playerId);
    return player ? player.name : 'Unbekannt';
}

function destroyJitsiMeet() {
    if (jitsiApi) {
        jitsiApi.dispose();
        jitsiApi = null;
    }
    
    // Container leeren
    const jitsiContainer = document.getElementById('jitsi-container');
    if (jitsiContainer) {
        jitsiContainer.innerHTML = '';
    }
    
    // Room Info verstecken
    const roomInfo = document.getElementById('room-info');
    if (roomInfo) {
        roomInfo.style.display = 'none';
    }
}

function getPlayerName() {
    // Hole Spielername vom aktuellen Spieler
    if (currentLobby && currentLobby.players) {
        const player = currentLobby.players.find(p => p.id === socket.id);
        return player ? player.name : 'Spieler';
    }
    return 'Spieler';
}

// Jitsi Meet Hilfsfunktionen
function cleanupJitsiMeet() {
    destroyJitsiMeet();
    jitsiRoomName = null;
    updateJitsiStatus(false);
}

// Discord Integration - Keine komplexen WebRTC Events mehr nötig

// End Game Screen
function showEndScreen(finalScores) {
    const finalScoresContainer = document.getElementById('final-scores');
    finalScoresContainer.innerHTML = '';
    
    // Scores sortieren
    const sortedScores = Object.entries(finalScores)
        .map(([playerId, score]) => {
            const player = currentLobby.players.find(p => p.id === playerId);
            return { name: player ? player.name : 'Unbekannt', score };
        })
        .sort((a, b) => b.score - a.score);
    
    // Gewinner anzeigen
    sortedScores.forEach((player, index) => {
        const scoreItem = document.createElement('div');
        scoreItem.className = `final-score-item ${index === 0 ? 'winner' : ''}`;
        
        scoreItem.innerHTML = `
            <span>${index === 0 ? '👑 ' : ''}${player.name}</span>
            <span>${player.score} Punkte</span>
        `;
        
        finalScoresContainer.appendChild(scoreItem);
    });
    
    showScreen('gameEnd');
}

// End Game Actions
document.getElementById('new-game-btn').addEventListener('click', () => {
    if (isAdmin) {
        // Neues Spiel starten (zurück zur Lobby)
        currentLobby.gameState = 'waiting';
        currentLobby.currentRound = 1;
        currentLobby.currentPlayer = 0;
        currentLobby.answeredQuestions = [];
        
        // Scores zurücksetzen
        Object.keys(currentLobby.scores).forEach(playerId => {
            currentLobby.scores[playerId] = 0;
        });
        
        showScreen('lobby');
        updateLobbyScreen();
    }
});

document.getElementById('home-btn').addEventListener('click', () => {
    // Jitsi Meet cleanup
    cleanupJitsiMeet();
    
    // Zum Hauptmenü zurückkehren
    socket.disconnect();
    socket.connect();
    
    currentLobbyCode = null;
    currentLobby = null;
    isAdmin = false;
    
    showScreen('start');
});

// Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    // ESC zum Schließen von Fragen (nur Admin)
    if (e.key === 'Escape' && isAdmin && !document.getElementById('question-area').classList.contains('hidden')) {
        hideQuestion();
    }
    
    // Enter für richtige Antwort, Backspace für falsche Antwort (nur Admin)
    if (isAdmin && !document.getElementById('question-area').classList.contains('hidden')) {
        if (e.key === 'Enter') {
            e.preventDefault();
            processAnswer(true);
        } else if (e.key === 'Backspace') {
            e.preventDefault();
            processAnswer(false);
        }
    }
});

// Auto-reconnect bei Verbindungsabbruch
socket.on('disconnect', () => {
    showNotification('Verbindung unterbrochen. Versuche erneut zu verbinden...', 'error');
});

socket.on('connect', () => {
    if (currentLobbyCode && !screens.start.classList.contains('active')) {
        showNotification('Verbindung wiederhergestellt!', 'success');
    }
});

// Cleanup beim Verlassen der Seite
window.addEventListener('beforeunload', () => {
    // Discord-Integration benötigt kein spezielles Cleanup
    console.log('Spiel verlassen - Discord-Chat läuft weiter');
});