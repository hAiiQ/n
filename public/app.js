// Socket.io Verbindung
const socket = io();

// Globale Variablen
let isAdmin = false;
let currentLobbyCode = null;
let currentLobby = null;
let currentQuestionData = null;
let questionTimer = null;
let questionTimeLeft = 30;
let isBuzzerMode = false;

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
    console.log('Create lobby form submitted');
    e.preventDefault();
    const adminName = document.getElementById('admin-name').value.trim();
    
    console.log('Admin name:', adminName);
    console.log('Socket connected:', socket.connected);
    
    if (adminName) {
        console.log('Emitting create-lobby event');
        console.log('Setting isAdmin = true before emit');
        isAdmin = true; // Setze schon hier auf true
        console.log('isAdmin nach Setzen:', isAdmin);
        socket.emit('create-lobby', { adminName });
    } else {
        console.log('Admin name is empty');
    }
});

// Lobby beitreten
document.getElementById('join-lobby-form').addEventListener('submit', (e) => {
    console.log('Form submit event triggered');
    e.preventDefault();
    const playerName = document.getElementById('join-player-name').value.trim();
    const lobbyCode = document.getElementById('lobby-code').value.trim().toUpperCase();
    
    console.log('Join lobby - PlayerName:', playerName, 'LobbyCode:', lobbyCode);
    console.log('Socket connected:', socket.connected);
    
    if (playerName && lobbyCode) {
        console.log('Emitting join-lobby event');
        isAdmin = false;
        socket.emit('join-lobby', { playerName, lobbyCode });
    } else {
        console.log('Missing playerName or lobbyCode');
    }
});

