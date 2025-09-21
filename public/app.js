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
    
    // Video-Call Controls nach Lobby-Erstellung initialisieren
    setTimeout(() => {
        setupVideoCallControls();
        initializeWebRTC();
    }, 200);
});

socket.on('joined-lobby-success', (data) => {
    currentLobbyCode = data.lobbyCode;
    currentLobby = data.lobby;
    updateLobbyScreen();
    showScreen('lobby');
    showNotification(`Erfolgreich Lobby ${data.lobbyCode} beigetreten!`, 'success');
    
    // Video-Call Controls nach Lobby-Beitritt initialisieren
    setTimeout(() => {
        setupVideoCallControls();
        initializeWebRTC();
    }, 200);
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
    setTimeout(() => {
        setupVideoCallIntegration();
    }, 100);
    
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

// Video Call Events - VEREINFACHT
socket.on('player-joined-call-notification', (data) => {
    showNotification(`📹 ${data.playerName} ist dem Video Call beigetreten!`, 'info');
    
    if (webrtc.isInCall && data.playerId !== socket.id) {
        webrtc.createPeerConnection(data.playerId, data.playerName);
        
        if (socket.id < data.playerId) {
            setTimeout(() => {
                webrtc.createOffer(data.playerId);
            }, 1500);
        }
    }
    
    updateCallStatus();
});

socket.on('player-left-call-notification', (data) => {
    showNotification(`📵 ${data.playerName} hat den Video Call verlassen`, 'info');
    
    if (data.playerId && webrtc.peerConnections.has(data.playerId)) {
        const peerData = webrtc.peerConnections.get(data.playerId);
        peerData.connection.close();
        webrtc.peerConnections.delete(data.playerId);
        
        const playerSlot = document.querySelector(`[data-player-id="${data.playerId}"]`);
        if (playerSlot) {
            resetVideoSlot(playerSlot);
        }
    }
    
    updateCallStatus();
});

// WebRTC Signaling Events
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

// DOM Ready Event Listener für Video Call Button (nur im Game)
document.addEventListener('DOMContentLoaded', () => {
    const joinButton = document.getElementById('join-video-call');
    if (joinButton) {
        joinButton.addEventListener('click', (e) => {
            e.preventDefault();
            joinVideoCall();
        });
    }
});

// VEREINFACHTES WebRTC MANAGEMENT - OHNE KOMPLEXE DEBUG-DIALOGE
class WebRTCManager {
    constructor() {
        this.localStream = null;
        this.peerConnections = new Map();
        this.isInCall = false;
    }

    async initializeLocalStream() {
        console.log('🎥 Initialisiere lokalen Stream...');
        
        // Einfache Strategien - Elgato wird wie normale Webcam behandelt
        const strategies = [
            // Standard HD Qualität
            {
                video: { 
                    width: { ideal: 640 }, 
                    height: { ideal: 480 }
                }, 
                audio: true,
                name: 'Standard Qualität'
            },
            // Niedrige Qualität fallback
            {
                video: { 
                    width: 320, 
                    height: 240
                }, 
                audio: true,
                name: 'Niedrige Qualität'
            },
            // Nur Audio
            {
                video: false,
                audio: true,
                name: 'Nur Audio'
            }
        ];

        for (let i = 0; i < strategies.length; i++) {
            try {
                console.log(`🎥 Versuche: ${strategies[i].name}...`);
                
                this.localStream = await navigator.mediaDevices.getUserMedia(strategies[i]);
                
                console.log(`✅ Stream erfolgreich: ${strategies[i].name}`);
                return this.localStream;
                
            } catch (error) {
                console.log(`❌ Fehlgeschlagen: ${strategies[i].name} - ${error.name}`);
                if (i === strategies.length - 1) {
                    throw error;
                }
            }
        }
    }

    createPeerConnection(peerId, peerName) {
        console.log(`🔗 Erstelle Peer Connection für: ${peerName}`);
        
        const peerConnection = new RTCPeerConnection(rtcConfig);
        
        this.peerConnections.set(peerId, {
            connection: peerConnection,
            name: peerName
        });

        // Stream hinzufügen
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });
        }

        // Event Handlers
        peerConnection.ontrack = (event) => {
            console.log(`📹 Remote Stream empfangen von: ${peerName}`);
            const remoteStream = event.streams[0];
            displayRemoteVideo(remoteStream, peerId, peerName);
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', {
                    to: peerId,
                    candidate: event.candidate
                });
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log(`🔄 Connection State (${peerName}):`, peerConnection.connectionState);
        };
    }

    async createOffer(peerId) {
        const peerData = this.peerConnections.get(peerId);
        if (!peerData) return;

        try {
            const offer = await peerData.connection.createOffer();
            await peerData.connection.setLocalDescription(offer);
            
            socket.emit('webrtc-offer', {
                to: peerId,
                offer: offer
            });
            
            console.log(`📤 Offer gesendet an: ${peerData.name}`);
        } catch (error) {
            console.error('❌ Fehler beim Erstellen des Offers:', error);
        }
    }

    async handleOffer(data) {
        const peerData = this.peerConnections.get(data.from);
        if (!peerData) {
            console.warn('❌ Peer Connection nicht gefunden für Offer');
            return;
        }

        try {
            await peerData.connection.setRemoteDescription(data.offer);
            const answer = await peerData.connection.createAnswer();
            await peerData.connection.setLocalDescription(answer);
            
            socket.emit('webrtc-answer', {
                to: data.from,
                answer: answer
            });
            
            console.log(`📤 Answer gesendet an: ${peerData.name}`);
        } catch (error) {
            console.error('❌ Fehler beim Behandeln des Offers:', error);
        }
    }

    async handleAnswer(data) {
        const peerData = this.peerConnections.get(data.from);
        if (!peerData) {
            console.warn('❌ Peer Connection nicht gefunden für Answer');
            return;
        }

        try {
            await peerData.connection.setRemoteDescription(data.answer);
            console.log(`📥 Answer von ${peerData.name} verarbeitet`);
        } catch (error) {
            console.error('❌ Fehler beim Behandeln der Answer:', error);
        }
    }

    async handleIceCandidate(data) {
        const peerData = this.peerConnections.get(data.from);
        if (!peerData) {
            console.warn('❌ Peer Connection nicht gefunden für ICE Candidate');
            return;
        }

        try {
            await peerData.connection.addIceCandidate(data.candidate);
        } catch (error) {
            console.error('❌ Fehler beim Hinzufügen des ICE Candidates:', error);
        }
    }

    cleanup() {
        this.peerConnections.forEach((peerData) => {
            peerData.connection.close();
        });
        this.peerConnections.clear();
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        this.isInCall = false;
    }
}

