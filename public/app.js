// Socket.io Verbindung
const socket = io();

// Globale Variablen
let isAdmin = false;
let currentLobbyCode = null;
let currentLobby = null;
let currentQuestionData = null;
let localStream = null;
let peerConnections = {};
let myVideoSlot = null;

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
    
    // Wenn ich bereits im Call bin, Verbindung zu dem neuen Spieler aufbauen
    if (isInCall && data.playerId !== socket.id) {
        const playerName = getPlayerNameById(data.playerId);
        createPeerConnection(data.playerId, playerName);
        
        // Als "Initiator" ein Offer senden
        setTimeout(() => {
            createAndSendOffer(data.playerId);
        }, 1000);
    }
    
    updateCallStatus();
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

// WebRTC Signaling Events
socket.on('webrtc-offer', handleOffer);
socket.on('webrtc-answer', handleAnswer);
socket.on('ice-candidate', handleIceCandidate);

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
    
    // Browser-Kompatibilität prüfen
    checkBrowserSupport();
}

function checkBrowserSupport() {
    const callInstructions = document.querySelector('.call-instructions');
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        callInstructions.innerHTML = `
            <p><strong>⚠️ Browser nicht unterstützt:</strong></p>
            <p>Ihr Browser unterstützt keine Webcam/Mikrofon-Funktionen. Bitte verwenden Sie Chrome, Firefox, Safari oder Edge für die Video-Call-Funktion. Das Spiel funktioniert trotzdem!</p>
        `;
        document.getElementById('join-video-call').disabled = true;
        return false;
    }
    
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    
    if (!isSecure) {
        callInstructions.innerHTML = `
            <p><strong>🔒 HTTPS erforderlich:</strong></p>
            <p>Webcam/Mikrofon-Zugriff erfordert eine sichere Verbindung (HTTPS). Auf Render.com wird automatisch HTTPS verwendet. Lokal können Sie mit Chrome --allow-running-insecure-content arbeiten.</p>
        `;
        return false;
    }
    
    return true;
}

async function joinVideoCall() {
    // Check if HTTPS or localhost
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    
    if (!isSecure) {
        showHTTPSWarning();
        return;
    }
    
    // Check if getUserMedia is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showNotification('❌ Webcam/Mikrofon wird von diesem Browser nicht unterstützt!', 'error');
        return;
    }
    
    try {
        // Erst nur Audio versuchen, dann Video
        localVideoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640, max: 1280 }, 
                height: { ideal: 480, max: 720 },
                facingMode: 'user'
            }, 
            audio: { 
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } 
        });
        
        // Eigenes Video anzeigen
        displayLocalVideo();
        
        // WebRTC Peer Connections für andere Spieler erstellen
        setupPeerConnections();
        
        // UI aktualisieren
        isInCall = true;
        updateCallUI();
        updateCallStatus();
        
        showNotification('📹 Video Call beigetreten! Verbinde mit anderen Spielern...', 'success');
        
        // Anderen Spielern mitteilen dass ich beigetreten bin
        socket.emit('player-joined-call', {
            lobbyCode: currentLobbyCode,
            playerName: isAdmin ? currentLobby.adminName : getPlayerName(),
            playerId: socket.id
        });
        
    } catch (error) {
        console.error('Fehler beim Video Call Beitritt:', error);
        handleMediaError(error);
    }
}

function showHTTPSWarning() {
    showNotification('🔒 HTTPS erforderlich für Webcam-Zugriff! Render.com nutzt automatisch HTTPS.', 'error');
    
    // Alternative Lösung anbieten
    const httpsUrl = window.location.href.replace('http://', 'https://');
    if (httpsUrl !== window.location.href) {
        setTimeout(() => {
            if (confirm('Möchten Sie zur sicheren HTTPS-Version wechseln?')) {
                window.location.href = httpsUrl;
            }
        }, 2000);
    }
}

function handleMediaError(error) {
    let message = '❌ Webcam/Mikrofon Zugriff fehlgeschlagen: ';
    
    switch(error.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
            message += 'Berechtigung verweigert. Klicken Sie auf "Zulassen" wenn der Browser fragt!';
            break;
        case 'NotFoundError':
        case 'DevicesNotFoundError':
            message += 'Keine Kamera/Mikrofon gefunden. Schließen Sie ein Gerät an!';
            break;
        case 'NotReadableError':
        case 'TrackStartError':
            message += 'Kamera/Mikrofon wird bereits verwendet. Schließen Sie andere Apps!';
            break;
        case 'OverconstrainedError':
        case 'ConstraintNotSatisfiedError':
            message += 'Kamera unterstützt nicht die angeforderte Qualität. Versuchen Sie es erneut!';
            // Fallback mit niedrigerer Qualität
            tryLowerQualityVideo();
            return;
        case 'NotSupportedError':
            message += 'Webcam/Mikrofon wird von diesem Browser nicht unterstützt!';
            break;
        case 'TypeError':
            message += 'Browser-Problem. Versuchen Sie Chrome, Firefox oder Safari!';
            break;
        default:
            message += `Unbekannter Fehler (${error.name}). Browser neu laden?`;
    }
    
    showNotification(message, 'error');
    showVideoCallTroubleshooting();
}