// Spiel starten (nur Admin)
document.getElementById('start-game-btn').addEventListener('click', (e) => {
    e.preventDefault();
    console.log('=== START GAME BUTTON CLICKED ===');
    console.log('isAdmin:', isAdmin);
    console.log('currentLobbyCode:', currentLobbyCode);
    console.log('currentLobby:', currentLobby);
    console.log('socket.connected:', socket.connected);
    
    if (!isAdmin) {
        console.log('❌ Not admin - cannot start game');
        showNotification('Nur der Admin kann das Spiel starten', 'error');
        return;
    }
    
    if (!currentLobbyCode) {
        console.log('❌ No lobby code - cannot start game');
        showNotification('Kein Lobby-Code vorhanden', 'error');
        return;
    }
    
    if (!socket.connected) {
        console.log('❌ Socket not connected - cannot start game');
        showNotification('Keine Verbindung zum Server', 'error');
        return;
    }
    
    console.log('✅ All checks passed - emitting start-game event');
    socket.emit('start-game', { lobbyCode: currentLobbyCode });
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
socket.on('error', (error) => {
    console.error('Socket error:', error);
    showNotification(error.message || 'Verbindungsfehler', 'error');
});

socket.on('lobby-created', (data) => {
    console.log('=== LOBBY CREATED EVENT ===');
    console.log('Received data:', data);
    console.log('data.isAdmin:', data.isAdmin);
    
    currentLobbyCode = data.lobbyCode;
    currentLobby = data.lobby;
    isAdmin = data.isAdmin; // Admin Status setzen
    
    console.log('After setting - isAdmin:', isAdmin);
    console.log('currentLobbyCode:', currentLobbyCode);
    
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

socket.on('lobby-updated', (data) => {
    currentLobby = data.lobby;
    isAdmin = data.isAdmin;
    updateLobbyScreen();
    updateVideoPlayerNames();
    showNotification(`Lobby aktualisiert!`, 'info');
});

socket.on('player-joined', (data) => {
    currentLobby = data.lobby;
    updateLobbyScreen();
    updateVideoPlayerNames(); // Spielernamen aktualisieren
    showNotification(`${data.newPlayer.name} ist beigetreten!`, 'info');
});

socket.on('player-left', (data) => {
    currentLobby = data.lobby;
    if (screens.lobby.classList.contains('active')) {
        updateLobbyScreen();
    }
    updateVideoPlayerNames(); // Spielernamen aktualisieren
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

socket.on('game-started', (data) => {
    currentLobby = data.lobby;
    initializeGame();
    showScreen('game');
    showNotification('Spiel gestartet! 📹 Video-Call für alle Spieler verfügbar!', 'success');
    
    // Video-Overlays mit echten Spielernamen aktualisieren
    updateVideoPlayerNames();
    
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
    // Frage anzeigen (das Spielbrett wird automatisch bei lobby-updated neu generiert)
    showQuestion(data);
});

socket.on('answer-processed', (data) => {
    currentLobby = data.lobby;
    hideQuestion();
    generateGameBoard(); // Spielbrett mit deaktivierten Fragen aktualisieren
    updateGameScreen();
    updateVideoPlayerNames(); // Punkte aktualisieren
    showNotification('Antwort verarbeitet!', 'info');
});



socket.on('round-end', (data) => {
    currentLobby = data.lobby;
    updateGameScreen();
    updateVideoPlayerNames(); // Punkte aktualisieren
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

// Buzzer System Events
socket.on('buzzer-activated', (data) => {
    console.log('Buzzer activated for question:', data);
    
    if (!isAdmin) {
        // Zeige Buzzer für Spieler (außer dem ursprünglichen Spieler)
        showBuzzer(data);
    } else {
        // Admin: Nur Notification, UI wurde bereits in processAnswer() geändert
        // Keine doppelte UI-Änderung
        console.log('Buzzer activated - UI already updated locally');
    }
});

socket.on('scores-updated', (data) => {
    console.log('Scores updated:', data);
    
    if (currentLobby) {
        currentLobby.scores = data.scores;
        updateGameScreen();
        updateVideoPlayerNames();
    }
    
    showNotification(`${data.playerName} -${data.pointsLost} Punkte`, 'error');
});

socket.on('answer-processed', (data) => {
    console.log('Answer processed:', data);
    
    // Kompletten Lobby-State aktualisieren
    if (data.lobby) {
        currentLobby = data.lobby;
        updateGameScreen();
        updateVideoPlayerNames();
        generateGameBoard(); // Board neu generieren um graue Buttons zu zeigen
    }
    
    showNotification(`Richtige Antwort! Nächster Spieler ist dran.`, 'success');
    hideQuestion();
});

socket.on('buzzer-pressed', (data) => {
    if (isAdmin) {
        // Admin bekommt Notification über Buzzer-Press
        showBuzzerPress(data);
    }
});

socket.on('buzzer-resolved', (data) => {
    console.log('Buzzer resolved:', data);
    
    // Buzzer-Modus beenden
    isBuzzerMode = false;
    
    hideBuzzer();
    
    if (data.success) {
        showNotification(`${data.playerName} hat die Frage gestohlen! +${currentQuestionData ? currentQuestionData.points : 'Punkte'}`, 'success');
    } else {
        showNotification(`${data.playerName} hat falsch geantwortet. -50% Punkte`, 'error');
    }
    
    // Kompletten Lobby-State aktualisieren
    if (data.lobby) {
        currentLobby = data.lobby;
        updateGameScreen();
        updateVideoPlayerNames();
        generateGameBoard(); // Board neu generieren um graue Buttons zu zeigen
    }
    
    // Frage schließen
    hideQuestion();
});

socket.on('buzzer-closed', (data) => {
    console.log('Buzzer closed by admin:', data);
    
    // Buzzer-Modus beenden
    isBuzzerMode = false;
    
    hideBuzzer();
    showNotification('Frage wurde vom Admin geschlossen', 'info');
    
    // Kompletten Lobby-State aktualisieren
    if (data.lobby) {
        currentLobby = data.lobby;
        updateGameScreen();
        updateVideoPlayerNames();
        generateGameBoard(); // Board neu generieren um graue Buttons zu zeigen
    }
    
    // Frage schließen
    hideQuestion();
});

// Neue Buzzer Events
socket.on('buzzer-locked', (data) => {
    console.log('Buzzer locked:', data);
    
    // Buzzer für alle außer aktivem Spieler deaktivieren
    const buzzerBtn = document.getElementById('buzzer-btn');
    if (buzzerBtn && data.activePlayerId !== socket.id) {
        buzzerBtn.disabled = true;
        buzzerBtn.classList.add('disabled');
        showNotification(`${data.activePlayerName} ist dran!`, 'warning');
    }
});

socket.on('buzzer-reactivated', (data) => {
    console.log('Buzzer reactivated:', data);
    
    // Prüfe ob aktueller Spieler buzzern darf
    const currentPlayerIndex = currentLobby ? currentLobby.players.findIndex(p => p.id === socket.id) : -1;
    const canBuzz = !data.excludedPlayers.includes(currentPlayerIndex) && !data.excludedPlayers.includes(socket.id);
    
    if (canBuzz) {
        const buzzerBtn = document.getElementById('buzzer-btn');
        if (buzzerBtn) {
            buzzerBtn.disabled = false;
            buzzerBtn.classList.remove('disabled');
            showNotification('Buzzer wieder verfügbar!', 'info');
        }
    }
});

socket.on('reset-timer', () => {
    console.log('Timer reset signal received');
    
    // Timer zurücksetzen
    if (questionTimer) {
        stopQuestionTimer();
        startQuestionTimer();
        showNotification('Timer zurückgesetzt!', 'info');
    }
});

// Video Call Events - VERBESSERT mit besserem Timing
socket.on('player-joined-call-notification', (data) => {
    console.log(`📢 Spieler beigetreten-Notification:`, data);
    showNotification(`📹 ${data.playerName} ist dem Video Call beigetreten!`, 'info');
    
    // VEREINFACHTE AGGRESSIVE VERBINDUNGSSTRATEGIE
    if (webrtc && webrtc.isInCall && data.playerId !== socket.id) {
        console.log(`� AGGRESSIVE CONNECT zu: ${data.playerName} (${data.playerId})`);
        
        // Immer neue Connection erstellen oder bestehende verwenden
        if (!webrtc.peerConnections.has(data.playerId)) {
            console.log(`➕ Erstelle neue Peer Connection für ${data.playerName}`);
            webrtc.createPeerConnection(data.playerId, data.playerName);
        }
        
        // BEIDE Seiten versuchen Offers - lass WebRTC das sortieren
        console.log(`📞 Sende sofort Offer an: ${data.playerName}`);
        setTimeout(() => {
            if (webrtc.peerConnections.has(data.playerId) && webrtc.localStream) {
                webrtc.createOffer(data.playerId);
            }
        }, 1000 + Math.random() * 500);
    } else {
        console.log(`⚠️ Überspringe ${data.playerName}: Call=${!!webrtc?.isInCall}, Stream=${!!webrtc?.localStream}, SameId=${data.playerId === socket.id}`);
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

// Neue Events für Video-Slot-Aktualisierung
socket.on('refresh-video-slots', (data) => {
    console.log('🔄 Video-Slots aktualisieren:', data);
    showNotification(`📹 Video-Layout aktualisiert (durch ${data.triggerBy})`, 'info');
    
    if (webrtc && webrtc.isInCall) {
        // Alle Video-Slots neu organisieren
        setTimeout(() => {
            refreshAllVideoSlots(data.participants);
        }, 500);
    }
});

socket.on('video-call-status-update', (data) => {
    console.log('📊 Video Call Status Update:', data);
    
    // Call-Status anzeigen aktualisieren
    const callStatus = document.getElementById('call-status');
    if (callStatus) {
        callStatus.textContent = `Video Call: ${data.participantCount}/5 Teilnehmer`;
    }
    
    // Participant-Liste aktualisieren
    updateCallStatus();
});

// Response auf Participant-Anfrage
socket.on('video-participants-response', (data) => {
    console.log('📋 Video Participants Response:', data);
    
    if (webrtc && webrtc.isInCall) {
        // Force-refresh aller Video-Slots mit Server-Daten
        setTimeout(() => {
            refreshAllVideoSlots(data.participants);
        }, 100);
    }
});

// Force Connect Response
socket.on('force-connect-response', (data) => {
    console.log('🔧 === FORCE CONNECT RESPONSE ===', data);
    
    const { allParticipants, yourSocketId } = data;
    
    if (!webrtc || !webrtc.isInCall) {
        console.log('❌ Nicht im Call - ignoriere Force Connect Response');
        return;
    }
    
    console.log(`🔄 Stelle Verbindungen zu ${allParticipants.length} Participants her...`);
    
    allParticipants.forEach((participant, index) => {
        if (participant.id !== yourSocketId && participant.socketId !== socket.id) {
            console.log(`🔗 AGGRESSIVE Force Connect zu: ${participant.name} (${participant.id})`);
            
            // Immer neue Peer Connection erstellen
            if (!webrtc.peerConnections.has(participant.id)) {
                console.log(`➕ Erstelle neue Peer Connection für ${participant.name}`);
                webrtc.createPeerConnection(participant.id, participant.name);
            }
            
            // AGGRESSIVE: Beide Seiten senden Offers
            setTimeout(() => {
                if (webrtc.peerConnections.has(participant.id) && webrtc.localStream) {
                    console.log(`📞 AGGRESSIVE Offer an ${participant.name}`);
                    webrtc.createOffer(participant.id);
                }
            }, (index + 1) * 300); // Gestaffelte Offers alle 300ms
        }
    });
});

socket.on('someone-force-connecting', (data) => {
    console.log(`ℹ️ ${data.requesterName} startet Force Connect...`);
    showNotification(`🔄 ${data.requesterName} verbindet neu...`, 'info');
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

// Video Call Status Updates
socket.on('video-call-status-update', (data) => {
    console.log('📊 Video Call Status Update:', data);
    updateVideoCallStatusDisplay(data.participantCount, data.participants);
});

// DOM Ready Event Listener für Video Call Buttons (nur im Game)
document.addEventListener('DOMContentLoaded', () => {
    const joinButton = document.getElementById('join-video-call');
    const testButton = document.getElementById('test-webcam');
    
    if (joinButton) {
        joinButton.addEventListener('click', (e) => {
            e.preventDefault();
            joinVideoCall();
        });
    }
    
    if (testButton) {
        testButton.addEventListener('click', (e) => {
            e.preventDefault();
            testWebcam();
        });
    }
});

// Webcam Test Funktion
window.testWebcam = async function testWebcam() {
    console.log('🧪 Teste Webcam...');
    
    const testButton = document.getElementById('test-webcam');
    if (testButton) {
        testButton.disabled = true;
        testButton.textContent = '⏳ Teste Webcam...';
    }
    
    try {
        // Temporären WebRTC Manager für Test verwenden
        const testWebrtc = new WebRTCManager();
        
        showNotification('🧪 Teste Webcam-Zugriff... Browser-Permission erforderlich!', 'info');
        
        const stream = await testWebrtc.initializeLocalStream();
        
        if (stream) {
            const videoTracks = stream.getVideoTracks();
            const audioTracks = stream.getAudioTracks();
            
            showNotification(`✅ Webcam-Test erfolgreich! Video: ${videoTracks.length}, Audio: ${audioTracks.length}`, 'success');
            
            // Stream wieder freigeben
            stream.getTracks().forEach(track => track.stop());
            
            // Join-Button aktivieren
            const joinButton = document.getElementById('join-video-call');
            if (joinButton) {
                joinButton.classList.add('btn-pulse');
                setTimeout(() => {
                    if (joinButton) joinButton.classList.remove('btn-pulse');
                }, 2000);
            }
        } else {
            throw new Error('Kein Stream erhalten');
        }
        
    } catch (error) {
        console.error('❌ Webcam-Test fehlgeschlagen:', error);
        
        let errorMsg = '❌ Webcam-Test fehlgeschlagen';
        if (error.message.includes('verweigert')) {
            errorMsg = '❌ Berechtigung verweigert - bitte Webcam-Zugriff erlauben';
        }
        
        showNotification(errorMsg + ': ' + error.message, 'error');
    } finally {
        if (testButton) {
            testButton.disabled = false;
            testButton.textContent = '🔍 Webcam testen';
        }
    }
}

// VEREINFACHTES WebRTC MANAGEMENT - OHNE KOMPLEXE DEBUG-DIALOGE
class WebRTCManager {
    constructor() {
        this.localStream = null;
        this.peerConnections = new Map();
        this.isInCall = false;
    }

    async initializeLocalStream() {
        console.log('🎥 Initialisiere lokalen Stream...');
        
        // Prüfe ob Media Devices verfügbar sind
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Media Devices API nicht unterstützt - benötigt HTTPS oder localhost');
        }

        // EXPLIZITE Permission-Anfrage für bessere UX
        console.log('🔐 Frage Webcam/Mikrofon Berechtigung an...');
        
        // Flexiblere Strategien - Audio deaktiviert für Discord Call
        const strategies = [
            // Basis Video ohne Audio (für Discord Call)
            {
                video: true, 
                audio: false,
                name: 'Auto-Qualität (nur Video)'
            },
            // Standard Qualität ohne Audio (für Discord Call)
            {
                video: { 
                    width: { ideal: 640 }, 
                    height: { ideal: 480 }
                }, 
                audio: false,
                name: 'Standard Qualität (nur Video)'
            },
            // Hohe Qualität ohne Audio
            {
                video: { 
                    width: { ideal: 1280 }, 
                    height: { ideal: 720 }
                }, 
                audio: false,
                name: 'Hohe Qualität (nur Video)'
            },
            // Minimale Constraints
            {
                video: {}, 
                audio: {},
                name: 'Minimal'
            },
            // Nur Audio als letzter Ausweg
            {
                video: false,
                audio: true,
                name: 'Nur Audio'
            }
        ];

        let lastError = null;
        
        for (let i = 0; i < strategies.length; i++) {
            try {
                console.log(`🎥 Versuche Strategie ${i+1}/${strategies.length}: ${strategies[i].name}...`);
                
                // Expliziter getUserMedia Aufruf
                this.localStream = await navigator.mediaDevices.getUserMedia(strategies[i]);
                
                if (this.localStream) {
                    const videoTracks = this.localStream.getVideoTracks();
                    const audioTracks = this.localStream.getAudioTracks();
                    
                    console.log(`✅ Stream erfolgreich: ${strategies[i].name}`);
                    console.log(`📹 Video Tracks: ${videoTracks.length}`);
                    console.log(`🎤 Audio Tracks: ${audioTracks.length}`);
                    
                    if (videoTracks.length > 0) {
                        const videoSettings = videoTracks[0].getSettings();
                        console.log(`📐 Video Auflösung: ${videoSettings.width}x${videoSettings.height}`);
                    }
                    
                    return this.localStream;
                }
                
            } catch (error) {
                lastError = error;
                console.error(`❌ Strategie ${i+1} fehlgeschlagen: ${strategies[i].name}`, error);
                console.error(`❌ Error Name: ${error.name}, Message: ${error.message}`);
                
                // Spezifische Fehlerbehandlung
                if (error.name === 'NotAllowedError') {
                    throw new Error('Kamera/Mikrofon-Zugriff wurde verweigert. Bitte erlaube den Zugriff in den Browser-Einstellungen.');
                } else if (error.name === 'NotFoundError') {
                    console.log(`⚠️ Kamera nicht gefunden bei Strategie ${i+1}, versuche nächste...`);
                } else if (error.name === 'NotReadableError') {
                    console.log(`⚠️ Kamera belegt bei Strategie ${i+1}, versuche nächste...`);
                }
                
                if (i === strategies.length - 1) {
                    throw lastError || error;
                }
            }
        }
        
        throw new Error('Keine gültige Kamera/Mikrofon-Konfiguration gefunden');
    }

    createPeerConnection(peerId, peerName) {
        console.log(`🔗 Erstelle Peer Connection für: ${peerName} (ID: ${peerId})`);
        
        const peerConnection = new RTCPeerConnection(rtcConfig);
        
        this.peerConnections.set(peerId, {
            connection: peerConnection,
            name: peerName
        });

        // Stream hinzufügen mit detailliertem Logging
        if (this.localStream) {
            const tracks = this.localStream.getTracks();
            console.log(`➕ Füge ${tracks.length} Tracks für ${peerName} hinzu:`, 
                tracks.map(t => `${t.kind} (${t.enabled ? 'enabled' : 'disabled'})`));
            
            tracks.forEach(track => {
                const sender = peerConnection.addTrack(track, this.localStream);
                console.log(`✅ Track ${track.kind} hinzugefügt für ${peerName}, Sender:`, sender);
            });
            
            // Prüfe ob Transceiver korrekt eingerichtet sind
            const transceivers = peerConnection.getTransceivers();
            console.log(`📡 ${transceivers.length} Transceiver für ${peerName}:`, 
                transceivers.map(t => `${t.direction} (${t.mid})`));
        } else {
            console.warn(`⚠️ Kein lokaler Stream verfügbar beim Erstellen der Peer Connection für ${peerName}`);
        }

        // Gespeicherte ICE Candidates verarbeiten (Race Condition Fix)
        if (this.pendingIceCandidates && this.pendingIceCandidates.has(peerId)) {
            const candidates = this.pendingIceCandidates.get(peerId);
            console.log(`🔄 Verarbeite ${candidates.length} gespeicherte ICE Candidates für ${peerName}`);
            
            candidates.forEach(async (candidate, index) => {
                try {
                    await peerConnection.addIceCandidate(candidate);
                    console.log(`✅ Gespeicherter ICE Candidate ${index + 1} für ${peerName} hinzugefügt`);
                } catch (error) {
                    console.error(`❌ Fehler bei gespeichertem ICE Candidate ${index + 1}:`, error);
                }
            });
            
            this.pendingIceCandidates.delete(peerId);
        }

        // Event Handlers mit MAXIMALEM Debugging
        peerConnection.ontrack = (event) => {
            console.log(`🎉 ONTRACK EVENT AUSGELÖST für: ${peerName}`);
            console.log(`📹 Event Object:`, event);
            console.log(`📹 Event Details:`, {
                streamsCount: event.streams?.length || 0,
                hasTrack: !!event.track,
                trackKind: event.track?.kind,
                trackEnabled: event.track?.enabled,
                trackReadyState: event.track?.readyState,
                receiver: !!event.receiver
            });
            
            if (event.streams && event.streams.length > 0) {
                const remoteStream = event.streams[0];
                console.log(`🎬 Remote Stream Details:`, {
                    id: remoteStream.id,
                    active: remoteStream.active,
                    videoTracks: remoteStream.getVideoTracks().length,
                    audioTracks: remoteStream.getAudioTracks().length
                });
                
                console.log(`📺 Rufe displayRemoteVideo auf für ${peerName}...`);
                displayRemoteVideo(remoteStream, peerId, peerName);
            } else if (event.track) {
                console.warn(`⚠️ Track ohne Stream empfangen für ${peerName} - erstelle neuen Stream`);
                const newStream = new MediaStream([event.track]);
                displayRemoteVideo(newStream, peerId, peerName);
            } else {
                console.error(`❌ Weder Stream noch Track in ontrack Event für ${peerName}!`);
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`🧊 ICE Candidate gesendet an ${peerName}`);
                socket.emit('ice-candidate', {
                    to: peerId,
                    candidate: event.candidate,
                    lobbyCode: currentLobbyCode
                });
            } else {
                console.log(`🏁 ICE Gathering abgeschlossen für ${peerName}`);
            }
        };

        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;
            console.log(`🔄 Connection State (${peerName}): ${state}`);
            
            if (state === 'connected') {
                console.log(`✅ WebRTC Verbindung zu ${peerName} hergestellt`);
                showNotification(`✅ Verbunden mit ${peerName}`, 'success');
            } else if (state === 'failed' || state === 'disconnected') {
                console.log(`❌ WebRTC Verbindung zu ${peerName} ${state}`);
                showNotification(`❌ Verbindung zu ${peerName} ${state}`, 'error');
            }
        };
    }

    async createOffer(peerId) {
        const peerData = this.peerConnections.get(peerId);
        if (!peerData) {
            console.error(`❌ Peer Connection nicht gefunden beim createOffer für: ${peerId}`);
            return;
        }

        try {
            console.log(`📝 Erstelle Offer für: ${peerData.name}`);
            
            // Prüfe Connection State vor Offer
            console.log(`🔍 Connection State vor Offer: ${peerData.connection.connectionState}`);
            console.log(`🔍 Signaling State vor Offer: ${peerData.connection.signalingState}`);
            
            // Prüfe ob lokaler Stream korrekt hinzugefügt wurde
            const senders = peerData.connection.getSenders();
            console.log(`📡 Sender für ${peerData.name}:`, senders.map(s => s.track?.kind || 'null'));
            
            const offer = await peerData.connection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            await peerData.connection.setLocalDescription(offer);
            console.log(`✅ Local Description gesetzt für: ${peerData.name}`);
            
            socket.emit('webrtc-offer', {
                to: peerId,
                offer: offer,
                lobbyCode: currentLobbyCode
            });
            
            console.log(`📤 Offer gesendet an: ${peerData.name} (${peerId})`);
        } catch (error) {
            console.error(`❌ Fehler beim Erstellen des Offers für ${peerData.name}:`, error);
        }
    }

    async handleOffer(data) {
        console.log(`📥 Behandle Offer von: ${data.from}`);
        
        const peerData = this.peerConnections.get(data.from);
        if (!peerData) {
            console.warn(`❌ Peer Connection nicht gefunden für Offer von: ${data.from}`);
            console.log(`🔍 Verfügbare Peer Connections:`, Array.from(this.peerConnections.keys()));
            return;
        }

        try {
            console.log(`🔍 Connection State vor setRemoteDescription: ${peerData.connection.connectionState}`);
            console.log(`🔍 Signaling State vor setRemoteDescription: ${peerData.connection.signalingState}`);
            
            await peerData.connection.setRemoteDescription(data.offer);
            console.log(`✅ Remote Description gesetzt für: ${peerData.name}`);
            
            // Prüfe ob lokaler Stream hinzugefügt wurde
            const senders = peerData.connection.getSenders();
            console.log(`📡 Meine Sender für ${peerData.name}:`, senders.map(s => s.track?.kind || 'null'));
            
            const answer = await peerData.connection.createAnswer();
            await peerData.connection.setLocalDescription(answer);
            console.log(`✅ Answer erstellt und Local Description gesetzt für: ${peerData.name}`);
            
            socket.emit('webrtc-answer', {
                to: data.from,
                answer: answer,
                lobbyCode: currentLobbyCode
            });
            
            console.log(`📤 Answer gesendet an: ${peerData.name} (${data.from})`);
        } catch (error) {
            console.error(`❌ Fehler beim Behandeln des Offers von ${peerData.name}:`, error);
        }
    }

    async handleAnswer(data) {
        console.log(`📥 Behandle Answer von: ${data.from}`);
        
        const peerData = this.peerConnections.get(data.from);
        if (!peerData) {
            console.warn(`❌ Peer Connection nicht gefunden für Answer von: ${data.from}`);
            console.log(`🔍 Verfügbare Peer Connections:`, Array.from(this.peerConnections.keys()));
            return;
        }

        try {
            console.log(`🔍 Connection State vor setRemoteDescription (Answer): ${peerData.connection.connectionState}`);
            console.log(`🔍 Signaling State vor setRemoteDescription (Answer): ${peerData.connection.signalingState}`);
            
            await peerData.connection.setRemoteDescription(data.answer);
            console.log(`📥 Answer von ${peerData.name} verarbeitet - WebRTC Negotiation abgeschlossen`);
            
            // Final Status Check
            setTimeout(() => {
                console.log(`🔍 Finale Connection States für ${peerData.name}:`);
                console.log(`  - Connection: ${peerData.connection.connectionState}`);
                console.log(`  - Signaling: ${peerData.connection.signalingState}`);
                console.log(`  - ICE Gathering: ${peerData.connection.iceGatheringState}`);
                console.log(`  - ICE Connection: ${peerData.connection.iceConnectionState}`);
            }, 1000);
            
        } catch (error) {
            console.error(`❌ Fehler beim Behandeln der Answer von ${peerData.name}:`, error);
        }
    }

    async handleIceCandidate(data) {
        const peerData = this.peerConnections.get(data.from);
        if (!peerData) {
            console.warn(`❌ Peer Connection nicht gefunden für ICE Candidate von ${data.from}`);
            console.log(`🔍 Verfügbare Peer Connections:`, Array.from(this.peerConnections.keys()));
            
            // ICE Candidate für später speichern (Race Condition Fix)
            if (!this.pendingIceCandidates) {
                this.pendingIceCandidates = new Map();
            }
            if (!this.pendingIceCandidates.has(data.from)) {
                this.pendingIceCandidates.set(data.from, []);
            }
            this.pendingIceCandidates.get(data.from).push(data.candidate);
            console.log(`💾 ICE Candidate für ${data.from} gespeichert für später`);
            return;
        }

        try {
            await peerData.connection.addIceCandidate(data.candidate);
            console.log(`✅ ICE Candidate von ${peerData.name} hinzugefügt`);
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

// DEBUG FUNKTION - in Konsole aufrufbar
window.debugWebRTC = function() {
    console.log('🔧 WebRTC Debug Status:');
    console.log(`📡 Peer Connections: ${webrtc.peerConnections.size}`);
    console.log(`🎥 Lokaler Stream: ${webrtc.localStream ? 'Vorhanden' : 'Fehlt'}`);
    console.log(`📞 Im Call: ${webrtc.isInCall}`);
    
    if (webrtc.localStream) {
        const tracks = webrtc.localStream.getTracks();
        console.log(`📹 Lokale Tracks: ${tracks.map(t => `${t.kind}(${t.enabled?'on':'off'})`).join(', ')}`);
    }
    
    webrtc.peerConnections.forEach((peerData, peerId) => {
        const conn = peerData.connection;
        console.log(`👤 ${peerData.name} (${peerId}):`);
        console.log(`  - Connection: ${conn.connectionState}`);
        console.log(`  - Signaling: ${conn.signalingState}`);
        console.log(`  - ICE Connection: ${conn.iceConnectionState}`);
        console.log(`  - ICE Gathering: ${conn.iceGatheringState}`);
        
        const senders = conn.getSenders();
        console.log(`  - Senders: ${senders.map(s => s.track?.kind || 'null').join(', ')}`);
        
        const receivers = conn.getReceivers();
        console.log(`  - Receivers: ${receivers.map(r => r.track?.kind || 'null').join(', ')}`);
    });
};

// VIDEO CALL FUNCTIONS - VEREINFACHT
function setupVideoCallControls() {
    // Audio/Video Controls
    const toggleAudioBtn = document.getElementById('toggle-audio');
    const toggleVideoBtn = document.getElementById('toggle-video');
    const leaveCallBtn = document.getElementById('leave-call');
    
    if (toggleAudioBtn) toggleAudioBtn.addEventListener('click', toggleAudio);
    if (toggleVideoBtn) toggleVideoBtn.addEventListener('click', toggleVideo);
    if (leaveCallBtn) leaveCallBtn.addEventListener('click', leaveVideoCall);
    
    const refreshCamsBtn = document.getElementById('refresh-cams');
    if (refreshCamsBtn) refreshCamsBtn.addEventListener('click', refreshAllCams);
}

// Video Call Funktion global verfügbar machen - VERBESSERT
window.joinVideoCall = async function joinVideoCall() {
    console.log('🎬 Starte Video Call...');
    
    // Detaillierte Sicherheitsprüfung
    console.log('🔍 Prüfe Umgebung...');
    console.log('📍 Protocol:', location.protocol);
    console.log('🌐 Hostname:', location.hostname);
    console.log('📱 User Agent:', navigator.userAgent);
    
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isSecure) {
        showNotification('🔒 HTTPS erforderlich für Webcam-Zugriff! Aktuell: ' + location.protocol, 'error');
        return;
    }
    
    // Prüfe MediaDevices API
    if (!navigator.mediaDevices) {
        showNotification('❌ MediaDevices API nicht verfügbar - Browser zu alt?', 'error');
        return;
    }
    
    // Button deaktivieren während des Ladens
    const joinButton = document.getElementById('join-video-call');
    if (joinButton) {
        joinButton.disabled = true;
        joinButton.textContent = '⏳ Webcam wird gestartet...';
    }
    
    showNotification('📹 Starte Webcam... Browser-Permission erforderlich!', 'info');

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
        
        // Control-Buttons aktivieren
        const audioBtn = document.getElementById('toggle-audio');
        const videoBtn = document.getElementById('toggle-video');
        const leaveBtn = document.getElementById('leave-call');
        const joinBtn = document.getElementById('join-video-call');
        
        if (audioBtn) audioBtn.disabled = false;
        if (videoBtn) videoBtn.disabled = false;
        if (leaveBtn) { 
            leaveBtn.disabled = false;
            leaveBtn.style.display = 'inline-block';
        }
        if (joinBtn) joinBtn.style.display = 'none';
        
        // Refresh-Button anzeigen
        const refreshBtn = document.getElementById('refresh-cams');
        if (refreshBtn) refreshBtn.style.display = 'inline-block';
        
        // 4. Anderen Spielern Beitritt mitteilen
        const myPlayerName = isAdmin ? currentLobby.adminName : getPlayerName();
        console.log(`📢 Melde Video Call Beitritt: ${myPlayerName} (ID: ${socket.id})`);
        
        socket.emit('player-joined-call', {
            lobbyCode: currentLobbyCode,
            playerName: myPlayerName,
            playerId: socket.id
        });
        
        // 5. Connections zu anderen Spielern aufbauen
        setupPeerConnectionsForExistingPlayers();
        
        // 6. SOFORT nach Join: Force Connect zu allen bestehenden Teilnehmern
        setTimeout(() => {
            console.log('🚀 AUTO FORCE CONNECT nach Video Call Join...');
            if (currentLobbyCode) {
                socket.emit('force-connect-all-participants', { 
                    lobbyCode: currentLobbyCode,
                    mySocketId: socket.id 
                });
            }
        }, 3000); // 3 Sekunden Verzögerung damit alle initialisiert sind
        
        showNotification('✅ Video Call gestartet!', 'success');
        
    } catch (error) {
        console.error('❌ Video Call Fehler:', error);
        console.error('❌ Error Stack:', error.stack);
        
        // Button wieder aktivieren
        const joinButton = document.getElementById('join-video-call');
        if (joinButton) {
            joinButton.disabled = false;
            joinButton.textContent = '📹 Video Call beitreten';
        }
        
        let errorMsg = 'Webcam/Mikrofon Zugriff fehlgeschlagen';
        let helpText = '';
        
        if (error.name === 'NotFoundError') {
            errorMsg = '❌ Keine Kamera/Mikrofon gefunden';
            helpText = 'Bitte überprüfe, ob deine Webcam angeschlossen ist.';
        } else if (error.name === 'NotAllowedError') {
            errorMsg = '❌ Kamera-Zugriff verweigert';
            helpText = 'Klicke auf das Kamera-Symbol in der Adressleiste und erlaube den Zugriff.';
        } else if (error.name === 'NotReadableError') {
            errorMsg = '❌ Kamera bereits in Verwendung';
            helpText = 'Schließe andere Apps die deine Webcam verwenden (Zoom, Teams, etc.).';
        } else if (error.message.includes('Media Devices API')) {
            errorMsg = '❌ Browser nicht unterstützt';
            helpText = 'Verwende Chrome, Firefox oder Edge mit HTTPS.';
        }
        
        showNotification(errorMsg + ': ' + error.message, 'error');
        if (helpText) {
            setTimeout(() => {
                showNotification('💡 Tipp: ' + helpText, 'info');
            }, 2000);
        }
    }
}

// Video Call verlassen Funktion - ERWEITERT
window.leaveVideoCall = function leaveVideoCall() {
    console.log('🏠 Verlasse Video Call...');
    
    try {
        // Server benachrichtigen
        const myPlayerName = isAdmin ? currentLobby?.adminName : getPlayerName();
        if (currentLobbyCode && myPlayerName) {
            socket.emit('player-left-call', {
                lobbyCode: currentLobbyCode,
                playerName: myPlayerName,
                playerId: socket.id
            });
        }
        
        // WebRTC cleanup
        if (webrtc) {
            webrtc.cleanup();
        }
        
        // UI zurücksetzen
        isInCall = false;
        
        // Video-Elemente ausblenden
        const videoCallSection = document.querySelector('.video-call-section');
        if (videoCallSection) {
            videoCallSection.style.display = 'none';
        }
        
        const lobbyVideoCall = document.querySelector('.lobby-video-call');
        if (lobbyVideoCall) {
            lobbyVideoCall.style.display = 'none';
        }
        
        // Buttons zurücksetzen
        const joinBtn = document.getElementById('join-video-call');
        const leaveBtn = document.getElementById('leave-call');
        const audioBtn = document.getElementById('toggle-audio');
        const videoBtn = document.getElementById('toggle-video');
        
        if (joinBtn) {
            joinBtn.style.display = 'block';
            joinBtn.disabled = false;
        }
        if (leaveBtn) {
            leaveBtn.disabled = true;
            leaveBtn.style.display = 'none';
        }
        if (audioBtn) audioBtn.disabled = true;
        if (videoBtn) videoBtn.disabled = true;
        
        // Refresh-Button verstecken
        const refreshBtn = document.getElementById('refresh-cams');
        if (refreshBtn) refreshBtn.style.display = 'none';
        
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
                const mySlot = isAdmin ? 
                    document.getElementById('admin-video') : 
                    document.querySelector('.player-video-slot[data-occupied="true"]');
                    
                if (mySlot) {
                    const localVideo = mySlot.querySelector('.player-video');
                    if (localVideo) {
                        localVideo.style.visibility = videoTrack.enabled ? 'visible' : 'hidden';
                    }
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

// Funktion zum manuellen Aktualisieren aller Cams - FORCE CONNECT
window.refreshAllCams = function refreshAllCams() {
    console.log('🔄 === FORCE CONNECT ALL GESTARTET ===');
    
    if (!webrtc || !webrtc.isInCall) {
        showNotification('❌ Nicht im Video Call!', 'error');
        return;
    }
    
    showNotification('🔄 Force Connect zu allen Teilnehmern...', 'info');
    
    // 1. Debug aktuelle Situation
    console.log('📊 Aktuelle WebRTC Situation:');
    console.log('   - Mein Stream:', !!webrtc.localStream);
    console.log('   - Peer Connections:', webrtc.peerConnections.size);
    console.log('   - Lobby Code:', currentLobbyCode);
    
    // 2. Mein eigenes Video sicherstellen
    if (webrtc.localStream) {
        displayMyVideo(webrtc.localStream);
    }
    
    // 3. Server nach ALLEN Participants fragen und dann FORCE CONNECT
    if (currentLobbyCode) {
        console.log('� Fordere komplette Teilnehmer-Liste vom Server...');
        socket.emit('force-connect-all-participants', { 
            lobbyCode: currentLobbyCode,
            mySocketId: socket.id 
        });
    }
    
    // 4. Bestehende Connections prüfen und reparieren
    webrtc.peerConnections.forEach((peerData, peerId) => {
        console.log(`🔍 Prüfe Connection zu ${peerId}:`, {
            hasConnection: !!peerData.connection,
            connectionState: peerData.connection?.connectionState,
            hasRemoteStream: !!peerData.remoteStream,
            iceConnectionState: peerData.connection?.iceConnectionState
        });
        
        // Falls Connection da ist aber kein Stream - neu verbinden
        if (peerData.connection && !peerData.remoteStream) {
            console.log(`🔧 Connection ohne Stream - erstelle neue...`);
            setTimeout(() => {
                if (socket.id < peerId) {
                    console.log(`📞 Force Offer an ${peerId}`);
                    webrtc.createOffer(peerId);
                }
            }, 1000);
        }
    });
    
    showNotification('✅ Force Connect abgeschlossen!', 'success');
    setTimeout(() => debugSlotAssignment(), 1000);
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

function updateVideoCallStatusDisplay(participantCount, participants) {
    console.log(`📊 Aktualisiere Video Call Status: ${participantCount} Teilnehmer`, participants);
    
    // Direkter Zugriff auf das richtige Element
    const statusElement = document.getElementById('call-participants');
    
    if (statusElement) {
        const maxParticipants = 5; // Admin + 4 Spieler
        statusElement.textContent = `${participantCount}/${maxParticipants} Teilnehmer`;
        
        // Styling basierend auf Teilnehmerzahl
        if (participantCount > 0) {
            statusElement.style.color = '#16a34a'; // Grün
            statusElement.style.fontWeight = 'bold';
        } else {
            statusElement.style.color = '#94a3b8'; // Grau
            statusElement.style.fontWeight = 'normal';
        }
        
        console.log(`✅ Video Call Status aktualisiert: ${participantCount}/${maxParticipants} Teilnehmer`);
        
        // Optional: Zeige auch Participant-Namen in der Konsole
        if (participants && participants.length > 0) {
            const participantNames = participants.map(p => p.name).join(', ');
            console.log(`� Teilnehmer: ${participantNames}`);
        }
    } else {
        console.warn('❌ call-participants Element nicht gefunden!');
    }
}

// Hilfsfunktion: Bestimme feste Slot-Position basierend auf Lobby-Reihenfolge
function getFixedSlotForPlayer(playerId) {
    console.log(`🔍 Suche Slot für playerId: ${playerId}`);
    console.log(`🔍 currentLobby:`, currentLobby);
    console.log(`🔍 isAdmin: ${isAdmin}, socket.id: ${socket.id}`);
    
    // Einfache Fallback-Logik falls currentLobby fehlt
    if (!currentLobby) {
        console.warn('⚠️ Keine currentLobby verfügbar - verwende alte Logik');
        
        // Wenn ich Admin bin, nehme admin-video
        if (isAdmin && playerId === socket.id) {
            return document.getElementById('admin-video');
        }
        
        // Sonst ersten freien Slot
        const slotIds = ['admin-video', 'player1-video', 'player2-video', 'player3-video', 'player4-video'];
        for (const slotId of slotIds) {
            const slot = document.getElementById(slotId);
            if (slot && (!slot.dataset.playerId || slot.dataset.playerId === playerId)) {
                console.log(`📺 Fallback-Slot ${slotId} für ${playerId}`);
                return slot;
            }
        }
        return null;
    }
    
    // Admin bekommt immer Slot 1 (admin-video)
    if (playerId === currentLobby.admin || (isAdmin && playerId === socket.id)) {
        console.log(`👑 Admin-Slot für ${playerId}`);
        return document.getElementById('admin-video');
    }
    
    // Für Spieler: Finde Position in der Spieler-Liste
    const playerIndex = currentLobby.players.findIndex(p => p.id === playerId);
    if (playerIndex !== -1 && playerIndex < 4) {
        const slotIds = ['player1-video', 'player2-video', 'player3-video', 'player4-video'];
        const slotId = slotIds[playerIndex];
        console.log(`🎮 Spieler-Slot ${slotId} für ${playerId} (Position ${playerIndex + 1})`);
        return document.getElementById(slotId);
    }
    
    // Fallback: Finde ersten freien Slot
    console.warn(`⚠️ Spieler ${playerId} nicht in Lobby gefunden, verwende freien Slot`);
    const slotIds = ['player1-video', 'player2-video', 'player3-video', 'player4-video'];
    for (const slotId of slotIds) {
        const slot = document.getElementById(slotId);
        if (slot && !slot.dataset.playerId) {
            console.log(`📺 Freier Slot ${slotId} für ${playerId}`);
            return slot;
        }
    }
    
    console.error(`❌ Kein Slot verfügbar für ${playerId}`);
    return null;
}

function displayMyVideo(stream) {
    console.log(`🎥 Zeige mein Video... (isAdmin: ${isAdmin}, Socket-ID: ${socket.id})`);
    
    // Versuche feste Slot-Zuordnung, fallback auf Admin/freien Slot
    let myVideoSlot = getFixedSlotForPlayer(socket.id);
    
    // Fallback falls feste Zuordnung fehlschlägt
    if (!myVideoSlot) {
        console.warn(`⚠️ Feste Zuordnung fehlgeschlagen, verwende Fallback`);
        if (isAdmin) {
            myVideoSlot = document.getElementById('admin-video');
        } else {
            // Finde ersten freien Spieler-Slot
            const playerSlots = ['player1-video', 'player2-video', 'player3-video', 'player4-video'];
            for (const slotId of playerSlots) {
                const slot = document.getElementById(slotId);
                if (slot && !slot.dataset.playerId) {
                    myVideoSlot = slot;
                    break;
                }
            }
        }
    }
    
    if (myVideoSlot) {
        myVideoSlot.dataset.playerId = socket.id;
        console.log(`✅ Video-Slot ${myVideoSlot.id} für mich (Socket-ID: ${socket.id})`);
    }
    
    if (myVideoSlot) {
        const video = myVideoSlot.querySelector('.player-video');
        const placeholder = myVideoSlot.querySelector('.video-placeholder');
        
        if (video && stream) {
            video.srcObject = stream;
            video.muted = true; // Audio stumm, aber Video sichtbar
            
            // Speichere meinen Video-Slot für spätere Referenz
            myVideoSlot.dataset.playerId = socket.id;
            
            video.play().then(() => {
                console.log('✅ Lokales Video gestartet');
                video.style.display = 'block';
                if (placeholder) {
                    placeholder.style.display = 'none';
                }
                myVideoSlot.classList.add('active');
                
                // Player-Label aktualisieren
                const playerLabel = myVideoSlot.querySelector('.player-label');
                if (playerLabel) {
                    const myName = isAdmin ? currentLobby?.adminName : getPlayerName();
                    playerLabel.textContent = myName + ' (Du)';
                }
                
                // Video Call Sektion anzeigen
                const videoCallSection = document.querySelector('.video-call-section');
                if (videoCallSection) {
                    videoCallSection.style.display = 'block';
                }
            }).catch(error => {
                console.error('❌ Video Play Fehler:', error);
            });
        }
    } else {
        console.error('❌ Kein Video-Slot gefunden!');
    }
}

function displayRemoteVideo(stream, peerId, peerName) {
    console.log(`📺 Zeige Remote Video für: ${peerName} (ID: ${peerId})`);
    console.log(`📺 Stream Details:`, stream ? {
        id: stream.id,
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length
    } : 'Kein Stream!');
    
    if (!stream) {
        console.error(`❌ Kein Stream für ${peerName} erhalten!`);
        return;
    }
    
    // Versuche feste Slot-Zuordnung, fallback auf freie Slots
    let targetSlot = getFixedSlotForPlayer(peerId);
    
    // Falls feste Zuordnung fehlschlägt, verwende freien Slot
    if (!targetSlot) {
        console.warn(`⚠️ Feste Zuordnung fehlgeschlagen für ${peerId}, suche freien Slot`);
        const videoSlots = document.querySelectorAll('.player-video-slot');
        
        for (const slot of videoSlots) {
            // Überspringe meinen eigenen Slot
            if (slot.dataset.playerId === socket.id) {
                continue;
            }
            
            // Finde freien Slot oder bereits diesem Peer zugewiesenen
            if (!slot.dataset.playerId || slot.dataset.playerId === peerId) {
                targetSlot = slot;
                console.log(`✅ Freier Slot ${slot.id} für ${peerName}`);
                break;
            }
        }
    }
    
    if (targetSlot) {
        console.log(`📺 Video-Slot ${targetSlot.id} gefunden für ${peerName}`);
        targetSlot.dataset.playerId = peerId;
        
        const video = targetSlot.querySelector('.player-video');
        const placeholder = targetSlot.querySelector('.video-placeholder');
        const playerLabel = targetSlot.querySelector('.player-label');
        
        if (!video) {
            console.error(`❌ Kein Video-Element in Slot ${targetSlot.id} gefunden!`);
            return;
        }
        
        console.log(`🎬 Setze Stream für ${peerName}...`);
        video.srcObject = stream;
        video.muted = false; // Remote Video nicht stumm schalten
        video.autoplay = true;
        video.playsInline = true;
        
        video.onloadedmetadata = () => {
            console.log(`📐 Video Metadaten geladen für ${peerName}: ${video.videoWidth}x${video.videoHeight}`);
        };
        
        video.play().then(() => {
            console.log(`✅ Remote Video gestartet für ${peerName}`);
            video.style.display = 'block';
            if (placeholder) {
                placeholder.style.display = 'none';
            }
            targetSlot.classList.add('active');
            
            // Player-Label aktualisieren
            if (playerLabel) {
                playerLabel.textContent = peerName;
            }
            
            // Erfolgs-Notification
            showNotification(`✅ ${peerName}'s Video wird angezeigt`, 'success');
            
        }).catch(error => {
            console.error(`❌ Remote Video Play Fehler für ${peerName}:`, error);
            showNotification(`❌ Video-Wiedergabe für ${peerName} fehlgeschlagen`, 'error');
        });
    } else {
        console.error(`❌ Kein freier Video-Slot für ${peerName} gefunden!`);
        console.log(`📊 Aktuelle Slot-Belegung:`);
        videoSlots.forEach((slot, i) => {
            console.log(`  Slot ${i} (${slot.id}): ${slot.dataset.playerId || 'frei'}`);
        });
        showNotification(`❌ Kein Video-Slot für ${peerName} verfügbar`, 'error');
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
    delete playerSlot.dataset.playerId;
}

function getPlayerName() {
    // Finde aktuellen Spieler-Namen
    const currentPlayer = currentLobby.players.find(p => p.id === socket.id);
    return currentPlayer ? currentPlayer.name : 'Unbekannt';
}

// Neue Funktion: Alle Video-Slots neu organisieren - VORSICHTIG
function refreshAllVideoSlots(participants) {
    console.log('🔄 Refreshing all video slots with participants:', participants);
    
    if (!webrtc || !webrtc.isInCall) {
        console.log('⚠️ Nicht im Video Call - überspringe Refresh');
        return;
    }
    
    console.log('📊 Aktuelle Peer Connections:', webrtc.peerConnections.size);
    console.log('📊 Lokaler Stream verfügbar:', !!webrtc.localStream);
    
    // NICHT alle Slots zurücksetzen - nur neu zuweisen
    console.log('🔄 Weise alle Videos neu zu...');
    
    participants.forEach(participant => {
        console.log(`🔍 Verarbeite Participant: ${participant.name} (${participant.id})`);
        
        if (participant.id === socket.id) {
            // Das bin ich selbst - stelle sicher dass mein Video da ist
            console.log(`👤 Das bin ich selbst - überprüfe lokales Video`);
            if (webrtc.localStream) {
                const mySlot = getFixedSlotForPlayer(socket.id);
                if (mySlot && !mySlot.dataset.playerId) {
                    console.log(`🔄 Weise mein lokales Video neu zu`);
                    displayMyVideo(webrtc.localStream);
                }
            }
        } else {
            // Remote Participant - suche aktive Connection
            const peerConnection = webrtc.peerConnections.get(participant.id);
            if (peerConnection && peerConnection.remoteStream) {
                console.log(`🔗 Re-assigning remote video for ${participant.name}`);
                displayRemoteVideo(peerConnection.remoteStream, participant.id, participant.name);
            } else {
                console.log(`❌ Keine aktive Connection für ${participant.name}`);
            }
        }
    });
    
    console.log('✅ Video-Slot-Refresh abgeschlossen');
    
    // Debug: Zeige finale Slot-Zuordnung
    setTimeout(() => debugSlotAssignment(), 200);
}

// Debug-Funktion: Zeige aktuelle Slot-Zuordnung
function debugSlotAssignment() {
    console.log('🔍 === AKTUELLE SLOT-ZUORDNUNG ===');
    const slots = document.querySelectorAll('.player-video-slot');
    slots.forEach(slot => {
        const playerId = slot.dataset.playerId;
        const playerLabel = slot.querySelector('.player-label')?.textContent;
        const video = slot.querySelector('.player-video');
        const hasStream = video && video.srcObject;
        const isPlaying = video && !video.paused;
        console.log(`📺 ${slot.id}: ${playerId ? `Player ${playerId} (${playerLabel}) Stream:${hasStream ? '✅' : '❌'} Playing:${isPlaying ? '✅' : '❌'}` : 'LEER'}`);
    });
    console.log('🔍 === ENDE SLOT-ZUORDNUNG ===');
}

// Debug WebRTC Status
window.debugWebRTC = function() {
    console.log('🔍 === WEBRTC DEBUG STATUS ===');
    console.log('🔍 isInCall:', webrtc?.isInCall);
    console.log('🔍 localStream:', !!webrtc?.localStream);
    console.log('🔍 Peer Connections:', webrtc?.peerConnections?.size || 0);
    
    if (webrtc?.peerConnections) {
        webrtc.peerConnections.forEach((peerData, peerId) => {
            console.log(`🔗 ${peerId}:`, {
                connectionState: peerData.connection?.connectionState,
                iceConnectionState: peerData.connection?.iceConnectionState,
                hasRemoteStream: !!peerData.remoteStream,
                name: peerData.name
            });
        });
    }
    console.log('🔍 === ENDE WEBRTC DEBUG ===');
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
    console.log('updateLobbyScreen - isAdmin:', isAdmin);
    console.log('updateLobbyScreen - players.length:', currentLobby.players.length);
    console.log('updateLobbyScreen - button found:', !!startBtn);
    
    if (startBtn) {
        startBtn.disabled = !isAdmin;
        
        if (isAdmin) {
            startBtn.textContent = 'Spiel Starten';
            startBtn.classList.remove('disabled');
            startBtn.style.backgroundColor = '#4CAF50'; // Grün für Admin
        } else {
            startBtn.textContent = 'Nur Admin kann starten';
            startBtn.classList.add('disabled');
            startBtn.style.backgroundColor = '#666'; // Grau für Nicht-Admin
        }
    } else {
        console.error('Start button not found!');
    }
    
    // Video-Overlays mit echten Spielernamen aktualisieren
    updateVideoPlayerNames();
}

// Video-Overlays mit echten Spielernamen aktualisieren
function updateVideoPlayerNames() {
    if (!currentLobby) return;
    
    // Admin Video aktualisieren
    const adminVideo = document.getElementById('admin-video');
    if (adminVideo && currentLobby.adminName) {
        let adminInfoElement = adminVideo.querySelector('.player-info');
        if (!adminInfoElement) {
            // Falls das Element nicht existiert, erstelle es
            const overlay = adminVideo.querySelector('.video-overlay');
            if (overlay) {
                adminInfoElement = document.createElement('div');
                adminInfoElement.className = 'player-info';
                overlay.appendChild(adminInfoElement);
            }
        }
        
        if (adminInfoElement) {
            adminInfoElement.textContent = `${currentLobby.adminName}: 👑 Host`;
        }
    }
    
    // Spieler Video Slots aktualisieren (player1-video bis player4-video)
    for (let i = 0; i < 4; i++) {
        const slot = document.getElementById(`player${i + 1}-video`);
        if (!slot) continue;
        
        let playerInfoElement = slot.querySelector('.player-info');
        if (!playerInfoElement) {
            // Falls das Element nicht existiert, erstelle es
            const overlay = slot.querySelector('.video-overlay');
            if (overlay) {
                playerInfoElement = document.createElement('div');
                playerInfoElement.className = 'player-info';
                overlay.appendChild(playerInfoElement);
            }
        }
        
        if (playerInfoElement) {
            if (i < currentLobby.players.length) {
                // Echter Spieler
                const player = currentLobby.players[i];
                const playerScore = currentLobby.scores[player.id] || 0;
                playerInfoElement.textContent = `${player.name}: ${playerScore}`;
            } else {
                // Leerer Slot
                playerInfoElement.textContent = 'Wartet...';
            }
        }
    }
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
            
            // Überprüfen ob diese Frage bereits beantwortet wurde (permanent deaktiviert)
            const isAnswered = currentLobby.answeredQuestions && 
                              currentLobby.answeredQuestions.includes(questionKey);
            
            if (isAnswered) {
                cell.disabled = true;
                cell.classList.add('disabled');
                cell.style.opacity = '0.5';
                cell.style.backgroundColor = '#666';
            } else if (isAdmin) {
                cell.addEventListener('click', () => {
                    selectQuestion(category, points);
                });
            }
            // Spieler sehen alle Buttons als aktiv, können aber nur der Admin kann Fragen auswählen
            
            gameBoard.appendChild(cell);
        });
    }
}

function updateGameScreen() {
    // Aktiven Spieler hervorheben (da Header entfernt wurde)
    highlightActivePlayer();
    
    // Scores werden jetzt in den Video-Overlays angezeigt
}

function highlightActivePlayer() {
    // Alle Player-Slots zurücksetzen
    for (let i = 0; i < 4; i++) {
        const slot = document.getElementById(`player${i + 1}-video`);
        if (slot) {
            slot.classList.remove('active');
        }
    }
    
    // Aktiven Spieler hervorheben
    if (currentLobby && currentLobby.players.length > 0) {
        const activePlayerIndex = currentLobby.currentPlayer;
        if (activePlayerIndex >= 0 && activePlayerIndex < currentLobby.players.length) {
            const activeSlot = document.getElementById(`player${activePlayerIndex + 1}-video`);
            if (activeSlot) {
                activeSlot.classList.add('active');
            }
        }
    }
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
    
    // Prüfen ob es eine Bild-Frage ist
    if (data.question && typeof data.question === 'object' && data.question.image) {
        // Bild-Frage
        document.getElementById('question-text').textContent = data.question.question;
        
        // Bild-Element erstellen oder aktualisieren
        let questionImage = document.getElementById('question-image');
        if (!questionImage) {
            questionImage = document.createElement('img');
            questionImage.id = 'question-image';
            questionImage.style.maxWidth = '100%';
            questionImage.style.maxHeight = '400px';
            questionImage.style.borderRadius = '10px';
            questionImage.style.marginTop = '20px';
            document.getElementById('question-text').parentNode.appendChild(questionImage);
        }
        
        questionImage.src = `/bilder/${data.question.image}`;
        questionImage.style.display = 'block';
    } else {
        // Text-Frage
        document.getElementById('question-text').textContent = data.question.question || data.question;
        
        // Bild verstecken falls vorhanden
        const questionImage = document.getElementById('question-image');
        if (questionImage) {
            questionImage.style.display = 'none';
        }
    }
    
    // Admin Controls anzeigen/verstecken (nur wenn nicht im Buzzer-Modus)
    const adminControls = document.getElementById('admin-controls');
    if (isAdmin && !isBuzzerMode) {
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
    
    // Timer starten
    startQuestionTimer();
}

function hideQuestion() {
    document.getElementById('question-area').classList.add('hidden');
    currentQuestionData = null;
    
    // Timer stoppen
    stopQuestionTimer();
    
    // Buzzer-Modus beenden
    isBuzzerMode = false;
    
    // Buzzer verstecken
    hideBuzzer();
    
    // Buzzer-Controls entfernen (falls Admin)
    removeBuzzerControls();
    
    // Wait-Controls entfernen
    removeWaitControls();
    
    // Close-Button zurücksetzen
    const closeBtn = document.getElementById('close-question-btn');
    if (closeBtn) {
        closeBtn.textContent = 'Schließen';
    }
    
    // Admin-Controls wieder anzeigen
    const adminControls = document.getElementById('admin-controls');
    if (adminControls && isAdmin) {
        adminControls.style.display = 'flex';
    }
}

// Timer-Funktionen
function startQuestionTimer() {
    questionTimeLeft = 30;
    updateTimerDisplay();
    
    questionTimer = setInterval(() => {
        questionTimeLeft--;
        updateTimerDisplay();
        
        if (questionTimeLeft <= 0) {
            stopQuestionTimer();
            // Timer läuft ab, aber triggert nichts - nur visuell
        }
    }, 1000);
}

function stopQuestionTimer() {
    if (questionTimer) {
        clearInterval(questionTimer);
        questionTimer = null;
    }
}

function updateTimerDisplay() {
    const timerText = document.querySelector('.timer-text');
    const timerCircle = document.querySelector('.timer-circle');
    
    if (timerText && timerCircle) {
        timerText.textContent = questionTimeLeft;
        
        // Berechne den Fortschritt für das conic-gradient (30 Sekunden = 360 Grad)
        const progress = ((30 - questionTimeLeft) / 30) * 360;
        
        // Farbe basierend auf verbleibender Zeit
        let color = 'var(--primary-color)';
        timerCircle.classList.remove('warning', 'danger');
        
        if (questionTimeLeft <= 10 && questionTimeLeft > 5) {
            color = 'var(--warning-color)';
            timerCircle.classList.add('warning');
        } else if (questionTimeLeft <= 5) {
            color = 'var(--error-color)';
            timerCircle.classList.add('danger');
        }
        
        // Update das conic-gradient
        timerCircle.style.background = `conic-gradient(${color} ${progress}deg, transparent ${progress}deg)`;
    }
}

// Buzzer-System Funktionen
function showBuzzer(data) {
    const buzzerArea = document.getElementById('buzzer-area');
    const buzzerBtn = document.getElementById('buzzer-btn');
    
    // Prüfe ob aktueller Spieler buzzern darf
    const currentPlayerIndex = currentLobby ? currentLobby.players.findIndex(p => p.id === socket.id) : -1;
    const canBuzz = !data.excludedPlayers.includes(currentPlayerIndex) && !data.excludedPlayers.includes(socket.id);
    
    if (buzzerArea) {
        buzzerArea.classList.remove('hidden');
        
        if (buzzerBtn && canBuzz) {
            buzzerBtn.onclick = () => {
                pressBuzzer();
            };
            
            // Buzzer-Button aktivieren
            buzzerBtn.disabled = false;
            buzzerBtn.classList.remove('disabled');
        } else if (buzzerBtn) {
            // Spieler kann nicht buzzern (bereits dran gewesen oder Original-Spieler)
            buzzerBtn.disabled = true;
            buzzerBtn.classList.add('disabled');
            showNotification('Du kannst bei dieser Frage nicht mehr buzzern', 'warning');
        }
    }
}

function hideBuzzer() {
    const buzzerArea = document.getElementById('buzzer-area');
    if (buzzerArea) {
        buzzerArea.classList.add('hidden');
    }
}

function pressBuzzer() {
    const buzzerBtn = document.getElementById('buzzer-btn');
    
    if (buzzerBtn && !buzzerBtn.disabled) {
        // Buzzer deaktivieren
        buzzerBtn.disabled = true;
        buzzerBtn.classList.add('disabled');
        
        // Animation
        buzzerBtn.style.animation = 'buzzer-flash 0.5s ease-in-out';
        
        // Socket Event senden
        socket.emit('buzzer-press', { 
            lobbyCode: currentLobbyCode 
        });
        
        showNotification('Buzzer gedrückt! Warte auf Admin...', 'info');
    }
}

function showBuzzerPress(data) {
    if (isAdmin) {
        // Entferne Wait-Controls und alte Buzzer-Controls
        removeWaitControls();
        removeBuzzerControls();
        
        // Zeige Buzzer-Player Controls
        const questionContainer = document.querySelector('.question-container');
        
        if (questionContainer && !document.getElementById('buzzer-controls')) {
            // Temporäre Buzzer-Controls hinzufügen nur wenn noch nicht vorhanden
            const buzzerControls = document.createElement('div');
            buzzerControls.id = 'buzzer-controls';
            buzzerControls.className = 'question-actions';
            buzzerControls.innerHTML = `
                <div class="buzzer-admin-notification">
                    ${data.playerName} hat gebuzzert!
                </div>
                <button id="buzzer-correct" class="btn btn-success">Richtig (${data.playerName})</button>
                <button id="buzzer-wrong" class="btn btn-danger">Falsch (${data.playerName})</button>
                <button id="buzzer-close" class="btn btn-ghost">Frage schließen</button>
            `;
            
            questionContainer.appendChild(buzzerControls);
            
            // Event Listeners
            document.getElementById('buzzer-correct').onclick = () => {
                socket.emit('buzzer-answer', {
                    lobbyCode: currentLobbyCode,
                    playerId: data.playerId,
                    correct: true
                });
                removeBuzzerControls();
            };
            
            document.getElementById('buzzer-wrong').onclick = () => {
                socket.emit('buzzer-answer', {
                    lobbyCode: currentLobbyCode,
                    playerId: data.playerId,
                    correct: false
                });
                removeBuzzerControls();
            };
            
            document.getElementById('buzzer-close').onclick = () => {
                socket.emit('close-buzzer-question', {
                    lobbyCode: currentLobbyCode
                });
                removeBuzzerControls();
            };
        }
    }
}

function removeBuzzerControls() {
    const buzzerControls = document.getElementById('buzzer-controls');
    if (buzzerControls) {
        buzzerControls.remove();
    }
}

function updateAdminBuzzerControls() {
    if (isAdmin) {
        // Admin kann Frage schließen wenn Buzzer aktiv ist
        const closeBtn = document.getElementById('close-question-btn');
        if (closeBtn) {
            closeBtn.textContent = 'Buzzer schließen';
        }
    }
}

function hideOriginalPlayerControls() {
    if (isAdmin) {
        const adminControls = document.getElementById('admin-controls');
        if (adminControls) {
            adminControls.style.display = 'none';
        }
    }
}

function showBuzzerWaitControls() {
    if (isAdmin) {
        // Entferne erst alle existierenden Wait-Controls um Duplikate zu verhindern
        removeWaitControls();
        
        const adminControls = document.getElementById('admin-controls');
        if (adminControls) {
            // Erstelle neue Wait-Controls nur wenn noch nicht vorhanden
            if (!document.getElementById('buzzer-wait-controls')) {
                const waitControls = document.createElement('div');
                waitControls.id = 'buzzer-wait-controls';
                waitControls.className = 'question-actions';
                waitControls.innerHTML = `
                    <div class="buzzer-wait-text">Warte auf Buzzer oder schließe die Frage...</div>
                    <button id="close-buzzer-btn" class="btn btn-ghost">Frage schließen</button>
                `;
                
                adminControls.parentNode.appendChild(waitControls);
                
                // Event Listener für Schließen
                document.getElementById('close-buzzer-btn').onclick = () => {
                    socket.emit('close-buzzer-question', {
                        lobbyCode: currentLobbyCode
                    });
                    removeWaitControls();
                };
            }
        }
    }
}

function removeWaitControls() {
    const waitControls = document.getElementById('buzzer-wait-controls');
    if (waitControls) {
        waitControls.remove();
    }
    
    // Entferne auch mehrfache Wait-Controls (falls vorhanden)
    const allWaitControls = document.querySelectorAll('[id*="buzzer-wait"]');
    allWaitControls.forEach(control => control.remove());
    
    // Original Admin-Controls wieder anzeigen
    const adminControls = document.getElementById('admin-controls');
    if (adminControls && isAdmin) {
        adminControls.style.display = 'flex';
    }
}

function processAnswer(correct) {
    if (isAdmin && currentQuestionData) {
        const currentPlayer = currentLobby.players[currentLobby.currentPlayer];
        
        console.log('Processing answer:', correct);
        
        // Sofort UI anpassen basierend auf Antwort
        if (!correct) {
            // Falsche Antwort - sofort zu Buzzer-Modus wechseln
            isBuzzerMode = true;
            hideOriginalPlayerControls();
            showBuzzerWaitControls();
            showNotification(`${currentPlayer.name} hat falsch geantwortet! Warte auf Buzzer...`, 'warning');
        } else {
            // Richtige Antwort - sofort Frage schließen
            isBuzzerMode = false;
            showNotification(`${currentPlayer.name} hat richtig geantwortet!`, 'success');
        }
        
        socket.emit('process-answer', {
            lobbyCode: currentLobbyCode,
            correct,
            category: currentQuestionData.category,
            points: currentQuestionData.points
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