// WebRTC Manager Instance
const webrtc = new WebRTCManager();

// VIDEO CALL FUNCTIONS - VEREINFACHT
function setupVideoCallControls() {
    // Audio/Video Controls
    const toggleAudioBtn = document.getElementById('toggle-audio');
    const toggleVideoBtn = document.getElementById('toggle-video');
    const leaveCallBtn = document.getElementById('leave-call');
    
    if (toggleAudioBtn) toggleAudioBtn.addEventListener('click', toggleAudio);
    if (toggleVideoBtn) toggleVideoBtn.addEventListener('click', toggleVideo);
    if (leaveCallBtn) leaveCallBtn.addEventListener('click', leaveVideoCall);
}

// Video Call Funktion global verfügbar machen - VEREINFACHT
window.joinVideoCall = async function joinVideoCall() {
    console.log('🎬 Starte Video Call...');
    
    // Sicherheitsprüfung
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isSecure) {
        showNotification('🔒 HTTPS erforderlich für Webcam-Zugriff!', 'error');
        return;
    }

    try {
        // 1. Lokalen Video-Stream initialisieren (Elgato wird automatisch erkannt)
        await webrtc.initializeLocalStream();
        
        // 2. Eigenes Video anzeigen
        displayMyVideo(webrtc.localStream);
        
        // 3. UI aktualisieren
        isInCall = true;
        webrtc.isInCall = true;
        updateCallUI();
        updateCallStatus();
        
        // 4. Anderen Spielern Beitritt mitteilen
        socket.emit('player-joined-call', {
            lobbyCode: currentLobbyCode,
            playerName: isAdmin ? currentLobby.adminName : getPlayerName()
        });
        
        // 5. Connections zu anderen Spielern aufbauen
        setupPeerConnectionsForExistingPlayers();
        
        showNotification('✅ Video Call gestartet!', 'success');
        
    } catch (error) {
        console.error('❌ Video Call Fehler:', error);
        showNotification('❌ Webcam/Mikrofon Zugriff fehlgeschlagen: ' + error.message, 'error');
    }
}

