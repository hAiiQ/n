// Socket.io Verbindung
const socket = io();

// Globale Variablen
let isAdmin = false;
let currentLobbyCode = null;
let currentLobby = null;
let currentQuestionData = null;

// WebRTC Manager - Alle Video-Funktionen zentral verwaltet
let myVideoSlot = null;
let localAudioEnabled = true;
let localVideoEnabled = true;
let isInCall = false;

// WebRTC Konfiguration mit Google STUN-Servern
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
};

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
    
    // WebRTC Verbindung schließen falls vorhanden
    const leftPlayerId = Object.keys(peerConnections).find(id => {
        // Finde die Verbindung des Spielers der gegangen ist
        return true; // Vereinfachung - schließe alle nicht mehr benötigten Verbindungen später
    });
    
    // Video-Slot des Spielers freigeben (falls vorhanden)
    removePlayerVideoByName(data.removedPlayer);
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
    showNotification('Spiel gestartet! 📹 Video-Call für alle Spieler verfügbar!', 'success');
    
    // Video-Call Integration vorbereiten
    setupVideoCallIntegration();
    
    // Wenn bereits im Video Call, übertrage Videos von Lobby zu Game
    if (webrtc.isInCall) {
        transferVideosToGameScreen();
    }
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
    console.log('🔔 Spieler ist Video Call beigetreten:', data);
    showNotification(`📹 ${data.playerName} ist dem Video Call beigetreten!`, 'info');
    
    // Wenn ich bereits im Call bin, Verbindung zu dem neuen Spieler aufbauen
    if (webrtc.isInCall && data.playerId !== socket.id) {
        console.log(`🔗 Baue Verbindung zu neuem Spieler auf: ${data.playerName}`);
        
        // Peer Connection erstellen
        webrtc.createPeerConnection(data.playerId, data.playerName);
        
        // Als niedrigere Socket-ID sende ich das Offer (verhindert doppelte Offers)
        if (socket.id < data.playerId) {
            setTimeout(() => {
                console.log(`🎯 Sende Offer an neuen Spieler: ${data.playerName}`);
                webrtc.createOffer(data.playerId);
            }, 1500);
        }
    }
    
    updateCallStatus();
});

socket.on('player-left-call-notification', (data) => {
    showNotification(`📵 ${data.playerName} hat den Video Call verlassen`, 'info');
    
    // NEUE WEBRTC MANAGER LOGIK
    if (data.playerId && webrtc.peerConnections.has(data.playerId)) {
        const peerData = webrtc.peerConnections.get(data.playerId);
        peerData.connection.close();
        webrtc.peerConnections.delete(data.playerId);
        console.log(`🗑️ Peer Connection entfernt für: ${data.playerName}`);
        
        // Video-Slot zurücksetzen
        const playerSlot = document.querySelector(`[data-player-id="${data.playerId}"]`);
        if (playerSlot) {
            resetVideoSlot(playerSlot);
        }
    }
    
    updateCallStatus();
});

// WebRTC Signaling Events (NEUER WEBRTC MANAGER)
socket.on('webrtc-offer', (data) => {
    console.log('📥 WebRTC Offer empfangen von:', data.from);
    webrtc.handleOffer(data);
});

socket.on('webrtc-answer', (data) => {
    console.log('📥 WebRTC Answer empfangen von:', data.from);
    webrtc.handleAnswer(data);
});

socket.on('ice-candidate', (data) => {
    console.log('📥 ICE Candidate empfangen von:', data.from);
    webrtc.handleIceCandidate(data);
});

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

// Video Call Integration - Variablen bereits oben deklariert

function setupVideoCallIntegration() {
    setupVideoCallControls();
    updateCallStatus();
    initializeWebRTC();
}

// WebRTC Manager - Saubere Implementierung
class WebRTCManager {
    constructor() {
        this.localStream = null;
        this.peerConnections = new Map();
        this.isInCall = false;
    }

