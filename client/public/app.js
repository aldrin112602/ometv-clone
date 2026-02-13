// Socket.io connection
const socket = io('http://localhost:3000');

// DOM Elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startBtn');
const skipBtn = document.getElementById('skipBtn');
const toggleVideoBtn = document.getElementById('toggleVideoBtn');
const toggleAudioBtn = document.getElementById('toggleAudioBtn');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const remotePlaceholder = document.getElementById('remote-placeholder');
const remoteStatus = document.getElementById('remote-status');

// WebRTC configuration
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
};

// State
let localStream = null;
let peerConnection = null;
let currentPartnerId = null;
let isVideoEnabled = true;
let isAudioEnabled = true;

// Initialize
async function init() {
  try {
    // Get user media
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    
    localVideo.srcObject = localStream;
    console.log('Local stream initialized');
    
    startBtn.textContent = 'Find Partner';
    startBtn.onclick = findPartner;
    
  } catch (error) {
    console.error('Error accessing media devices:', error);
    alert('Could not access camera/microphone. Please grant permissions and reload.');
  }
}

// Find a random partner
function findPartner() {
  if (!localStream) {
    alert('Please allow camera/microphone access first');
    return;
  }
  
  updateStatus('waiting', 'Searching...');
  remoteStatus.textContent = 'Finding a partner...';
  remotePlaceholder.classList.remove('hidden');
  remoteVideo.classList.remove('active');
  
  socket.emit('find-partner');
  skipBtn.disabled = false;
}

// Create peer connection
function createPeerConnection(partnerId) {
  peerConnection = new RTCPeerConnection(configuration);
  currentPartnerId = partnerId;
  
  // Add local stream tracks to peer connection
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });
  
  // Handle incoming stream
  peerConnection.ontrack = (event) => {
    console.log('Received remote stream');
    remoteVideo.srcObject = event.streams[0];
    remoteVideo.classList.add('active');
    remotePlaceholder.classList.add('hidden');
    updateStatus('connected', 'Connected');
  };
  
  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        candidate: event.candidate,
        to: partnerId
      });
    }
  };
  
  // Handle connection state changes
  peerConnection.onconnectionstatechange = () => {
    console.log('Connection state:', peerConnection.connectionState);
    
    if (peerConnection.connectionState === 'disconnected' || 
        peerConnection.connectionState === 'failed') {
      handlePartnerDisconnected();
    }
  };
  
  return peerConnection;
}

// Create and send offer
async function createOffer(partnerId) {
  try {
    const pc = createPeerConnection(partnerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    socket.emit('offer', {
      offer: offer,
      to: partnerId
    });
    
    console.log('Offer sent to', partnerId);
  } catch (error) {
    console.error('Error creating offer:', error);
  }
}

// Handle incoming offer
async function handleOffer(data) {
  try {
    const pc = createPeerConnection(data.from);
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    socket.emit('answer', {
      answer: answer,
      to: data.from
    });
    
    console.log('Answer sent to', data.from);
  } catch (error) {
    console.error('Error handling offer:', error);
  }
}

// Handle incoming answer
async function handleAnswer(data) {
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    console.log('Answer received from', data.from);
  } catch (error) {
    console.error('Error handling answer:', error);
  }
}

// Handle ICE candidate
async function handleIceCandidate(data) {
  try {
    if (peerConnection) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  } catch (error) {
    console.error('Error adding ICE candidate:', error);
  }
}

// Handle partner disconnected
function handlePartnerDisconnected() {
  console.log('Partner disconnected');
  
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  
  currentPartnerId = null;
  remoteVideo.srcObject = null;
  remoteVideo.classList.remove('active');
  remotePlaceholder.classList.remove('hidden');
  remoteStatus.textContent = 'Partner disconnected';
  
  updateStatus('waiting', 'Partner left');
  
  // Auto-search for new partner after 2 seconds
  setTimeout(() => {
    if (!currentPartnerId) {
      remoteStatus.textContent = 'Finding a new partner...';
      socket.emit('find-partner');
    }
  }, 2000);
}

// Skip current partner
function skip() {
  console.log('Skipping partner');
  
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  
  currentPartnerId = null;
  remoteVideo.srcObject = null;
  remoteVideo.classList.remove('active');
  remotePlaceholder.classList.remove('hidden');
  remoteStatus.textContent = 'Finding a new partner...';
  
  updateStatus('waiting', 'Searching...');
  socket.emit('skip');
}

// Toggle video
function toggleVideo() {
  if (localStream) {
    isVideoEnabled = !isVideoEnabled;
    localStream.getVideoTracks().forEach(track => {
      track.enabled = isVideoEnabled;
    });
    toggleVideoBtn.style.opacity = isVideoEnabled ? '1' : '0.5';
    toggleVideoBtn.querySelector('.btn-icon').textContent = isVideoEnabled ? '📹' : '🚫';
  }
}

// Toggle audio
function toggleAudio() {
  if (localStream) {
    isAudioEnabled = !isAudioEnabled;
    localStream.getAudioTracks().forEach(track => {
      track.enabled = isAudioEnabled;
    });
    toggleAudioBtn.style.opacity = isAudioEnabled ? '1' : '0.5';
    toggleAudioBtn.querySelector('.btn-icon').textContent = isAudioEnabled ? '🎤' : '🔇';
  }
}

// Update status indicator
function updateStatus(status, text) {
  statusDot.className = `dot ${status}`;
  statusText.textContent = text;
}

// Socket event listeners
socket.on('connect', () => {
  console.log('Connected to server');
  updateStatus('connected', 'Connected');
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  updateStatus('disconnected', 'Disconnected');
});

socket.on('waiting', () => {
  console.log('Waiting for partner');
  updateStatus('waiting', 'Waiting...');
  remoteStatus.textContent = 'Waiting for someone to join...';
});

socket.on('matched', async (data) => {
  console.log('Matched with partner:', data.partnerId);
  updateStatus('waiting', 'Connecting...');
  remoteStatus.textContent = 'Connecting to partner...';
  
  // The first user (who was waiting) creates the offer
  // Small delay to ensure both sides are ready
  setTimeout(() => {
    createOffer(data.partnerId);
  }, 100);
});

socket.on('offer', handleOffer);
socket.on('answer', handleAnswer);
socket.on('ice-candidate', handleIceCandidate);
socket.on('partner-disconnected', handlePartnerDisconnected);

// Button event listeners
skipBtn.onclick = skip;
toggleVideoBtn.onclick = toggleVideo;
toggleAudioBtn.onclick = toggleAudio;

// Initialize on page load
window.onload = init;

// Cleanup on page unload
window.onbeforeunload = () => {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  if (peerConnection) {
    peerConnection.close();
  }
};