async function tryLowerQualityVideo() {
    try {
        // Fallback mit niedrigerer Qualität
        localVideoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 320, max: 640 }, 
                height: { ideal: 240, max: 480 },
                facingMode: 'user'
            }, 
            audio: { 
                echoCancellation: true,
                noiseSuppression: true
            } 
        });
        
        displayLocalVideo();
        isInCall = true;
        updateCallUI();
        updateCallStatus();
        
        showNotification('📹 Video Call mit reduzierter Qualität gestartet!', 'success');
        
        socket.emit('player-joined-call', {
            lobbyCode: currentLobbyCode,
            playerName: isAdmin ? currentLobby.adminName : getPlayerName()
        });
        
    } catch (fallbackError) {
        console.error('Auch Fallback fehlgeschlagen:', fallbackError);
        showNotification('❌ Auch mit reduzierter Qualität nicht möglich. Spielen Sie ohne Video weiter!', 'error');
    }
}

function showVideoCallTroubleshooting() {
    const troubleshootMsg = `
🔧 Lösungsvorschläge:

1. 🔒 HTTPS verwenden (automatisch auf Render.com)
2. 🎯 Auf "Zulassen" klicken wenn Browser fragt
3. 📹 Kamera/Mikrofon anschließen und testen
4. 🔄 Andere Apps schließen die Kamera nutzen
5. 🌐 Chrome, Firefox oder Safari verwenden
6. 📱 Bei mobilen Geräten: App-Berechtigungen prüfen

Das Spiel funktioniert auch ohne Video! 🎮
    `;
    
    setTimeout(() => {
        alert(troubleshootMsg);
    }, 3000);
}

// WebRTC Peer-to-Peer Verbindungen
function setupPeerConnections() {
    // Für alle anderen Spieler in der Lobby Peer Connections erstellen
    const allPlayers = [...currentLobby.players];
    if (isAdmin) {
        // Admin ist nicht in players Array, aber andere sollen ihn sehen
        allPlayers.forEach(player => {
            if (player.id !== socket.id) {
                createPeerConnection(player.id, player.name);
            }
        });
    } else {
        // Verbindung zum Admin
        createPeerConnection(currentLobby.admin, currentLobby.adminName);
        
        // Verbindung zu anderen Spielern
        allPlayers.forEach(player => {
            if (player.id !== socket.id) {
                createPeerConnection(player.id, player.name);
            }
        });
    }
}

function createPeerConnection(playerId, playerName) {
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    };
    
    const peerConnection = new RTCPeerConnection(configuration);
    peerConnections[playerId] = peerConnection;
    
    // Lokalen Stream zur Peer Connection hinzufügen
    if (localVideoStream) {
        localVideoStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localVideoStream);
        });
    }
    
    // Remote Stream empfangen
    peerConnection.ontrack = (event) => {
        console.log('Remote stream empfangen von:', playerName);
        const remoteStream = event.streams[0];
        displayRemoteVideo(remoteStream, playerId, playerName);
    };
    
    // ICE Candidate Event
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                target: playerId,
                candidate: event.candidate,
                lobbyCode: currentLobbyCode
            });
        }
    };
    
    // Connection State Monitoring
    peerConnection.onconnectionstatechange = () => {
        console.log(`Connection zu ${playerName}: ${peerConnection.connectionState}`);
        if (peerConnection.connectionState === 'connected') {
            showNotification(`✅ Verbunden mit ${playerName}`, 'success');
        } else if (peerConnection.connectionState === 'failed') {
            showNotification(`❌ Verbindung zu ${playerName} fehlgeschlagen`, 'error');
        }
    };
    
    return peerConnection;
}