    async initializeLocalStream() {
        try {
            console.log('🎥 Initialisiere lokalen Video-Stream...');
            
            this.localStream = await navigator.mediaDevices.getUserMedia({
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

            console.log('✅ Lokaler Stream erfolgreich erstellt');
            return this.localStream;

        } catch (error) {
            console.error('❌ Fehler beim Erstellen des lokalen Streams:', error);
            throw error;
        }
    }

    createPeerConnection(peerId, peerName) {
        console.log(`📡 Erstelle PeerConnection für: ${peerName} (${peerId})`);
        
        const peerConnection = new RTCPeerConnection(rtcConfig);

        // Lokalen Stream hinzufügen
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
                console.log(`➕ Track hinzugefügt: ${track.kind}`);
            });
        }

        // Remote Stream Handler
        peerConnection.ontrack = (event) => {
            console.log(`📺 Remote Stream empfangen von: ${peerName}`);
            const [remoteStream] = event.streams;
            this.displayRemoteVideo(peerId, peerName, remoteStream);
        };

        // ICE Candidate Handler
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`🧊 Sende ICE Candidate an: ${peerName}`);
                socket.emit('ice-candidate', {
                    target: peerId,
                    candidate: event.candidate,
                    lobbyCode: currentLobbyCode
                });
            }
        };

        // Connection State Handler
        peerConnection.onconnectionstatechange = () => {
            console.log(`🔗 Verbindung zu ${peerName}: ${peerConnection.connectionState}`);
            
            if (peerConnection.connectionState === 'connected') {
                showNotification(`✅ Verbunden mit ${peerName}`, 'success');
            } else if (peerConnection.connectionState === 'failed') {
                showNotification(`❌ Verbindung zu ${peerName} fehlgeschlagen`, 'error');
            }
        };

        this.peerConnections.set(peerId, { connection: peerConnection, name: peerName });
        return peerConnection;
    }

    displayRemoteVideo(peerId, peerName, stream) {
        console.log(`🖥️ Zeige Remote Video für: ${peerName}`);
        
        // ERSTE: Prüfen ob bereits ein Video für diesen Peer existiert
        const existingSlot = document.querySelector(`[data-peer-id="${peerId}"]`);
        if (existingSlot) {
            console.log(`⚠️ Video für ${peerName} existiert bereits - aktualisiere Stream`);
            const video = existingSlot.querySelector('.player-video');
            if (video) {
                video.srcObject = stream;
            }
            return;
        }
        
        // ZWEITE: Finde verfügbaren Video-Slot
        const videoSlot = this.findAvailableVideoSlot();
        
        if (videoSlot) {
            // Unterscheide zwischen großen Player-Video-Slots und Mini-Video-Slots
            const video = videoSlot.querySelector('.player-video, .mini-video');
            const placeholder = videoSlot.querySelector('.video-placeholder');
            
            if (video && placeholder) {
                video.srcObject = stream;
                video.autoplay = true;
                video.playsInline = true;
                video.muted = false; // Remote Videos nicht stumm
                video.style.display = 'block';
                placeholder.style.display = 'none';
                
                videoSlot.classList.add('active');
                videoSlot.setAttribute('data-peer-id', peerId);
                
                const label = videoSlot.querySelector('.player-label');
                if (label) {
                    label.textContent = peerName;
                }
                
                console.log(`✅ Remote Video angezeigt für: ${peerName}`);
            }
        } else {
            console.warn(`⚠️ Kein verfügbarer Video-Slot für: ${peerName}`);
        }
    }

    findAvailableVideoSlot() {
        // Prüfe welcher Screen aktiv ist und verwende die entsprechenden Video-Slots
        let selector = '';
        
        if (screens.game.classList.contains('active')) {
            // Im Game-Screen: Verwende große Player-Video-Slots
            selector = '#game-screen .player-video-slot:not(.active):not([data-is-local="true"]):not([data-peer-id])';
        } else {
            // Im Lobby-Screen: Verwende Mini-Video-Slots
            selector = '#lobby-screen .mini-video-slot:not(.active):not([data-is-local="true"]):not([data-peer-id])';
        }
        
        const slots = document.querySelectorAll(selector);
        return slots.length > 0 ? slots[0] : null;
    }

    async createOffer(peerId) {
        const peerData = this.peerConnections.get(peerId);
        if (!peerData) return;

        try {
            console.log(`🎯 Erstelle Offer für: ${peerData.name}`);
            
            const offer = await peerData.connection.createOffer();
            await peerData.connection.setLocalDescription(offer);
            
            socket.emit('webrtc-offer', {
                target: peerId,
                offer: offer,
                lobbyCode: currentLobbyCode
            });
            
            console.log(`📤 Offer gesendet an: ${peerData.name}`);
        } catch (error) {
            console.error('❌ Fehler beim Erstellen des Offers:', error);
        }
    }

    async handleOffer(data) {
        console.log('📨 Offer empfangen von:', data.from);
        const { from, offer } = data;
        
        // Peer Connection erstellen falls noch nicht vorhanden
        if (!this.peerConnections.has(from)) {
            const playerName = getPlayerNameById(from);
            console.log(`🔗 Erstelle Peer Connection für eingehenden Offer von: ${playerName}`);
            this.createPeerConnection(from, playerName);
        }
        
        const peerData = this.peerConnections.get(from);
        const peerConnection = peerData.connection;
        
        try {
            console.log('📝 Setze Remote Description (Offer)...');
            await peerConnection.setRemoteDescription(offer);
            
            console.log('💬 Erstelle Answer...');
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            console.log('📤 Sende Answer zurück an:', peerData.name);
            socket.emit('webrtc-answer', {
                target: from,
                answer: answer,
                lobbyCode: currentLobbyCode
            });
        } catch (error) {
            console.error('❌ Fehler bei Offer-Verarbeitung:', error);
        }
    }

    async handleAnswer(data) {
        console.log('📨 Answer empfangen von:', data.from);
        const { from, answer } = data;
        
        const peerData = this.peerConnections.get(from);
        
        if (peerData) {
            try {
                console.log('📝 Setze Remote Description (Answer)...');
                await peerData.connection.setRemoteDescription(answer);
                console.log('✅ Answer verarbeitet für:', peerData.name);
            } catch (error) {
                console.error('❌ Fehler bei Answer-Verarbeitung:', error);
            }
        } else {
            console.error('❌ Keine Peer Connection gefunden für Answer von:', from);
        }
    }

    async handleIceCandidate(data) {
        console.log('🧊 ICE Candidate empfangen von:', data.from);
        const { from, candidate } = data;
        
        const peerData = this.peerConnections.get(from);
        
        if (peerData) {
            try {
                await peerData.connection.addIceCandidate(candidate);
                console.log('✅ ICE Candidate hinzugefügt für:', peerData.name);
            } catch (error) {
                console.error('❌ Fehler bei ICE-Candidate:', error);
            }
        } else {
            console.error('❌ Keine Peer Connection gefunden für ICE Candidate von:', from);
        }
    }
}

