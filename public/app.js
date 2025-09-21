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

// Video Call Events - VERBESSERT mit besserem Timing
socket.on('player-joined-call-notification', (data) => {
    console.log(`📢 Spieler beigetreten-Notification:`, data);
    showNotification(`📹 ${data.playerName} ist dem Video Call beigetreten!`, 'info');
    
    // Prüfe ob ich selbst im Call bin und Stream bereit ist
    if (webrtc && webrtc.isInCall && webrtc.localStream && data.playerId !== socket.id) {
        console.log(`🔗 Erstelle Peer Connection für: ${data.playerName} (${data.playerId})`);
        console.log(`🔍 Mein Stream Ready: ${webrtc.localStream ? 'Ja' : 'Nein'}`);
        console.log(`🔍 Meine Socket-ID: ${socket.id}, Andere ID: ${data.playerId}`);
        
        // Prüfe ob Connection bereits existiert
        if (!webrtc.peerConnections.has(data.playerId)) {
            webrtc.createPeerConnection(data.playerId, data.playerName);
            
            // Als niedrigere Socket-ID initiiert den Call (deterministisch)
            if (socket.id < data.playerId) {
                console.log(`📞 Initiiere Offer an: ${data.playerName} (ich habe niedrigere ID)`);
                setTimeout(() => {
                    if (webrtc.peerConnections.has(data.playerId)) {
                        webrtc.createOffer(data.playerId);
                    }
                }, 2000 + Math.random() * 1000);
            } else {
                console.log(`⏳ Warte auf Offer von: ${data.playerName} (andere hat niedrigere ID)`);
            }
        } else {
            console.log(`ℹ️ Peer Connection zu ${data.playerName} existiert bereits`);
        }
    } else {
        if (!webrtc?.isInCall) {
            console.log(`⚠️ Ich bin noch nicht im Call - ignoriere ${data.playerName}`);
        } else if (!webrtc?.localStream) {
            console.log(`⚠️ Mein Stream ist noch nicht bereit - ignoriere ${data.playerName}`);
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
        
        // Flexiblere Strategien - funktioniert mit allen Webcam-Typen
        const strategies = [
            // Basis Video (funktioniert meistens)
            {
                video: true, 
                audio: true,
                name: 'Auto-Qualität'
            },
            // Standard Qualität
            {
                video: { 
                    width: { ideal: 640 }, 
                    height: { ideal: 480 }
                }, 
                audio: true,
                name: 'Standard Qualität'
            },
            // Ohne Audio falls Mikrofon Problem
            {
                video: true, 
                audio: false,
                name: 'Nur Video'
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

        // Event Handlers mit verbessertem Debugging
        peerConnection.ontrack = (event) => {
            console.log(`📹 Remote Stream empfangen von: ${peerName}`);
            console.log(`📹 Event Details:`, {
                streamsCount: event.streams.length,
                tracksCount: event.track ? 1 : 0,
                trackKind: event.track?.kind
            });
            
            if (event.streams && event.streams.length > 0) {
                const remoteStream = event.streams[0];
                console.log(`🎬 Verwende Stream ${remoteStream.id} für ${peerName}`);
                displayRemoteVideo(remoteStream, peerId, peerName);
            } else {
                console.error(`❌ Kein Stream in ontrack Event für ${peerName}`);
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
        if (leaveBtn) leaveBtn.disabled = false;
        if (joinBtn) joinBtn.style.display = 'none';
        
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
        if (leaveBtn) leaveBtn.disabled = true;
        if (audioBtn) audioBtn.disabled = true;
        if (videoBtn) videoBtn.disabled = true;
        
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

function displayMyVideo(stream) {
    console.log('🎥 Zeige mein Video...');
    
    // Bestimme welcher Video-Slot für mich verwendet werden soll
    let myVideoSlot;
    if (isAdmin) {
        myVideoSlot = document.getElementById('admin-video');
    } else {
        // Für Spieler: Finde den ersten freien Slot
        const playerSlots = ['player1-video', 'player2-video', 'player3-video', 'player4-video'];
        for (const slotId of playerSlots) {
            const slot = document.getElementById(slotId);
            if (slot && !slot.dataset.occupied) {
                myVideoSlot = slot;
                slot.dataset.occupied = 'true';
                break;
            }
        }
    }
    
    if (myVideoSlot) {
        const video = myVideoSlot.querySelector('.player-video');
        const placeholder = myVideoSlot.querySelector('.video-placeholder');
        
        if (video && stream) {
            video.srcObject = stream;
            video.muted = true; // Audio stumm, aber Video sichtbar
            
            // Speichere meinen Video-Slot für spätere Referenz
            myVideoSlot = myVideoSlot;
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
    
    // Finde freien Video-Slot (korrekte CSS-Klasse verwenden)
    const videoSlots = document.querySelectorAll('.player-video-slot');
    console.log(`🔍 Verfügbare Video-Slots: ${videoSlots.length}`);
    
    let targetSlot = null;
    
    for (const slot of videoSlots) {
        const slotId = slot.id;
        const occupiedBy = slot.dataset.playerId;
        console.log(`🔍 Prüfe Slot ${slotId}: ${occupiedBy ? 'besetzt von ' + occupiedBy : 'frei'}`);
        
        // Überspringe meinen eigenen Slot
        if (slot.dataset.playerId === socket.id) {
            console.log(`⏭️ Überspringe eigenen Slot: ${slotId}`);
            continue;
        }
        
        // Finde freien Slot oder bereits diesem Peer zugewiesenen
        if (!slot.dataset.playerId || slot.dataset.playerId === peerId) {
            targetSlot = slot;
            console.log(`✅ Slot ${slotId} ausgewählt für ${peerName}`);
            break;
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