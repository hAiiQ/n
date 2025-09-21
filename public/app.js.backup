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
    
    // WebRTC Verbindung schließen falls vorhanden (NEUER WEBRTC MANAGER)
    const leftPlayerId = data.removedPlayer;
    
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
        this.availableDevices = {
            video: [],
            audio: []
        };
    }

    async getAvailableDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableDevices.video = devices.filter(device => device.kind === 'videoinput');
            this.availableDevices.audio = devices.filter(device => device.kind === 'audioinput');
            
            console.log(`📹 Verfügbare Kameras: ${this.availableDevices.video.length}`);
            console.log(`🎤 Verfügbare Mikrofone: ${this.availableDevices.audio.length}`);
            
            return this.availableDevices;
        } catch (error) {
            console.error('❌ Fehler beim Abrufen der Geräte:', error);
            return null;
        }
    }

    async initializeLocalStream(retryOptions = {}) {
        console.log('🎥 Initialisiere lokalen Stream...', retryOptions);
        
        const strategies = [
            // Strategie 1: Spezifische Device ID (für Elgato Cam Link etc.)
            ...(retryOptions.deviceId ? [{
                video: { 
                    deviceId: { exact: retryOptions.deviceId },
                    width: { ideal: 1920, min: 640 }, 
                    height: { ideal: 1080, min: 480 },
                    frameRate: { ideal: 30, min: 15 }
                },
                audio: {
                    echoCancellation: false,  // Für Capture-Devices oft besser
                    noiseSuppression: false,
                    autoGainControl: false
                },
                name: `Capture Device: ${retryOptions.deviceLabel || 'Unbekannt'}`
            }] : []),
            // Strategie 2: Optimale Qualität (normale Webcams)
            {
                video: { 
                    width: { ideal: 640, max: 1280 }, 
                    height: { ideal: 480, max: 720 },
                    facingMode: 'user'
                }, 
                audio: { 
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                name: 'Optimale Qualität'
            },
            // Strategie 2: Niedrigere Qualität
            {
                video: { 
                    width: { ideal: 320, max: 640 }, 
                    height: { ideal: 240, max: 480 }
                }, 
                audio: { 
                    echoCancellation: true
                },
                name: 'Mittlere Qualität'
            },
            // Strategie 3: Minimale Qualität
            {
                video: { 
                    width: 320, 
                    height: 240
                }, 
                audio: true,
                name: 'Niedrige Qualität'
            },
            // Strategie 4: Nur Audio
            {
                video: false,
                audio: true,
                name: 'Nur Audio'
            },
            // Strategie 5: Spezifische Device ID (falls angegeben)
            ...(retryOptions.deviceId ? [{
                video: { deviceId: { exact: retryOptions.deviceId } },
                audio: true,
                name: 'Alternative Kamera'
            }] : [])
        ];

        for (let i = 0; i < strategies.length; i++) {
            try {
                console.log(`🎥 Versuche Strategie ${i + 1}: ${strategies[i].name}...`);
                
                this.localStream = await navigator.mediaDevices.getUserMedia(strategies[i]);
                
                // Detaillierte Stream-Info loggen
                const videoTracks = this.localStream.getVideoTracks();
                const audioTracks = this.localStream.getAudioTracks();
                
                console.log(`✅ Lokaler Stream erfolgreich erstellt mit: ${strategies[i].name}`);
                console.log(`📹 Video Tracks: ${videoTracks.length}`);
                console.log(`🎤 Audio Tracks: ${audioTracks.length}`);
                
                if (videoTracks.length > 0) {
                    const videoTrack = videoTracks[0];
                    const settings = videoTrack.getSettings();
                    const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
                    
                    console.log('📊 Video Track Details:');
                    console.log('  - Label:', videoTrack.label);
                    console.log('  - Enabled:', videoTrack.enabled);
                    console.log('  - Ready State:', videoTrack.readyState);
                    console.log('  - Settings:', settings);
                    
                    // Spezielle Meldung für Capture-Devices
                    if (videoTrack.label.toLowerCase().includes('cam link') || 
                        videoTrack.label.toLowerCase().includes('elgato')) {
                        console.log('🎥 ELGATO CAM LINK ERKANNT!');
                        showNotification(`🎥 Elgato Cam Link aktiv: ${settings.width}x${settings.height}@${settings.frameRate}fps`, 'success');
                    }
                } else {
                    showNotification('⚠️ Nur Audio verfügbar - keine Kamera gefunden', 'warning');
                }
                
                return this.localStream;

            } catch (error) {
                console.warn(`❌ Strategie ${i + 1} fehlgeschlagen:`, error.name);
                
                if (i === strategies.length - 1) {
                    // Alle Strategien fehlgeschlagen
                    throw error;
                }
            }
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

        // Connection State Handler (erweitert)
        peerConnection.onconnectionstatechange = () => {
            console.log(`🔗 Peer Connection zu ${peerName}: ${peerConnection.connectionState}`);
            
            if (peerConnection.connectionState === 'connected') {
                console.log(`✅ Peer ${peerName} erfolgreich verbunden!`);
                showNotification(`✅ Verbunden mit ${peerName}`, 'success');
            } else if (peerConnection.connectionState === 'failed') {
                console.error(`❌ Peer Connection zu ${peerName} fehlgeschlagen!`);
                showNotification(`❌ Verbindung zu ${peerName} fehlgeschlagen - Versuche Reconnect`, 'error');
                // Automatischer Reconnect-Versuch
                setTimeout(() => {
                    console.log(`🔄 Versuche Reconnect zu ${peerName}...`);
                    this.reconnectToPeer(peerId, peerName);
                }, 2000);
            } else if (peerConnection.connectionState === 'disconnected') {
                console.warn(`⚠️ Peer ${peerName} getrennt`);
                showNotification(`⚠️ ${peerName} getrennt`, 'warning');
            }
        };
        
        // ICE Connection State Handler (zusätzlich)
        peerConnection.oniceconnectionstatechange = () => {
            console.log(`🧊 ICE Connection zu ${peerName}: ${peerConnection.iceConnectionState}`);
            
            if (peerConnection.iceConnectionState === 'failed') {
                console.error(`❌ ICE Connection zu ${peerName} fehlgeschlagen!`);
                showNotification(`❌ ICE Verbindung zu ${peerName} fehlgeschlagen`, 'error');
            } else if (peerConnection.iceConnectionState === 'connected') {
                console.log(`✅ ICE zu ${peerName} erfolgreich!`);
            } else if (peerConnection.iceConnectionState === 'disconnected') {
                console.warn(`⚠️ ICE zu ${peerName} getrennt`);
            }
        };
        
        // Gathering State Handler
        peerConnection.onicegatheringstatechange = () => {
            console.log(`📊 ICE Gathering zu ${peerName}: ${peerConnection.iceGatheringState}`);
        };

        this.peerConnections.set(peerId, { connection: peerConnection, name: peerName });
        return peerConnection;
    }

    // Reconnect zu einem Peer versuchen
    async reconnectToPeer(peerId, peerName) {
        console.log(`🔄 Versuche Reconnect zu ${peerName}...`);
        
        // Alte Connection entfernen
        if (this.peerConnections.has(peerId)) {
            const oldPeerData = this.peerConnections.get(peerId);
            oldPeerData.connection.close();
            this.peerConnections.delete(peerId);
        }
        
        // Neue Connection erstellen
        this.createPeerConnection(peerId, peerName);
        
        // Neuen Offer senden
        await this.createOffer(peerId);
    }

    displayRemoteVideo(peerId, peerName, stream) {
        console.log(`🖥️ Zeige Remote Video für: ${peerName} (${peerId})`);
        
        if (!stream) {
            console.error(`❌ Kein Stream für Remote Video von ${peerName}!`);
            return;
        }
        
        // Stream-Details loggen
        const videoTracks = stream.getVideoTracks();
        const audioTracks = stream.getAudioTracks();
        console.log(`📊 Remote Stream von ${peerName}: ${videoTracks.length} Video, ${audioTracks.length} Audio`);
        
        // ERSTE: Prüfen ob bereits ein Video für diesen Peer existiert
        const existingSlot = document.querySelector(`[data-peer-id="${peerId}"]`);
        if (existingSlot) {
            console.log(`⚠️ Video für ${peerName} existiert bereits - aktualisiere Stream`);
            const video = existingSlot.querySelector('.player-video, .mini-video');
            if (video) {
                video.srcObject = stream;
                console.log(`✅ Remote Video für ${peerName} aktualisiert`);
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
                
                // Video Load Event für Remote Videos
                video.addEventListener('loadedmetadata', () => {
                    console.log(`✅ Remote Video Metadata geladen für ${peerName}: ${video.videoWidth}x${video.videoHeight}`);
                    showNotification(`📺 Video von ${peerName} empfangen`, 'success');
                });
                
                video.addEventListener('error', (e) => {
                    console.error(`❌ Remote Video Fehler für ${peerName}:`, e);
                    showNotification(`❌ Video-Problem mit ${peerName}`, 'error');
                });
                
                console.log(`✅ Remote Video konfiguriert für: ${peerName} in Slot: ${videoSlot.id || 'unknown'}`);
            }
        } else {
            console.warn(`⚠️ Kein verfügbarer Video-Slot für: ${peerName}`);
        }
    }

    findAvailableVideoSlot() {
        console.log('🔍 Suche verfügbaren Video-Slot...');
        
        // Prüfe welcher Screen aktiv ist und verwende die entsprechenden Video-Slots
        let selector = '';
        
        if (screens.game.classList.contains('active')) {
            // Im Game-Screen: Verwende große Player-Video-Slots
            selector = '#game-screen .player-video-slot:not(.active):not([data-is-local="true"]):not([data-peer-id])';
            console.log('📍 Game-Screen aktiv - suche Player-Video-Slot');
        } else {
            // Im Lobby-Screen: Verwende Mini-Video-Slots
            console.log('📍 Lobby-Screen aktiv - suche Mini-Video-Slot');
            selector = '#lobby-screen .mini-video-slot:not(.active):not([data-is-local="true"]):not([data-peer-id])';
        }
        
        console.log(`🔍 Selector: ${selector}`);
        const slots = document.querySelectorAll(selector);
        console.log(`📊 Gefundene verfügbare Slots: ${slots.length}`);
        
        if (slots.length > 0) {
            console.log(`✅ Verwende Slot: ${slots[0].id || 'unnamed'}`);
            return slots[0];
        } else {
            console.warn('⚠️ Kein verfügbarer Video-Slot gefunden!');
            // Debug: Zeige alle vorhandenen Slots
            const allSlots = document.querySelectorAll('.player-video-slot, .mini-video-slot');
            console.log(`📋 Alle Video-Slots (${allSlots.length}):`);
            allSlots.forEach((slot, index) => {
                console.log(`  ${index + 1}. ${slot.id || 'unnamed'} - active: ${slot.classList.contains('active')}, local: ${slot.getAttribute('data-is-local')}, peer: ${slot.getAttribute('data-peer-id')}`);
            });
            return null;
        }
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
    
    // Starte regelmäßige Connection-Diagnose
    startConnectionMonitoring();
}

// Regelmäßige Überwachung der Peer-Connections
function startConnectionMonitoring() {
    setInterval(() => {
        if (webrtc.peerConnections.size > 0) {
            console.log('🔍 Connection Status Check:');
            webrtc.peerConnections.forEach((peerData, peerId) => {
                const conn = peerData.connection;
                console.log(`  - ${peerData.name}: Connection=${conn.connectionState}, ICE=${conn.iceConnectionState}, Gathering=${conn.iceGatheringState}`);
                
                // Warnung bei problematischen States
                if (conn.connectionState === 'failed' || conn.iceConnectionState === 'failed') {
                    console.warn(`⚠️ Problematische Connection zu ${peerData.name}!`);
                } else if (conn.connectionState === 'disconnected') {
                    console.warn(`⚠️ ${peerData.name} getrennt!`);
                }
            });
        }
    }, 10000); // Alle 10 Sekunden
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
    
    // Geräte-Debug Button
    const deviceDebugBtn = document.getElementById('device-debug-btn');
    if (deviceDebugBtn) {
        deviceDebugBtn.addEventListener('click', showDeviceDebugInfo);
    }
    
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
        // 0. Automatische Elgato Cam Link Erkennung
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const elgatoDevices = devices.filter(device => 
                device.kind === 'videoinput' && 
                (device.label.toLowerCase().includes('cam link') || 
                 device.label.toLowerCase().includes('elgato'))
            );
            
            if (elgatoDevices.length > 0) {
                console.log(`🎥 ${elgatoDevices.length} Elgato Cam Link(s) erkannt!`);
                showNotification(`🎥 Elgato Cam Link erkannt! Erweiterte Unterstützung aktiviert.`, 'info');
            }
        } catch (detectionError) {
            console.log('ℹ️ Elgato-Erkennung übersprungen:', detectionError.name);
        }
        
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
            message += 'Kamera/Mikrofon wird bereits verwendet. Versuche andere Geräte...';
            // Versuche alternative Geräte
            tryAlternativeDevices();
            return;
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

async function tryAlternativeDevices() {
    try {
        console.log('🔍 Suche nach alternativen Kameras/Mikrofonen...');
        showNotification('🔍 Suche nach alternativen Geräten...', 'info');
        
        // Alle verfügbaren Medien-Geräte auflisten
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        const audioDevices = devices.filter(device => device.kind === 'audioinput');
        
        console.log(`📹 Gefundene Video-Geräte: ${videoDevices.length}`);
        console.log(`🎤 Gefundene Audio-Geräte: ${audioDevices.length}`);
        
        // Spezielle Erkennung für Capture-Devices
        const captureDevices = videoDevices.filter(device => 
            device.label.toLowerCase().includes('cam link') ||
            device.label.toLowerCase().includes('capture') ||
            device.label.toLowerCase().includes('elgato') ||
            device.label.toLowerCase().includes('obs') ||
            device.label.toLowerCase().includes('streamlabs') ||
            device.label.toLowerCase().includes('hdmi')
        );
        
        if (captureDevices.length > 0) {
            console.log(`🎥 Gefundene Capture-Devices: ${captureDevices.length}`);
            captureDevices.forEach(device => {
                console.log(`  - ${device.label || 'Unbekanntes Capture-Device'}`);
            });
            showNotification(`🎥 ${captureDevices.length} Capture-Device(s) gefunden (Elgato, HDMI etc.)`, 'info');
        }
        
        // Priorisiere Capture-Devices (Elgato Cam Link, HDMI Capture etc.)
        let devicesToTry = [];
        if (captureDevices.length > 0) {
            console.log('🎥 Versuche Capture-Devices zuerst...');
            devicesToTry = [...captureDevices, ...videoDevices.filter(d => !captureDevices.includes(d))];
        } else {
            devicesToTry = videoDevices;
        }
        
        // Versuche jede verfügbare Kamera (Capture-Devices haben Priorität)
        for (let videoDevice of devicesToTry) {
            try {
                const deviceLabel = videoDevice.label || 'Unbekannte Kamera';
                const isCaptureDevice = captureDevices.includes(videoDevice);
                
                console.log(`🎯 Versuche ${isCaptureDevice ? 'Capture-Device' : 'Kamera'}: ${deviceLabel}`);
                
                // Spezielle Constraints für Capture-Devices
                const constraints = {
                    deviceId: videoDevice.deviceId,
                    ...(isCaptureDevice && {
                        // Höhere Auflösung für Capture-Devices
                        width: { ideal: 1920, min: 1280 },
                        height: { ideal: 1080, min: 720 },
                        frameRate: { ideal: 30, min: 15 }
                    })
                };
                
                await webrtc.initializeLocalStream({ deviceId: constraints.deviceId });
                
                // Erfolg! Zeige Video an
                displayMyVideo(webrtc.localStream);
                webrtc.isInCall = true;
                enableMediaControls();
                updateCallUI();
                updateCallStatus();
                updateLobbyCallUI();
                
                if (isCaptureDevice) {
                    showNotification(`🎥 Capture-Device erfolgreich aktiviert: ${deviceLabel}`, 'success');
                }
                
                // Anderen Spielern Beitritt mitteilen
                socket.emit('player-joined-call', {
                    lobbyCode: currentLobbyCode,
                    playerName: isAdmin ? currentLobby.adminName : getPlayerName(),
                    playerId: socket.id
                });
                
                setupPeerConnectionsForExistingPlayers();
                
                showNotification(`✅ Alternative Kamera gefunden: ${videoDevice.label || 'Kamera'}`, 'success');
                return;
                
            } catch (deviceError) {
                console.warn(`❌ Kamera nicht verfügbar: ${videoDevice.label}`, deviceError.name);
            }
        }
        
        // Wenn keine Kamera funktioniert, versuche nur Audio
        try {
            console.log('🎤 Versuche Audio-Only Modus...');
            
            await webrtc.initializeLocalStream();
            
            // Audio-Only erfolgreich
            webrtc.isInCall = true;
            enableMediaControls();
            updateCallUI();
            updateCallStatus();
            updateLobbyCallUI();
            
            socket.emit('player-joined-call', {
                lobbyCode: currentLobbyCode,
                playerName: isAdmin ? currentLobby.adminName : getPlayerName(),
                playerId: socket.id
            });
            
            setupPeerConnectionsForExistingPlayers();
            
            showNotification('🎤 Audio-Only Modus aktiviert - keine Kamera verfügbar', 'warning');
            
        } catch (audioError) {
            console.error('❌ Auch Audio-Only fehlgeschlagen:', audioError);
            showNotification('❌ Kein Zugriff auf Kamera oder Mikrofon möglich. Schließen Sie andere Apps und versuchen Sie es erneut!', 'error');
        }
        
    } catch (error) {
        console.error('❌ Fehler beim Suchen alternativer Geräte:', error);
        showNotification('❌ Geräte-Erkennung fehlgeschlagen. Browser neu laden?', 'error');
    }
}

// Spezielle Diagnose-Funktion für Elgato Cam Link und Capture-Devices
async function diagnoseElgatoCamLink() {
    console.log('🎥 Starte Elgato Cam Link Diagnose...');
    
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        console.log('📊 Alle Video-Geräte:');
        videoDevices.forEach((device, index) => {
            console.log(`  ${index + 1}. ${device.label || 'Unbekanntes Gerät'}`);
            console.log(`     Device ID: ${device.deviceId}`);
            console.log(`     Group ID: ${device.groupId}`);
        });
        
        // Suche nach Elgato/Capture-Devices
        const elgatoDevices = videoDevices.filter(device => 
            device.label.toLowerCase().includes('cam link') ||
            device.label.toLowerCase().includes('elgato') ||
            device.label.toLowerCase().includes('4k60') ||
            device.label.toLowerCase().includes('hd60')
        );
        
        if (elgatoDevices.length === 0) {
            console.log('⚠️ Kein Elgato Cam Link gefunden');
            showNotification('⚠️ Elgato Cam Link nicht erkannt. Ist es angeschlossen und im Elgato Game Capture installiert?', 'warning');
            return;
        }
        
        console.log(`🎥 ${elgatoDevices.length} Elgato Device(s) gefunden:`);
        
        for (const device of elgatoDevices) {
            console.log(`🔍 Teste Elgato Device: ${device.label}`);
            
            // Teste verschiedene Auflösungen für Elgato Cam Link
            const testConfigs = [
                { width: 1920, height: 1080, frameRate: 30, label: '1080p30' },
                { width: 1920, height: 1080, frameRate: 60, label: '1080p60' },
                { width: 1280, height: 720, frameRate: 60, label: '720p60' },
                { width: 1280, height: 720, frameRate: 30, label: '720p30' },
                { width: 640, height: 480, frameRate: 30, label: '480p30' }
            ];
            
            for (const config of testConfigs) {
                try {
                    console.log(`  📏 Teste ${config.label}...`);
                    
                    const testConstraints = {
                        video: {
                            deviceId: { exact: device.deviceId },
                            width: { ideal: config.width },
                            height: { ideal: config.height },
                            frameRate: { ideal: config.frameRate }
                        },
                        audio: true
                    };
                    
                    const testStream = await navigator.mediaDevices.getUserMedia(testConstraints);
                    
                    // Erfolg! Stream Info anzeigen
                    const videoTrack = testStream.getVideoTracks()[0];
                    const settings = videoTrack.getSettings();
                    
                    console.log(`  ✅ ${config.label} funktioniert!`);
                    console.log(`     Tatsächliche Auflösung: ${settings.width}x${settings.height}`);
                    console.log(`     Tatsächliche Framerate: ${settings.frameRate}fps`);
                    
                    showNotification(`✅ Elgato Cam Link funktioniert mit ${config.label} (${settings.width}x${settings.height})`, 'success');
                    
                    // Stream stoppen (nur Test)
                    testStream.getTracks().forEach(track => track.stop());
                    
                    return { device, config, settings };
                    
                } catch (error) {
                    console.log(`  ❌ ${config.label} fehlgeschlagen: ${error.name}`);
                }
            }
        }
        
        console.log('❌ Alle Elgato Cam Link Tests fehlgeschlagen');
        showNotification('❌ Elgato Cam Link gefunden, aber keine funktionierenden Einstellungen. Prüfen Sie die Elgato Game Capture Software.', 'error');
        
    } catch (error) {
        console.error('❌ Elgato Cam Link Diagnose fehlgeschlagen:', error);
        showNotification('❌ Diagnose fehlgeschlagen. Browser-Berechtigungen prüfen?', 'error');
    }
}

function showVideoCallTroubleshooting() {
    const troubleshootMsg = `
🔧 Erweiterte Lösungsvorschläge:

1. 🔒 HTTPS verwenden (automatisch auf Render.com)
2. 🎯 Auf "Zulassen" klicken wenn Browser fragt
3. 📹 Kamera/Mikrofon anschließen und testen
4. 🔄 Andere Apps schließen die Kamera nutzen
5. 🎥 Alternative Kameras werden automatisch gesucht
6. � Audio-Only Modus als Fallback verfügbar
7. �🌐 Chrome, Firefox oder Safari verwenden
8. 📱 Bei mobilen Geräten: App-Berechtigungen prüfen

✨ NEUE FEATURES:
- Automatische Suche nach alternativen Kameras
- Fallback auf Audio-Only wenn keine Kamera verfügbar
- Verschiedene Qualitätsstufen werden versucht

Das Spiel funktioniert auch ohne Video! 🎮
    `;
    
    // Erstelle interaktive Troubleshooting-Buttons
    const troubleshootDiv = document.createElement('div');
    troubleshootDiv.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.9); color: white; padding: 20px; border-radius: 10px;
        z-index: 10000; max-width: 500px; text-align: center;
    `;
    
    troubleshootDiv.innerHTML = `
        <h3>🔧 Video-Probleme beheben</h3>
        <p>Kamera/Mikrofon wird bereits verwendet?</p>
        <button id="try-alternatives" style="margin: 5px; padding: 10px 15px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">
            🔍 Alternative Geräte suchen
        </button>
        <button id="elgato-diagnose" style="margin: 5px; padding: 10px 15px; background: #6f42c1; color: white; border: none; border-radius: 5px; cursor: pointer;">
            🎥 Elgato Cam Link testen
        </button>
        <button id="audio-only-mode" style="margin: 5px; padding: 10px 15px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer;">
            🎤 Nur Audio verwenden
        </button>
        <button id="close-troubleshoot" style="margin: 5px; padding: 10px 15px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer;">
            ❌ Schließen
        </button>
    `;
    
    document.body.appendChild(troubleshootDiv);
    
    // Event Listener für Buttons
    document.getElementById('try-alternatives').onclick = () => {
        document.body.removeChild(troubleshootDiv);
        tryAlternativeDevices();
    };
    
    document.getElementById('elgato-diagnose').onclick = () => {
        document.body.removeChild(troubleshootDiv);
        diagnoseElgatoCamLink();
    };
    
    document.getElementById('audio-only-mode').onclick = async () => {
        document.body.removeChild(troubleshootDiv);
        try {
            await webrtc.initializeLocalStream({ videoOnly: false });
            webrtc.isInCall = true;
            enableMediaControls();
            updateCallUI();
            showNotification('🎤 Audio-Only Modus aktiviert', 'success');
        } catch (error) {
            showNotification('❌ Auch Audio-Zugriff fehlgeschlagen', 'error');
        }
    };
    
    document.getElementById('close-troubleshoot').onclick = () => {
        document.body.removeChild(troubleshootDiv);
    };
}

// Erweiterte Geräte-Debug-Info anzeigen
async function showDeviceDebugInfo() {
    console.log('🔍 Zeige erweiterte Geräte-Debug-Informationen...');
    
    try {
        // Berechtigungen prüfen
        const permissions = await navigator.permissions.query({ name: 'camera' });
        console.log('📷 Kamera-Berechtigung:', permissions.state);
        
        const audioPermissions = await navigator.permissions.query({ name: 'microphone' });
        console.log('🎤 Mikrofon-Berechtigung:', audioPermissions.state);
        
        // Alle verfügbaren Geräte auflisten
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        const audioDevices = devices.filter(device => device.kind === 'audioinput');
        const audioOutputDevices = devices.filter(device => device.kind === 'audiooutput');
        
        // Spezielle Geräte-Kategorien
        const captureDevices = videoDevices.filter(device => 
            device.label.toLowerCase().includes('cam link') ||
            device.label.toLowerCase().includes('capture') ||
            device.label.toLowerCase().includes('elgato') ||
            device.label.toLowerCase().includes('obs') ||
            device.label.toLowerCase().includes('streamlabs') ||
            device.label.toLowerCase().includes('hdmi') ||
            device.label.toLowerCase().includes('4k60') ||
            device.label.toLowerCase().includes('hd60')
        );
        
        const webcams = videoDevices.filter(device => !captureDevices.includes(device));
        
        // Browser-Info
        const browserInfo = {
            userAgent: navigator.userAgent,
            vendor: navigator.vendor || 'Unbekannt',
            platform: navigator.platform || 'Unbekannt',
            cookieEnabled: navigator.cookieEnabled,
            language: navigator.language || 'Unbekannt'
        };
        
        // WebRTC-Unterstützung
        const webrtcSupport = {
            getUserMedia: !!navigator.mediaDevices?.getUserMedia,
            RTCPeerConnection: !!window.RTCPeerConnection,
            RTCSessionDescription: !!window.RTCSessionDescription,
            RTCIceCandidate: !!window.RTCIceCandidate
        };
        
        // Debug-Info zusammenstellen
        let debugInfo = `
🔍 ERWEITERTE GERÄTE-DEBUG-INFORMATIONEN
=============================================

📱 BROWSER-INFO:
- User Agent: ${browserInfo.userAgent}
- Vendor: ${browserInfo.vendor}
- Platform: ${browserInfo.platform}
- Cookies: ${browserInfo.cookieEnabled ? '✅' : '❌'}
- Sprache: ${browserInfo.language}

🔒 BERECHTIGUNGEN:
- Kamera: ${permissions.state} ${permissions.state === 'granted' ? '✅' : '❌'}
- Mikrofon: ${audioPermissions.state} ${audioPermissions.state === 'granted' ? '✅' : '❌'}

🌐 WEBRTC-UNTERSTÜTZUNG:
- getUserMedia: ${webrtcSupport.getUserMedia ? '✅' : '❌'}
- RTCPeerConnection: ${webrtcSupport.RTCPeerConnection ? '✅' : '❌'}
- RTCSessionDescription: ${webrtcSupport.RTCSessionDescription ? '✅' : '❌'}
- RTCIceCandidate: ${webrtcSupport.RTCIceCandidate ? '✅' : '❌'}

📹 VIDEO-GERÄTE GESAMT: ${videoDevices.length}
${videoDevices.map((device, index) => `
  ${index + 1}. ${device.label || 'Unbekanntes Gerät'}
     ID: ${device.deviceId}
     Gruppe: ${device.groupId}`).join('')}

🎥 CAPTURE-DEVICES: ${captureDevices.length}
${captureDevices.map((device, index) => `
  ${index + 1}. ${device.label || 'Unbekanntes Capture-Device'}
     ID: ${device.deviceId}
     Gruppe: ${device.groupId}`).join('')}

📷 NORMALE WEBCAMS: ${webcams.length}
${webcams.map((device, index) => `
  ${index + 1}. ${device.label || 'Unbekannte Webcam'}
     ID: ${device.deviceId}
     Gruppe: ${device.groupId}`).join('')}

🎤 AUDIO-EINGABE: ${audioDevices.length}
${audioDevices.map((device, index) => `
  ${index + 1}. ${device.label || 'Unbekanntes Mikrofon'}
     ID: ${device.deviceId}
     Gruppe: ${device.groupId}`).join('')}

🔊 AUDIO-AUSGABE: ${audioOutputDevices.length}
${audioOutputDevices.map((device, index) => `
  ${index + 1}. ${device.label || 'Unbekannter Lautsprecher'}
     ID: ${device.deviceId}
     Gruppe: ${device.groupId}`).join('')}

📊 AKTUELLER STREAM-STATUS:
- Stream aktiv: ${webrtc.localStream ? '✅' : '❌'}
- Video Tracks: ${webrtc.localStream ? webrtc.localStream.getVideoTracks().length : 0}
- Audio Tracks: ${webrtc.localStream ? webrtc.localStream.getAudioTracks().length : 0}
${webrtc.localStream ? webrtc.localStream.getVideoTracks().map((track, i) => `
  Video Track ${i + 1}:
    - Label: ${track.label}
    - Enabled: ${track.enabled ? '✅' : '❌'}
    - Ready State: ${track.readyState}
    - Constraints: ${JSON.stringify(track.getConstraints(), null, 2)}
    - Settings: ${JSON.stringify(track.getSettings(), null, 2)}`).join('') : ''}

🔗 PEER CONNECTIONS:
- Anzahl aktive Verbindungen: ${webrtc.peerConnections ? webrtc.peerConnections.size : 0}
${webrtc.peerConnections ? Array.from(webrtc.peerConnections.entries()).map(([peerId, peer]) => `
  - Peer ${peer.name}: ${peer.connection.connectionState}`).join('') : ''}

💡 EMPFEHLUNGEN:
${captureDevices.length > 0 ? '✅ Capture-Devices erkannt - sollten funktionieren!' : '⚠️ Keine Capture-Devices gefunden'}
${permissions.state !== 'granted' ? '❗ Kamera-Berechtigung fehlt - auf "Zulassen" klicken!' : '✅ Kamera-Berechtigung erteilt'}
${!webrtcSupport.getUserMedia ? '❌ Browser unterstützt keine Webcam-Funktionen!' : '✅ Browser unterstützt WebRTC'}
        `;
        
        // Debug-Info in Modal anzeigen
        const debugModal = document.createElement('div');
        debugModal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(0,0,0,0.9); color: white; padding: 20px; 
            z-index: 10000; overflow-y: auto; font-family: monospace; font-size: 12px;
        `;
        
        debugModal.innerHTML = `
            <div style="max-width: 800px; margin: 0 auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0;">🔍 Geräte-Debug-Info</h2>
                    <button id="close-debug" style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        ❌ Schließen
                    </button>
                </div>
                <pre style="white-space: pre-wrap; background: #111; padding: 20px; border-radius: 8px; max-height: 70vh; overflow-y: auto;">${debugInfo}</pre>
                <div style="margin-top: 20px; text-align: center;">
                    <button id="test-elgato-debug" style="margin: 5px; padding: 10px 15px; background: #6f42c1; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        🎥 Elgato Cam Link testen
                    </button>
                    <button id="copy-debug-info" style="margin: 5px; padding: 10px 15px; background: #17a2b8; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        📋 Info kopieren
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(debugModal);
        
        // Event Handlers für Debug-Modal
        document.getElementById('close-debug').onclick = () => {
            document.body.removeChild(debugModal);
        };
        
        document.getElementById('test-elgato-debug').onclick = () => {
            document.body.removeChild(debugModal);
            diagnoseElgatoCamLink();
        };
        
        document.getElementById('copy-debug-info').onclick = () => {
            navigator.clipboard.writeText(debugInfo).then(() => {
                showNotification('📋 Debug-Info in Zwischenablage kopiert!', 'success');
            }).catch(() => {
                showNotification('❌ Kopieren fehlgeschlagen', 'error');
            });
        };
        
        // WebRTC Connection Status Button hinzufügen
        if (webrtc.peerConnections.size > 0) {
            const webrtcStatusBtn = document.createElement('button');
            webrtcStatusBtn.textContent = '🔗 WebRTC Status';
            webrtcStatusBtn.style.cssText = 'margin: 5px; padding: 10px 15px; background: #fd7e14; color: white; border: none; border-radius: 5px; cursor: pointer;';
            webrtcStatusBtn.onclick = () => {
                document.body.removeChild(debugModal);
                showWebRTCConnectionStatus();
            };
            
            debugModal.querySelector('div > div:last-child').appendChild(webrtcStatusBtn);
        }
        
        // Schließen bei Klick außerhalb
        debugModal.onclick = (e) => {
            if (e.target === debugModal) {
                document.body.removeChild(debugModal);
            }
        };
        
    } catch (error) {
        console.error('❌ Debug-Info konnte nicht geladen werden:', error);
        showNotification('❌ Debug-Info nicht verfügbar: ' + error.message, 'error');
    }
}

// Detaillierte WebRTC Connection Status Anzeige
async function showWebRTCConnectionStatus() {
    console.log('🔗 Zeige detaillierte WebRTC Connection Status...');
    
    let connectionInfo = `
🔗 WEBRTC CONNECTION STATUS
===========================

📊 ÜBERSICHT:
- Aktive Peer-Connections: ${webrtc.peerConnections.size}
- Eigener Stream aktiv: ${webrtc.localStream ? '✅' : '❌'}
- In Call: ${webrtc.isInCall ? '✅' : '❌'}

`;

    if (webrtc.peerConnections.size === 0) {
        connectionInfo += `
⚠️ KEINE AKTIVEN PEER-CONNECTIONS
- Sind andere Spieler im Video-Call?
- Versuchen Sie "Video Call beitreten" zu klicken
- Prüfen Sie die Netzwerk-Verbindung
`;
    } else {
        connectionInfo += `
📡 PEER-CONNECTIONS:
`;
        
        webrtc.peerConnections.forEach((peerData, peerId) => {
            const conn = peerData.connection;
            
            // ICE Candidates zählen
            let localCandidatesCount = 0;
            let remoteCandidatesCount = 0;
            
            try {
                conn.getStats().then(stats => {
                    stats.forEach(report => {
                        if (report.type === 'local-candidate') localCandidatesCount++;
                        if (report.type === 'remote-candidate') remoteCandidatesCount++;
                    });
                });
            } catch (e) {
                // Stats nicht verfügbar
            }
            
            const connectionOK = conn.connectionState === 'connected';
            const iceOK = conn.iceConnectionState === 'connected' || conn.iceConnectionState === 'completed';
            
            connectionInfo += `
  🤝 ${peerData.name} (${peerId.substr(0, 8)}...)
    - Connection State: ${conn.connectionState} ${connectionOK ? '✅' : '❌'}
    - ICE Connection State: ${conn.iceConnectionState} ${iceOK ? '✅' : '❌'}
    - ICE Gathering State: ${conn.iceGatheringState}
    - Signaling State: ${conn.signalingState}
    - Local ICE Candidates: ${localCandidatesCount}
    - Remote ICE Candidates: ${remoteCandidatesCount}
`;

            // Remote Streams prüfen
            const remoteStreams = conn.getRemoteStreams ? conn.getRemoteStreams() : [];
            if (remoteStreams.length > 0) {
                connectionInfo += `    - Remote Streams: ${remoteStreams.length} ✅\n`;
                remoteStreams.forEach((stream, i) => {
                    connectionInfo += `      Stream ${i + 1}: ${stream.getVideoTracks().length} Video, ${stream.getAudioTracks().length} Audio\n`;
                });
            } else {
                connectionInfo += `    - Remote Streams: 0 ❌\n`;
            }
        });
    }
    
    connectionInfo += `
🎥 LOKALER STREAM:
`;
    
    if (webrtc.localStream) {
        const videoTracks = webrtc.localStream.getVideoTracks();
        const audioTracks = webrtc.localStream.getAudioTracks();
        
        connectionInfo += `
- Video Tracks: ${videoTracks.length}
- Audio Tracks: ${audioTracks.length}
`;
        
        if (videoTracks.length > 0) {
            const vTrack = videoTracks[0];
            const settings = vTrack.getSettings();
            connectionInfo += `
  Video Track 1:
    - Label: ${vTrack.label}
    - Enabled: ${vTrack.enabled ? '✅' : '❌'}
    - Ready State: ${vTrack.readyState}
    - Resolution: ${settings.width || '?'}x${settings.height || '?'}
    - Frame Rate: ${settings.frameRate || '?'}fps
    - Device ID: ${settings.deviceId || '?'}
`;
        }
    } else {
        connectionInfo += `- Kein lokaler Stream verfügbar ❌`;
    }
    
    connectionInfo += `
🔧 LÖSUNGSVORSCHLÄGE:
- Bei "failed" Connections: Browser neu laden
- Bei "disconnected" Connections: Video Call neu beitreten
- Bei fehlenden Remote Streams: Andere Spieler bitten Video neu zu starten
- Bei lokalen Stream-Problemen: "Alternative Geräte suchen" verwenden
`;

    // Modal für Connection Status
    const statusModal = document.createElement('div');
    statusModal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
        background: rgba(0,0,0,0.9); color: white; padding: 20px; 
        z-index: 10000; overflow-y: auto; font-family: monospace; font-size: 11px;
    `;
    
    statusModal.innerHTML = `
        <div style="max-width: 900px; margin: 0 auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0;">🔗 WebRTC Connection Status</h2>
                <button id="close-webrtc-status" style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    ❌ Schließen
                </button>
            </div>
            <pre style="white-space: pre-wrap; background: #111; padding: 20px; border-radius: 8px; max-height: 70vh; overflow-y: auto;">${connectionInfo}</pre>
            <div style="margin-top: 20px; text-align: center;">
                <button id="refresh-webrtc-status" style="margin: 5px; padding: 10px 15px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    🔄 Status aktualisieren
                </button>
                <button id="force-reconnect-all" style="margin: 5px; padding: 10px 15px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    🔁 Alle Verbindungen neu aufbauen
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(statusModal);
    
    // Event Handlers
    document.getElementById('close-webrtc-status').onclick = () => {
        document.body.removeChild(statusModal);
    };
    
    document.getElementById('refresh-webrtc-status').onclick = () => {
        document.body.removeChild(statusModal);
        showWebRTCConnectionStatus(); // Neu laden
    };
    
    document.getElementById('force-reconnect-all').onclick = () => {
        document.body.removeChild(statusModal);
        forceReconnectAllPeers();
    };
    
    // Schließen bei Klick außerhalb
    statusModal.onclick = (e) => {
        if (e.target === statusModal) {
            document.body.removeChild(statusModal);
        }
    };
}

// Alle Peer-Connections neu aufbauen
async function forceReconnectAllPeers() {
    console.log('🔁 Baue alle Peer-Connections neu auf...');
    showNotification('🔁 Baue alle Verbindungen neu auf...', 'info');
    
    const peersToReconnect = Array.from(webrtc.peerConnections.entries());
    
    // Alle alten Connections schließen
    webrtc.peerConnections.forEach((peerData) => {
        peerData.connection.close();
    });
    webrtc.peerConnections.clear();
    
    // Nach kurzer Pause neue Connections aufbauen
    setTimeout(async () => {
        for (const [peerId, peerData] of peersToReconnect) {
            console.log(`🔄 Reconnect zu ${peerData.name}...`);
            webrtc.createPeerConnection(peerId, peerData.name);
            await webrtc.createOffer(peerId);
            
            // Kurze Pause zwischen Reconnects
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        showNotification('✅ Alle Verbindungen neu aufgebaut', 'success');
    }, 2000);
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
    
    if (!stream) {
        console.error('❌ Kein Stream für displayMyVideo vorhanden!');
        showNotification('❌ Video-Stream nicht verfügbar', 'error');
        return;
    }
    
    // Stream-Details loggen
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    
    console.log(`📊 displayMyVideo - Stream hat ${videoTracks.length} Video-Track(s) und ${audioTracks.length} Audio-Track(s)`);
    
    if (videoTracks.length > 0) {
        const videoTrack = videoTracks[0];
        console.log(`📹 Video Track: ${videoTrack.label} (${videoTrack.readyState})`);
        
        if (videoTrack.readyState === 'ended') {
            console.error('❌ Video Track ist beendet!');
            showNotification('❌ Video-Stream wurde beendet', 'error');
            return;
        }
    }
    
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
    console.log('🎮 displayMyVideoInGame wird ausgeführt...');
    
    const playerSlot = isAdmin ? 
        document.getElementById('admin-video') : 
        getAvailableVideoSlot();
    
    if (!playerSlot) {
        console.error('❌ Kein verfügbarer Video-Slot im Game-Screen gefunden!');
        showNotification('❌ Kein Video-Slot verfügbar', 'error');
        return;
    }
    
    myVideoSlot = playerSlot;
    const video = playerSlot.querySelector('.player-video');
    const placeholder = playerSlot.querySelector('.video-placeholder');
    
    if (!video) {
        console.error('❌ Video-Element nicht gefunden in Slot:', playerSlot.id);
        return;
    }
    
    console.log(`📹 Setze Stream auf Video-Element in Slot: ${playerSlot.id}`);
    
    video.srcObject = stream;
    video.muted = true; // Eigenes Video stumm schalten
    video.autoplay = true;
    video.playsInline = true;
    video.style.display = 'block';
    
    if (placeholder) {
        placeholder.style.display = 'none';
    }
    
    playerSlot.classList.add('active');
    if (isAdmin) playerSlot.classList.add('admin');
    
    // Player Name aktualisieren
    const label = playerSlot.querySelector('.player-label');
    if (label) {
        label.textContent = `${isAdmin ? currentLobby.adminName : getPlayerName()} (Du)`;
        console.log(`👤 Player Label gesetzt: ${label.textContent}`);
    }
    
    // Video Status Overlay hinzufügen
    addVideoStatusOverlay(playerSlot);
    
    // Markiere als eigenes Video
    playerSlot.setAttribute('data-player-id', socket.id);
    playerSlot.setAttribute('data-is-local', 'true');
    
    // Video Load Event Listener
    video.addEventListener('loadedmetadata', () => {
        console.log(`✅ Video Metadata geladen: ${video.videoWidth}x${video.videoHeight}`);
        showNotification(`📹 Eigenes Video aktiv: ${video.videoWidth}x${video.videoHeight}`, 'success');
    });
    
    video.addEventListener('error', (e) => {
        console.error('❌ Video-Element Fehler:', e);
        showNotification('❌ Video-Anzeige-Fehler', 'error');
    });
    
    console.log('✅ Eigenes Video konfiguriert in Game-Slot:', playerSlot.id);
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
    
    // Alle Peer Connections schließen (NEUER WEBRTC MANAGER)
    webrtc.peerConnections.forEach((peerData) => {
        peerData.connection.close();
    });
    webrtc.peerConnections.clear();
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
    
    if (webrtc.isInCall) {
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
    if (webrtc.isInCall) {
        leaveVideoCall();
    }
    
    // Alle Peer Connections schließen
    // Alle WebRTC Verbindungen schließen (NEUER WEBRTC MANAGER)
    webrtc.peerConnections.forEach((peerData) => {
        peerData.connection.close();
    });
    webrtc.peerConnections.clear();
    
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
        const participantCount = webrtc.peerConnections.size + (webrtc.isInCall ? 1 : 0);
        lobbyParticipants.textContent = `${participantCount}/5 Teilnehmer`;
        
        const indicator = lobbyStatus.querySelector('.status-indicator');
        if (indicator) {
            indicator.textContent = webrtc.isInCall ? '🟢' : '🔴';
        }
    }
    
    if (joinBtn && leaveBtn) {
        if (webrtc.isInCall) {
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