// Globale WebRTC Manager Instanz
const webrtc = new WebRTCManager();

function initializeWebRTC() {
    console.log('🔄 WebRTC initialisiert für Lobby:', currentLobbyCode);
}

function setupVideoCallControls() {
    // Video Call beitreten (Lobby)
    const joinLobbyBtn = document.getElementById('join-video-call-lobby');
    if (joinLobbyBtn) {
        joinLobbyBtn.addEventListener('click', joinVideoCall);
    }
    
    // Video Call verlassen (Lobby)
    const leaveLobbyBtn = document.getElementById('leave-video-call-lobby');
    if (leaveLobbyBtn) {
        leaveLobbyBtn.addEventListener('click', leaveVideoCall);
    }
    
    // Video Call beitreten (Spiel)
    const joinGameBtn = document.getElementById('join-video-call');
    if (joinGameBtn) {
        joinGameBtn.addEventListener('click', joinVideoCall);
    }
    
    // Audio/Video Controls
    const toggleAudioBtn = document.getElementById('toggle-audio');
    const toggleVideoBtn = document.getElementById('toggle-video');
    const leaveCallBtn = document.getElementById('leave-call');
    
    if (toggleAudioBtn) toggleAudioBtn.addEventListener('click', toggleAudio);
    if (toggleVideoBtn) toggleVideoBtn.addEventListener('click', toggleVideo);
    if (leaveCallBtn) leaveCallBtn.addEventListener('click', leaveVideoCall);
    
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
    console.log('🎬 Starte Video Call...');
    
    // Sicherheitsprüfung
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isSecure) {
        showNotification('🔒 HTTPS erforderlich für Webcam-Zugriff!', 'error');
        return;
    }

    try {
        // 1. Lokalen Video-Stream initialisieren
        await webrtc.initializeLocalStream();
        
        // 2. Eigenes Video anzeigen
        displayMyVideo(webrtc.localStream);
        
        // 3. UI aktualisieren
        isInCall = true;
        webrtc.isInCall = true;
        updateCallUI();
        updateCallStatus();
        updateLobbyCallUI();
        
        // 4. Audio/Video-Buttons aktivieren
        enableMediaControls();
        
        // 5. Anderen Spielern Beitritt mitteilen
        socket.emit('player-joined-call', {
            lobbyCode: currentLobbyCode,
            playerName: isAdmin ? currentLobby.adminName : getPlayerName(),
            playerId: socket.id
        });
        
        // 5. Peer Connections für bereits im Call befindliche Spieler erstellen
        setupPeerConnectionsForExistingPlayers();
        
        showNotification('📹 Video Call gestartet! Verbinde mit anderen Spielern...', 'success');
        
    } catch (error) {
        console.error('❌ Fehler beim Video Call:', error);
        handleMediaError(error);
    }
}