// Video Call verlassen Funktion - VEREINFACHT
window.leaveVideoCall = function leaveVideoCall() {
    console.log('🏠 Verlasse Video Call...');
    
    try {
        if (webrtc) {
            webrtc.cleanup();
        }
        
        // Video-Elemente ausblenden
        const videoCallSection = document.querySelector('.video-call-section');
        if (videoCallSection) {
            videoCallSection.style.display = 'none';
        }
        
        const lobbyVideoCall = document.querySelector('.lobby-video-call');
        if (lobbyVideoCall) {
            lobbyVideoCall.style.display = 'none';
        }
        
        showNotification('✅ Video Call verlassen', 'success');
        
    } catch (error) {
        console.error('❌ Fehler beim Video Call verlassen:', error);
        showNotification('❌ Fehler beim Video Call verlassen: ' + error.message, 'error');
    }
}

// Audio Toggle Funktion - VEREINFACHT
window.toggleAudio = function toggleAudio() {
    console.log('🎤 Toggle Audio...');
    
    try {
        if (webrtc && webrtc.localStream) {
            const audioTracks = webrtc.localStream.getAudioTracks();
            if (audioTracks.length > 0) {
                const audioTrack = audioTracks[0];
                audioTrack.enabled = !audioTrack.enabled;
                
                const toggleBtn = document.getElementById('toggle-audio');
                if (toggleBtn) {
                    toggleBtn.textContent = audioTrack.enabled ? '🎤 Mikro' : '🔇 Mikro';
                }
                
                showNotification(`🎤 Audio ${audioTrack.enabled ? 'aktiviert' : 'deaktiviert'}`, 'success');
            }
        }
    } catch (error) {
        console.error('❌ Audio Toggle Fehler:', error);
        showNotification('❌ Audio Toggle Fehler: ' + error.message, 'error');
    }
}

// Video Toggle Funktion - VEREINFACHT  
window.toggleVideo = function toggleVideo() {
    console.log('📹 Toggle Video...');
    
    try {
        if (webrtc && webrtc.localStream) {
            const videoTracks = webrtc.localStream.getVideoTracks();
            if (videoTracks.length > 0) {
                const videoTrack = videoTracks[0];
                videoTrack.enabled = !videoTrack.enabled;
                
                const toggleBtn = document.getElementById('toggle-video');
                if (toggleBtn) {
                    toggleBtn.textContent = videoTrack.enabled ? '📹 Kamera' : '📵 Kamera';
                }
                
                // Lokales Video Element aktualisieren
                const localVideo = document.getElementById('localVideo');
                if (localVideo) {
                    localVideo.style.visibility = videoTrack.enabled ? 'visible' : 'hidden';
                }
                
                showNotification(`📹 Video ${videoTrack.enabled ? 'aktiviert' : 'deaktiviert'}`, 'success');
            }
        }
    } catch (error) {
        console.error('❌ Video Toggle Fehler:', error);
        showNotification('❌ Video Toggle Fehler: ' + error.message, 'error');
    }
}

// VEREINFACHTE HELPER-FUNKTIONEN
function initializeWebRTC() {
    console.log('🔄 Initialisiere WebRTC...');
}

function setupVideoCallIntegration() {
    setupVideoCallControls();
    updateCallStatus();
}

function updateCallUI() {
    // Video-Call Bereiche anzeigen
    const lobbyVideoCall = document.querySelector('.lobby-video-call');
    if (lobbyVideoCall) {
        lobbyVideoCall.style.display = 'block';
    }
    
    const videoCallSection = document.querySelector('.video-call-section');
    if (videoCallSection) {
        videoCallSection.style.display = 'block';
    }
}

function updateCallStatus() {
    // Einfache Status-Aktualisierung ohne komplexe UI
    console.log('📊 Call Status aktualisiert');
}

