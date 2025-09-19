// Socket.io Verbindung
const socket = io();

// Globale Variablen
let isAdmin = false;
let currentLobbyCode = null;
let currentLobby = null;
let currentQuestionData = null;
let localStream = null;
let peerConnections = {};

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
    setupDiscordIntegration();
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
    showNotification(`📹 ${data.playerName} ist dem Video Call beigetreten!`, 'info');
    updateCallStatus();
});

socket.on('player-left-call-notification', (data) => {
    showNotification(`📵 ${data.playerName} hat den Video Call verlassen`, 'info');
    updateCallStatus();
});

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

// Video Call Integration
let localVideoStream = null;
let localAudioEnabled = true;
let localVideoEnabled = true;
let isInCall = false;

function setupDiscordIntegration() {
    setupVideoCallControls();
    updateCallStatus();
}

function setupVideoCallControls() {
    // Video Call beitreten
    document.getElementById('join-video-call').addEventListener('click', joinVideoCall);
    
    // Audio/Video Controls
    document.getElementById('toggle-audio').addEventListener('click', toggleAudio);
    document.getElementById('toggle-video').addEventListener('click', toggleVideo);
    document.getElementById('leave-call').addEventListener('click', leaveVideoCall);
}

async function joinVideoCall() {
    try {
        // Kamera und Mikrofon Berechtigung anfordern
        localVideoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 1280 }, 
                height: { ideal: 720 },
                facingMode: 'user'
            }, 
            audio: { 
                echoCancellation: true,
                noiseSuppression: true 
            } 
        });
        
        // Eigenes Video anzeigen
        displayLocalVideo();
        
        // UI aktualisieren
        isInCall = true;
        updateCallUI();
        updateCallStatus();
        
        showNotification('📹 Video Call beigetreten! Andere Spieler können euch jetzt sehen.', 'success');
        
        // Anderen Spielern mitteilen
        socket.emit('player-joined-call', {
            lobbyCode: currentLobbyCode,
            playerName: isAdmin ? currentLobby.adminName : getPlayerName()
        });
        
    } catch (error) {
        console.error('Fehler beim Video Call Beitritt:', error);
        showNotification('❌ Kamera/Mikrofon Zugriff fehlgeschlagen. Überprüft die Berechtigungen!', 'error');
    }
}

function displayLocalVideo() {
    const playerSlot = isAdmin ? 
        document.getElementById('admin-video') : 
        getPlayerVideoSlot();
    
    if (playerSlot) {
        const video = playerSlot.querySelector('.player-video');
        const placeholder = playerSlot.querySelector('.video-placeholder');
        
        video.srcObject = localVideoStream;
        video.style.display = 'block';
        placeholder.style.display = 'none';
        
        playerSlot.classList.add('active');
        if (isAdmin) playerSlot.classList.add('admin');
        
        // Player Name aktualisieren
        const label = playerSlot.querySelector('.player-label');
        if (label) {
            label.textContent = isAdmin ? currentLobby.adminName : getPlayerName();
        }
        
        // Video Status Overlay hinzufügen
        addVideoStatusOverlay(playerSlot);
    }
}

function getPlayerVideoSlot() {
    // Finde den ersten verfügbaren Spieler-Slot
    for (let i = 1; i <= 4; i++) {
        const slot = document.getElementById(`player${i}-video`);
        if (slot && !slot.classList.contains('active')) {
            return slot;
        }
    }
    return null;
}

function getPlayerName() {
    // Hole Spielername vom aktuellen Spieler
    if (currentLobby && currentLobby.players) {
        const player = currentLobby.players.find(p => p.id === socket.id);
        return player ? player.name : 'Spieler';
    }
    return 'Spieler';
}

function addVideoStatusOverlay(playerSlot) {
    const overlay = document.createElement('div');
    overlay.className = 'video-overlay';
    overlay.innerHTML = `
        <div class="mic-status ${localAudioEnabled ? 'active' : 'muted'}">
            <span>${localAudioEnabled ? '🎤' : '🔇'}</span>
        </div>
        <div class="cam-status ${localVideoEnabled ? 'active' : 'off'}">
            <span>${localVideoEnabled ? '📹' : '📷'}</span>
        </div>
    `;
    playerSlot.appendChild(overlay);
}

function toggleAudio() {
    if (localVideoStream) {
        const audioTracks = localVideoStream.getAudioTracks();
        if (audioTracks.length > 0) {
            localAudioEnabled = !localAudioEnabled;
            audioTracks[0].enabled = localAudioEnabled;
            
            updateAudioButton();
            updateVideoStatusOverlay();
            
            showNotification(localAudioEnabled ? '🎤 Mikrofon aktiviert' : '🔇 Mikrofon deaktiviert', 'info');
        }
    }
}