function setupPeerConnectionsForExistingPlayers() {
    console.log('🔗 Erstelle Peer Connections für existierende Spieler...');
    
    // Alle anderen Spieler in der Lobby finden
    const otherPlayers = [];
    
    if (isAdmin) {
        // Als Admin: Verbinde mit allen Spielern
        currentLobby.players.forEach(player => {
            if (player.id !== socket.id) {
                otherPlayers.push({ id: player.id, name: player.name });
            }
        });
    } else {
        // Als Spieler: Verbinde mit Admin und anderen Spielern
        if (currentLobby.admin !== socket.id) {
            otherPlayers.push({ id: currentLobby.admin, name: currentLobby.adminName });
        }
        
        currentLobby.players.forEach(player => {
            if (player.id !== socket.id) {
                otherPlayers.push({ id: player.id, name: player.name });
            }
        });
    }
    
    console.log(`� Gefunden ${otherPlayers.length} andere Spieler:`, otherPlayers.map(p => p.name));
    
    // Für jeden anderen Spieler eine Peer Connection erstellen
    otherPlayers.forEach(player => {
        webrtc.createPeerConnection(player.id, player.name);
        
        // Als niedrigste Socket-ID initiieren (verhindert doppelte Offers)
        if (socket.id < player.id) {
            setTimeout(() => {
                console.log(`🎯 Initiiere Verbindung zu: ${player.name}`);
                webrtc.createOffer(player.id);
            }, 1000 + Math.random() * 500); // Zufällig verzögert für Stabilität
        }
    });
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
        webrtc.localStream = await navigator.mediaDevices.getUserMedia({ 
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
        
        // NEUER WEBRTC MANAGER - Stream zuweisen und anzeigen
        webrtc.isInCall = true;
        displayMyVideo(webrtc.localStream);
        enableMediaControls();
        
        showNotification('📹 Video Call mit niedriger Qualität gestartet', 'success');
        
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

// WebRTC Peer-to-Peer Verbindungen für alle Spieler
function setupPeerConnections() {
    console.log('🚀 Stelle WebRTC Verbindungen her...');
    
    // Liste aller anderen Spieler erstellen
    const otherPlayers = [];
    
    if (isAdmin) {
        // Als Admin: Verbinde mit allen Spielern
        currentLobby.players.forEach(player => {
            if (player.id !== socket.id) {
                otherPlayers.push({ id: player.id, name: player.name });
            }
        });
    } else {
        // Als Spieler: Verbinde mit Admin und anderen Spielern
        if (currentLobby.admin !== socket.id) {
            otherPlayers.push({ id: currentLobby.admin, name: currentLobby.adminName });
        }
        
        currentLobby.players.forEach(player => {
            if (player.id !== socket.id) {
                otherPlayers.push({ id: player.id, name: player.name });
            }
        });
    }
    
    console.log('👥 Verbinde mit Spielern:', otherPlayers.map(p => p.name));
    
    // *** ALTE LOGIK ENTFERNT - NUTZE NUR WEBRTC MANAGER ***
    console.log('⚠️ Alte setupVideoCall() Funktion wird nicht mehr verwendet!');
}

// *** ALLE ALTEN WEBRTC-FUNKTIONEN ENTFERNT - NUR WEBRTC MANAGER VERWENDEN ***

// *** ALTE HANDLER ENTFERNT - NUTZE NUR WEBRTC MANAGER ***

function getPlayerNameById(playerId) {
    if (playerId === currentLobby.admin) {
        return currentLobby.adminName;
    }
    
    const player = currentLobby.players.find(p => p.id === playerId);
    return player ? player.name : 'Unbekannt';
}

function displayMyVideo(stream) {
    console.log('🖥️ Zeige eigenes Video einmalig...');
    
    // Erst alle existierenden eigenen Videos entfernen
    clearMyExistingVideos();
    
    // Dann Video nur an EINER Stelle anzeigen basierend auf aktivem Screen
    if (screens.game.classList.contains('active')) {
        console.log('📍 Game aktiv - zeige Video NUR im Game-Screen');
        displayMyVideoInGame(stream);
    } else {
        console.log('📍 Lobby aktiv - zeige Video NUR in Lobby-Vorschau');
        displayMyVideoInLobby(stream);
    }
}

function clearMyExistingVideos() {
    console.log('🧹 Entferne alle existierenden eigenen Videos...');
    
    // Alle Video-Slots mit eigenem Video finden und zurücksetzen
    const myVideoSlots = document.querySelectorAll('.player-video-slot[data-is-local="true"], .mini-video-slot[data-is-local="true"]');
    
    myVideoSlots.forEach(slot => {
        const video = slot.querySelector('.player-video, .mini-video');
        const placeholder = slot.querySelector('.video-placeholder');
        const overlay = slot.querySelector('.video-overlay');
        
        if (video) {
            video.srcObject = null;
            video.style.display = 'none';
        }
        
        if (placeholder) {
            placeholder.style.display = 'flex';
        }
        
        if (overlay) {
            overlay.remove();
        }
        
        slot.classList.remove('active');
        slot.removeAttribute('data-is-local');
        slot.removeAttribute('data-player-id');
        slot.removeAttribute('data-peer-id');
        
        const label = slot.querySelector('.player-label');
        if (label) {
            label.textContent = '';
        }
    });
    
    console.log(`🧹 ${myVideoSlots.length} eigene Video-Slots bereinigt`);
    
    // Reset globale Variable
    myVideoSlot = null;
}

function clearAllRemoteVideos() {
    console.log('🧹 Entferne alle Remote-Videos...');
    
    // Alle Remote-Video-Slots finden und zurücksetzen (sowohl große als auch Mini-Slots)
    const remoteVideoSlots = document.querySelectorAll('.player-video-slot[data-peer-id], .mini-video-slot[data-peer-id]');
    
    remoteVideoSlots.forEach(slot => {
        const video = slot.querySelector('.player-video, .mini-video');
        const placeholder = slot.querySelector('.video-placeholder');
        const overlay = slot.querySelector('.video-overlay');
        
        if (video) {
            video.srcObject = null;
            video.style.display = 'none';
        }
        
        if (placeholder) {
            placeholder.style.display = 'flex';
        }
        
        if (overlay) {
            overlay.remove();
        }
        
        slot.classList.remove('active');
        slot.removeAttribute('data-peer-id');
        
        const label = slot.querySelector('.player-label');
        if (label) {
            label.textContent = 'Wartet auf Beitritt...';
        }
    });
    
    console.log(`🧹 ${remoteVideoSlots.length} Remote-Video-Slots bereinigt`);
}

function displayMyVideoInGame(stream) {
    const playerSlot = isAdmin ? 
        document.getElementById('admin-video') : 
        getAvailableVideoSlot();
    
    if (playerSlot) {
        myVideoSlot = playerSlot;
        const video = playerSlot.querySelector('.player-video');
        const placeholder = playerSlot.querySelector('.video-placeholder');
        
        video.srcObject = stream;
        video.muted = true; // Eigenes Video stumm schalten
        video.autoplay = true;
        video.playsInline = true;
        video.style.display = 'block';
        placeholder.style.display = 'none';
        
        playerSlot.classList.add('active');
        if (isAdmin) playerSlot.classList.add('admin');
        
        // Player Name aktualisieren
        const label = playerSlot.querySelector('.player-label');
        if (label) {
            label.textContent = `${isAdmin ? currentLobby.adminName : getPlayerName()} (Du)`;
        }
        
        // Video Status Overlay hinzufügen
        addVideoStatusOverlay(playerSlot);
        
        // Markiere als eigenes Video
        playerSlot.setAttribute('data-player-id', socket.id);
        playerSlot.setAttribute('data-is-local', 'true');
        
        console.log('✅ Eigenes Video angezeigt in Game-Slot:', playerSlot.id);
    }
}

function displayMyVideoInLobby(stream) {
    // Video auch in der Lobby-Vorschau anzeigen
    const lobbySlot = isAdmin ? 
        document.getElementById('lobby-admin-video') : 
        getAvailableLobbyVideoSlot();
    
    if (lobbySlot) {
        const video = lobbySlot.querySelector('.mini-video');
        const placeholder = lobbySlot.querySelector('.video-placeholder');
        
        video.srcObject = stream;
        video.muted = true;
        video.style.display = 'block';
        placeholder.style.display = 'none';
        
        lobbySlot.classList.add('active');
        
        // Player Name aktualisieren
        const label = lobbySlot.querySelector('.player-label');
        if (label) {
            label.textContent = isAdmin ? currentLobby.adminName : getPlayerName();
        }
        
        // Lobby Video Preview anzeigen
        const lobbyPreview = document.getElementById('lobby-video-preview');
        if (lobbyPreview) {
            lobbyPreview.style.display = 'block';
        }
        
        console.log('✅ Eigenes Video angezeigt in Lobby-Slot:', lobbySlot.id);
    }
}

function getAvailableLobbyVideoSlot() {
    // Ersten verfügbaren Spieler-Slot in der Lobby finden
    for (let i = 1; i <= 4; i++) {
        const slot = document.getElementById(`lobby-player${i}-video`);
        if (slot && !slot.classList.contains('active')) {
            return slot;
        }
    }
    return null;
}

function getAvailableVideoSlot() {
    // Admin-Slot für Admin reservieren
    if (isAdmin) {
        return document.getElementById('admin-video');
    }
    
    // Ersten verfügbaren Spieler-Slot finden
    for (let i = 1; i <= 4; i++) {
        const slot = document.getElementById(`player${i}-video`);
        if (slot && !slot.classList.contains('active')) {
            return slot;
        }
    }
    return null;
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
    console.log('🎤 Toggle Audio aufgerufen...');
    
    // Verwende den Stream aus der WebRTC-Manager-Klasse
    if (webrtc.localStream) {
        const audioTracks = webrtc.localStream.getAudioTracks();
        console.log(`🔍 Gefundene Audio-Tracks: ${audioTracks.length}`);
        
        if (audioTracks.length > 0) {
            localAudioEnabled = !localAudioEnabled;
            audioTracks[0].enabled = localAudioEnabled;
            
            updateAudioButton();
            updateVideoStatusOverlay();
            
            showNotification(localAudioEnabled ? '🎤 Mikrofon aktiviert' : '🔇 Mikrofon deaktiviert', 'info');
            console.log(`🎤 Audio ${localAudioEnabled ? 'aktiviert' : 'deaktiviert'}`);
        } else {
            console.warn('⚠️ Keine Audio-Tracks gefunden');
            showNotification('❌ Kein Mikrofon gefunden', 'error');
        }
    } else {
        console.warn('⚠️ Kein lokaler Stream verfügbar');
        showNotification('❌ Kein Audio-Stream aktiv. Erst Video Call beitreten!', 'error');
    }
}

function toggleVideo() {
    console.log('📹 Toggle Video aufgerufen...');
    
    // Verwende den Stream aus der WebRTC-Manager-Klasse
    if (webrtc.localStream) {
        const videoTracks = webrtc.localStream.getVideoTracks();
        console.log(`🔍 Gefundene Video-Tracks: ${videoTracks.length}`);
        
        if (videoTracks.length > 0) {
            localVideoEnabled = !localVideoEnabled;
            videoTracks[0].enabled = localVideoEnabled;
            
            updateVideoButton();
            updateVideoStatusOverlay();
            
            showNotification(localVideoEnabled ? '📹 Kamera aktiviert' : '📷 Kamera deaktiviert', 'info');
            console.log(`📹 Video ${localVideoEnabled ? 'aktiviert' : 'deaktiviert'}`);
        } else {
            console.warn('⚠️ Keine Video-Tracks gefunden');
            showNotification('❌ Keine Kamera gefunden', 'error');
        }
    } else {
        console.warn('⚠️ Kein lokaler Stream verfügbar');
        showNotification('❌ Kein Video-Stream aktiv. Erst Video Call beitreten!', 'error');
    }
}

function updateAudioButton() {
    const audioBtn = document.getElementById('toggle-audio');
    if (audioBtn) {
        audioBtn.className = `btn ${localAudioEnabled ? 'btn-success' : 'btn-danger'}`;
        audioBtn.innerHTML = `<i class="icon">${localAudioEnabled ? '🎤' : '🔇'}</i> Mikro`;
        console.log('🎤 Audio-Button aktualisiert:', localAudioEnabled ? 'An' : 'Aus');
    }
}

function updateVideoButton() {
    const videoBtn = document.getElementById('toggle-video');
    if (videoBtn) {
        videoBtn.className = `btn ${localVideoEnabled ? 'btn-success' : 'btn-danger'}`;
        videoBtn.innerHTML = `<i class="icon">${localVideoEnabled ? '📹' : '📷'}</i> Kamera`;
        console.log('📹 Video-Button aktualisiert:', localVideoEnabled ? 'An' : 'Aus');
    }
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
    // NEUER WEBRTC MANAGER - Stream cleanup
    if (webrtc.localStream) {
        webrtc.localStream.getTracks().forEach(track => track.stop());
        webrtc.localStream = null;
        webrtc.isInCall = false;
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
    
    // Lobby Video auch zurücksetzen
    resetLobbyVideo();
    
    isInCall = false;
    localAudioEnabled = true;
    localVideoEnabled = true;
    
    updateCallUI();
    updateCallStatus();
    updateLobbyCallUI();
    
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

// Video-Hilfsfunktionen
function removePlayerVideoByName(playerName) {
    // Alle Video-Slots durchsuchen und den entsprechenden Spieler finden
    const allVideoSlots = document.querySelectorAll('.player-video-slot[data-player-id]');
    
    allVideoSlots.forEach(slot => {
        const label = slot.querySelector('.player-label');
        if (label && label.textContent.includes(playerName)) {
            resetVideoSlot(slot);
        }
    });
}

function removePlayerVideo(playerId) {
    const playerSlot = document.querySelector(`[data-player-id="${playerId}"]`);
    if (playerSlot && playerSlot !== myVideoSlot) {
        resetVideoSlot(playerSlot);
    }
}

function getPlayerName() {
    return document.getElementById('player-name').value || 'Spieler';
}

function transferVideosToGameScreen() {
    console.log('🔄 Übertrage Videos von Lobby zu Game-Screen...');
    
    // Eigenes Video übertragen
    if (webrtc.localStream) {
        // Lobby Video zurücksetzen
        resetLobbyVideo();
        
        // Eigenes Video im Game-Screen anzeigen
        displayMyVideoInGame(webrtc.localStream);
    }
    
    // Remote Videos übertragen
    webrtc.peerConnections.forEach((peerData, peerId) => {
        const connection = peerData.connection;
        
        // Hole Remote Stream aus der Peer Connection
        const remoteStreams = connection.getRemoteStreams ? connection.getRemoteStreams() : [];
        
        if (remoteStreams.length > 0) {
            console.log(`🔄 Übertrage Remote Video von: ${peerData.name}`);
            webrtc.displayRemoteVideo(peerId, peerData.name, remoteStreams[0]);
        }
    });
}

function updateLobbyCallUI() {
    // Lobby Call Status aktualisieren
    const lobbyStatus = document.getElementById('lobby-call-status');
    const lobbyParticipants = document.getElementById('lobby-call-participants');
    const joinBtn = document.getElementById('join-video-call-lobby');
    const leaveBtn = document.getElementById('leave-video-call-lobby');
    
    if (lobbyStatus && lobbyParticipants) {
        const participantCount = Object.keys(peerConnections).length + (isInCall ? 1 : 0);
        lobbyParticipants.textContent = `${participantCount}/5 Teilnehmer`;
        
        const indicator = lobbyStatus.querySelector('.status-indicator');
        if (indicator) {
            indicator.textContent = isInCall ? '🟢' : '🔴';
        }
    }
    
    if (joinBtn && leaveBtn) {
        if (isInCall) {
            joinBtn.style.display = 'none';
            leaveBtn.style.display = 'block';
        } else {
            joinBtn.style.display = 'block';
            leaveBtn.style.display = 'none';
        }
    }
}

function resetLobbyVideo() {
    // Alle aktiven Lobby-Video-Slots zurücksetzen
    const activeSlots = document.querySelectorAll('.mini-video-slot.active');
    
    activeSlots.forEach(slot => {
        const video = slot.querySelector('.mini-video');
        const placeholder = slot.querySelector('.video-placeholder');
        
        video.style.display = 'none';
        video.srcObject = null;
        placeholder.style.display = 'flex';
        slot.classList.remove('active');
    });
    
    // Lobby Video Preview verstecken
    const lobbyPreview = document.getElementById('lobby-video-preview');
    if (lobbyPreview) {
        lobbyPreview.style.display = 'none';
    }
}

// Media Controls Management
function enableMediaControls() {
    console.log('Aktiviere Media-Controls...');
    
    // Audio-Button aktivieren
    const audioBtn = document.getElementById('toggle-audio');
    if (audioBtn) {
        audioBtn.disabled = false;
        audioBtn.style.opacity = '1';
        console.log('Audio-Button aktiviert');
    }
    
    // Video-Button aktivieren  
    const videoBtn = document.getElementById('toggle-video');
    if (videoBtn) {
        videoBtn.disabled = false;
        videoBtn.style.opacity = '1';
        console.log('Video-Button aktiviert');
    }
    
    // Initial button states basierend auf Stream-Status setzen
    if (webrtc.localStream) {
        const audioTrack = webrtc.localStream.getAudioTracks()[0];
        const videoTrack = webrtc.localStream.getVideoTracks()[0];
        
        if (audioTrack && audioBtn) {
            audioBtn.textContent = audioTrack.enabled ? '🎤' : '🔇';
            console.log('Audio-Status:', audioTrack.enabled ? 'An' : 'Aus');
        }
        
        if (videoTrack && videoBtn) {
            videoBtn.textContent = videoTrack.enabled ? '📹' : '📵';
            console.log('Video-Status:', videoTrack.enabled ? 'An' : 'Aus');
        }
    }
}

// Cleanup beim Verlassen der Seite
window.addEventListener('beforeunload', () => {
    // NEUER WEBRTC MANAGER - Alle Connections schließen
    webrtc.peerConnections.forEach((peerData) => {
        peerData.connection.close();
    });
    
    // Video Stream stoppen
    if (webrtc.localStream) {
        webrtc.localStream.getTracks().forEach(track => track.stop());
    }
    
    console.log('Spiel verlassen - Ressourcen bereinigt');
});