function displayMyVideo(stream) {
    const localVideo = document.getElementById('localVideo');
    if (localVideo) {
        localVideo.srcObject = stream;
        localVideo.play();
    }
}

function displayRemoteVideo(stream, peerId, peerName) {
    console.log(`📺 Zeige Remote Video für: ${peerName}`);
    
    // Finde freien Video-Slot
    const videoSlots = document.querySelectorAll('.video-slot:not(.local-video)');
    let targetSlot = null;
    
    for (const slot of videoSlots) {
        if (!slot.dataset.playerId) {
            targetSlot = slot;
            break;
        }
    }
    
    if (targetSlot) {
        targetSlot.dataset.playerId = peerId;
        const video = targetSlot.querySelector('.player-video');
        const placeholder = targetSlot.querySelector('.video-placeholder');
        
        if (video && placeholder) {
            video.srcObject = stream;
            video.play();
            video.style.display = 'block';
            placeholder.style.display = 'none';
        }
    }
}

function setupPeerConnectionsForExistingPlayers() {
    if (!currentLobby) return;
    
    const otherPlayers = [];
    
    if (isAdmin) {
        currentLobby.players.forEach(player => {
            if (player.id !== socket.id) {
                otherPlayers.push({ id: player.id, name: player.name });
            }
        });
    } else {
        if (currentLobby.admin !== socket.id) {
            otherPlayers.push({ id: currentLobby.admin, name: currentLobby.adminName });
        }
        
        currentLobby.players.forEach(player => {
            if (player.id !== socket.id) {
                otherPlayers.push({ id: player.id, name: player.name });
            }
        });
    }
    
    // Für jeden anderen Spieler eine Peer Connection erstellen
    otherPlayers.forEach(player => {
        webrtc.createPeerConnection(player.id, player.name);
        
        // Als niedrigste Socket-ID initiieren
        if (socket.id < player.id) {
            setTimeout(() => {
                webrtc.createOffer(player.id);
            }, 1000 + Math.random() * 500);
        }
    });
}

function resetVideoSlot(playerSlot) {
    const video = playerSlot.querySelector('.player-video');
    const placeholder = playerSlot.querySelector('.video-placeholder');
    
    if (video) {
        video.style.display = 'none';
        video.srcObject = null;
    }
    if (placeholder) {
        placeholder.style.display = 'flex';
    }
    
    playerSlot.classList.remove('active', 'admin');
    playerSlot.removeAttribute('data-player-id');
}

function getPlayerName() {
    // Finde aktuellen Spieler-Namen
    const currentPlayer = currentLobby.players.find(p => p.id === socket.id);
    return currentPlayer ? currentPlayer.name : 'Unbekannt';
}

function removePlayerVideoByName(playerName) {
    // Entferne Video-Slot basierend auf Namen
    const slots = document.querySelectorAll('.video-slot');
    slots.forEach(slot => {
        const nameElement = slot.querySelector('.player-name');
        if (nameElement && nameElement.textContent === playerName) {
            resetVideoSlot(slot);
        }
    });
}

function transferVideosToGameScreen() {
    // Video Transfer von Lobby zu Game - Vereinfacht
    console.log('🔄 Transferiere Videos zum Game Screen...');
}

// ALLE ANDEREN GAME-FUNKTIONEN bleiben unverändert...

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

function showEndScreen(finalScores) {
    showScreen('gameEnd');
    
    const scoresList = document.getElementById('final-scores');
    scoresList.innerHTML = '';
    
    finalScores.forEach((score, index) => {
        const scoreItem = document.createElement('div');
        scoreItem.className = `final-score-item ${index === 0 ? 'winner' : ''}`;
        scoreItem.innerHTML = `
            <div class="final-rank">${index + 1}.</div>
            <div class="final-name">${score.name}</div>
            <div class="final-points">${score.score}</div>
        `;
        scoresList.appendChild(scoreItem);
    });
    
    document.getElementById('new-game-btn').addEventListener('click', () => {
        socket.disconnect();
        socket.connect();
        showScreen('start');
        currentLobbyCode = null;
        currentLobby = null;
        isAdmin = false;
    });
}

// Cleanup beim Verlassen der Seite
window.addEventListener('beforeunload', () => {
    if (webrtc) {
        webrtc.cleanup();
    }
});