function toggleVideo() {
    if (localVideoStream) {
        const videoTracks = localVideoStream.getVideoTracks();
        if (videoTracks.length > 0) {
            localVideoEnabled = !localVideoEnabled;
            videoTracks[0].enabled = localVideoEnabled;
            
            updateVideoButton();
            updateVideoStatusOverlay();
            
            showNotification(localVideoEnabled ? '📹 Kamera aktiviert' : '📷 Kamera deaktiviert', 'info');
        }
    }
}

function updateAudioButton() {
    const audioBtn = document.getElementById('toggle-audio');
    audioBtn.className = `btn ${localAudioEnabled ? 'btn-success' : 'btn-danger'}`;
    audioBtn.innerHTML = `<i class="icon">${localAudioEnabled ? '🎤' : '🔇'}</i> Mikro`;
}

function updateVideoButton() {
    const videoBtn = document.getElementById('toggle-video');
    videoBtn.className = `btn ${localVideoEnabled ? 'btn-success' : 'btn-danger'}`;
    videoBtn.innerHTML = `<i class="icon">${localVideoEnabled ? '📹' : '📷'}</i> Kamera`;
}

function updateVideoStatusOverlay() {
    const activeSlot = document.querySelector('.player-video-slot.active .video-overlay');
    if (activeSlot) {
        const micStatus = activeSlot.querySelector('.mic-status');
        const camStatus = activeSlot.querySelector('.cam-status');
        
        micStatus.className = `mic-status ${localAudioEnabled ? 'active' : 'muted'}`;
        micStatus.innerHTML = `<span>${localAudioEnabled ? '🎤' : '🔇'}</span>`;
        
        camStatus.className = `cam-status ${localVideoEnabled ? 'active' : 'off'}`;
        camStatus.innerHTML = `<span>${localVideoEnabled ? '📹' : '📷'}</span>`;
    }
}

function leaveVideoCall() {
    if (localVideoStream) {
        localVideoStream.getTracks().forEach(track => track.stop());
        localVideoStream = null;
    }
    
    // UI zurücksetzen
    const activeSlot = document.querySelector('.player-video-slot.active');
    if (activeSlot) {
        const video = activeSlot.querySelector('.player-video');
        const placeholder = activeSlot.querySelector('.video-placeholder');
        const overlay = activeSlot.querySelector('.video-overlay');
        
        video.style.display = 'none';
        placeholder.style.display = 'flex';
        activeSlot.classList.remove('active', 'admin');
        
        if (overlay) overlay.remove();
        
        // Status zurücksetzen
        const statusText = placeholder.querySelector('.video-status');
        if (statusText) {
            statusText.textContent = isAdmin ? 'Warte auf Verbindung...' : 'Wartet auf Beitritt...';
        }
    }
    
    isInCall = false;
    localAudioEnabled = true;
    localVideoEnabled = true;
    
    updateCallUI();
    updateCallStatus();
    
    showNotification('📵 Video Call verlassen', 'info');
    
    // Anderen mitteilen
    socket.emit('player-left-call', {
        lobbyCode: currentLobbyCode,
        playerName: isAdmin ? currentLobby.adminName : getPlayerName()
    });
}

function updateCallUI() {
    const joinBtn = document.getElementById('join-video-call');
    const audioBtn = document.getElementById('toggle-audio');
    const videoBtn = document.getElementById('toggle-video');
    const leaveBtn = document.getElementById('leave-call');
    
    if (isInCall) {
        joinBtn.style.display = 'none';
        audioBtn.disabled = false;
        videoBtn.disabled = false;
        leaveBtn.style.display = 'inline-flex';
        
        updateAudioButton();
        updateVideoButton();
    } else {
        joinBtn.style.display = 'inline-flex';
        audioBtn.disabled = true;
        videoBtn.disabled = true;
        leaveBtn.style.display = 'none';
        
        // Buttons zurücksetzen
        audioBtn.className = 'btn btn-ghost';
        audioBtn.innerHTML = '<i class="icon">🎤</i> Mikro';
        videoBtn.className = 'btn btn-ghost';
        videoBtn.innerHTML = '<i class="icon">📹</i> Kamera';
    }
}

function updateCallStatus() {
    const statusElement = document.getElementById('call-participants');
    const indicator = document.querySelector('.status-indicator');
    
    let participantCount = 0;
    const totalParticipants = (currentLobby ? currentLobby.players.length : 0) + 1; // +1 für Admin
    
    // Zähle aktive Video-Slots
    participantCount = document.querySelectorAll('.player-video-slot.active').length;
    
    statusElement.textContent = `${participantCount}/${totalParticipants} Teilnehmer`;
    
    if (participantCount > 0) {
        indicator.textContent = '🟢';
    } else {
        indicator.textContent = '🔴';
    }
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
    // Video Call verlassen falls aktiv
    if (isInCall) {
        leaveVideoCall();
    }
    
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