function displayRemoteVideo(stream, playerId, playerName) {
    // Freien Video-Slot finden (nicht den eigenen)
    const availableSlots = document.querySelectorAll('.player-video-slot:not(.active)');
    
    let targetSlot = null;
    
    // Prüfe ob Admin-Slot verfügbar ist (wenn Remote-Player Admin ist)
    if (playerId === currentLobby.admin && !document.getElementById('admin-video').classList.contains('active')) {
        targetSlot = document.getElementById('admin-video');
        targetSlot.classList.add('admin');
    } else if (availableSlots.length > 0) {
        targetSlot = availableSlots[0];
    }
    
    if (targetSlot) {
        const video = targetSlot.querySelector('.player-video');
        const placeholder = targetSlot.querySelector('.video-placeholder');
        
        video.srcObject = stream;
        video.autoplay = true;
        video.muted = false; // Remote Videos nicht stumm
        video.style.display = 'block';
        placeholder.style.display = 'none';
        
        targetSlot.classList.add('active');
        targetSlot.setAttribute('data-player-id', playerId);
        
        // Player Name aktualisieren
        const label = targetSlot.querySelector('.player-label');
        if (label) {
            label.textContent = playerName;
        }
        
        // Remote Video Status Overlay
        addRemoteVideoStatusOverlay(targetSlot, playerId);
        
        console.log(`Remote Video angezeigt für ${playerName}`);
        updateCallStatus();
    } else {
        console.warn('Kein freier Video-Slot für', playerName);
    }
}

function addRemoteVideoStatusOverlay(playerSlot, playerId) {
    const overlay = document.createElement('div');
    overlay.className = 'video-overlay';
    overlay.innerHTML = `
        <div class="mic-status active">
            <span>🎤</span>
        </div>
        <div class="cam-status active">
            <span>📹</span>
        </div>
    `;
    playerSlot.appendChild(overlay);
}

// WebRTC Offer/Answer Handling
async function createAndSendOffer(playerId) {
    const peerConnection = peerConnections[playerId];
    if (peerConnection) {
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            socket.emit('webrtc-offer', {
                target: playerId,
                offer: offer,
                lobbyCode: currentLobbyCode
            });
        } catch (error) {
            console.error('Fehler beim Erstellen des Offers:', error);
        }
    }
}

async function handleOffer(data) {
    const { from, offer } = data;
    
    if (!peerConnections[from]) {
        // Peer Connection erstellen falls noch nicht vorhanden
        const playerName = getPlayerNameById(from);
        createPeerConnection(from, playerName);
    }
    
    const peerConnection = peerConnections[from];
    
    try {
        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        socket.emit('webrtc-answer', {
            target: from,
            answer: answer,
            lobbyCode: currentLobbyCode
        });
    } catch (error) {
        console.error('Fehler bei Offer-Verarbeitung:', error);
    }
}

async function handleAnswer(data) {
    const { from, answer } = data;
    const peerConnection = peerConnections[from];
    
    if (peerConnection) {
        try {
            await peerConnection.setRemoteDescription(answer);
        } catch (error) {
            console.error('Fehler bei Answer-Verarbeitung:', error);
        }
    }
}

async function handleIceCandidate(data) {
    const { from, candidate } = data;
    const peerConnection = peerConnections[from];
    
    if (peerConnection) {
        try {
            await peerConnection.addIceCandidate(candidate);
        } catch (error) {
            console.error('Fehler bei ICE-Candidate:', error);
        }
    }
}

function getPlayerNameById(playerId) {
    if (playerId === currentLobby.admin) {
        return currentLobby.adminName;
    }
    
    const player = currentLobby.players.find(p => p.id === playerId);
    return player ? player.name : 'Unbekannt';
}

function displayLocalVideo() {
    const playerSlot = isAdmin ? 
        document.getElementById('admin-video') : 
        getPlayerVideoSlot();
    
    if (playerSlot) {
        myVideoSlot = playerSlot;
        const video = playerSlot.querySelector('.player-video');
        const placeholder = playerSlot.querySelector('.video-placeholder');
        
        video.srcObject = localVideoStream;
        video.muted = true; // Eigenes Video stumm schalten
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
        
        // Markiere als eigenes Video
        playerSlot.setAttribute('data-player-id', socket.id);
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
    
    // Alle Peer Connections schließen
    Object.values(peerConnections).forEach(pc => {
        pc.close();
    });
    peerConnections = {};
    myVideoSlot = null;
    
    // Anderen mitteilen
    socket.emit('player-left-call', {
        lobbyCode: currentLobbyCode,
        playerName: isAdmin ? currentLobby.adminName : getPlayerName(),
        playerId: socket.id
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
    
    // Alle Peer Connections schließen
    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};
    
    // Zum Hauptmenü zurückkehren
    socket.disconnect();
    socket.connect();
    
    currentLobbyCode = null;
    currentLobby = null;
    isAdmin = false;
    myVideoSlot = null;
    
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