const { createApp, ref, computed, onMounted, onBeforeUnmount } = Vue;

createApp({
  setup() {
    // Refs
    const localVideo = ref(null);
    const remoteVideo = ref(null);
    
    // State
    const statusText = ref('Disconnected');
    const statusType = ref('disconnected'); // disconnected, connected, waiting
    const remoteStatus = ref('Waiting for partner...');
    const remoteVideoActive = ref(false);
    const isStarted = ref(false);
    const skipEnabled = ref(false);
    const isVideoEnabled = ref(true);
    const isAudioEnabled = ref(true);
    const onlineCount = ref('-');
    
    // WebRTC
    let socket = null;
    let localStream = null;
    let peerConnection = null;
    let currentPartnerId = null;
    
    // WebRTC configuration
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    };
    
    // Computed
    const statusClass = computed(() => {
      const classes = {
        disconnected: 'bg-red-500',
        connected: 'bg-green-500',
        waiting: 'bg-yellow-500'
      };
      return classes[statusType.value] || 'bg-red-500';
    });
    
    // Initialize
    const init = async () => {
      try {
        // Initialize Socket.io - Auto-detect environment
        const socketUrl = window.location.hostname === 'localhost' 
          ? 'http://localhost:3000' 
          : 'https://ometv-clone-nnkw.onrender.com';
        
        socket = io(socketUrl);
        console.log('Connecting to:', socketUrl);
        setupSocketListeners();
        
        // Get user media
        localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        
        localVideo.value.srcObject = localStream;
        console.log('Local stream initialized');
        
        isStarted.value = true;
        updateStatus('connected', 'Ready');
        
      } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Could not access camera/microphone. Please grant permissions and reload.');
      }
    };
    
    // Socket listeners
    const setupSocketListeners = () => {
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
        remoteStatus.value = 'Waiting for someone to join...';
      });
      
      socket.on('matched', async (data) => {
        console.log('Matched with partner:', data.partnerId);
        console.log('Am I the initiator?', data.initiator);
        console.log('Full data received:', JSON.stringify(data));
        updateStatus('waiting', 'Connecting...');
        remoteStatus.value = 'Connecting to partner...';
        
        // Check if initiator flag exists (from updated server)
        if (data.initiator === undefined) {
          console.warn('⚠️ Server not updated! Using fallback - both will try to create offer');
          // Fallback: Use socket ID to determine who creates offer
          // Lower socket ID creates offer to avoid collision
          const shouldInitiate = socket.id < data.partnerId;
          console.log('Fallback: Should I initiate?', shouldInitiate);
          
          if (shouldInitiate) {
            console.log('I have lower socket ID, creating offer in 500ms...');
            setTimeout(() => {
              console.log('Now creating offer to:', data.partnerId);
              createOffer(data.partnerId);
            }, 500);
          } else {
            console.log('Partner has lower socket ID, waiting for offer...');
          }
        } else if (data.initiator) {
          console.log('✅ We are the initiator, creating offer in 500ms...');
          setTimeout(() => {
            console.log('Now creating offer to:', data.partnerId);
            createOffer(data.partnerId);
          }, 500);
        } else {
          console.log('✅ Waiting for offer from partner...');
        }
      });
      
      socket.on('offer', handleOffer);
      
      socket.on('answer', handleAnswer);
      
      socket.on('ice-candidate', handleIceCandidate);
      
      socket.on('partner-disconnected', handlePartnerDisconnected);
    };
    
    // Update status
    const updateStatus = (type, text) => {
      statusType.value = type;
      statusText.value = text;
    };
    
    // Find partner
    const findPartner = () => {
      if (!localStream) {
        alert('Please allow camera/microphone access first');
        return;
      }
      
      updateStatus('waiting', 'Searching...');
      remoteStatus.value = 'Finding a partner...';
      remoteVideoActive.value = false;
      
      socket.emit('find-partner');
      skipEnabled.value = true;
    };
    
    // Handle start button
    const handleStartButton = () => {
      if (isStarted.value) {
        findPartner();
      } else {
        init();
      }
    };
    
    // Create peer connection
    const createPeerConnection = (partnerId) => {
      peerConnection = new RTCPeerConnection(configuration);
      currentPartnerId = partnerId;
      
      // Add local stream tracks
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
      
      // Handle incoming stream
      peerConnection.ontrack = (event) => {
        console.log('Received remote stream');
        remoteVideo.value.srcObject = event.streams[0];
        remoteVideoActive.value = true;
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
        console.log('🔄 Connection state:', peerConnection.connectionState);
        
        if (peerConnection.connectionState === 'connected') {
          console.log('✅ WebRTC connection established!');
          updateStatus('connected', 'Connected');
        }
        
        if (peerConnection.connectionState === 'disconnected') {
          console.log('⚠️ Connection disconnected, waiting before cleanup...');
          // Wait a bit before cleanup to allow reconnection attempts
          setTimeout(() => {
            if (peerConnection && peerConnection.connectionState === 'disconnected') {
              console.log('❌ Connection still disconnected, cleaning up...');
              handlePartnerDisconnected();
            }
          }, 3000);
        }
        
        if (peerConnection.connectionState === 'failed') {
          console.log('❌ Connection failed');
          handlePartnerDisconnected();
        }
      };
      
      return peerConnection;
    };
    
    // Create and send offer
    const createOffer = async (partnerId) => {
      try {
        console.log('Creating peer connection for:', partnerId);
        const pc = createPeerConnection(partnerId);
        
        console.log('Creating offer...');
        const offer = await pc.createOffer();
        
        console.log('Setting local description...');
        await pc.setLocalDescription(offer);
        
        console.log('Emitting offer to server for:', partnerId);
        socket.emit('offer', {
          offer: offer,
          to: partnerId
        });
        
        console.log('Offer sent successfully to', partnerId);
      } catch (error) {
        console.error('Error creating offer:', error);
      }
    };
    
    // Handle incoming offer
    const handleOffer = async (data) => {
      try {
        console.log('📨 Received offer from:', data.from);
        
        // Clean up any existing connection
        if (peerConnection) {
          console.log('Closing existing peer connection');
          peerConnection.close();
          peerConnection = null;
        }
        
        console.log('Creating peer connection to respond to offer');
        const pc = createPeerConnection(data.from);
        
        console.log('Setting remote description (offer)');
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        
        console.log('Creating answer...');
        const answer = await pc.createAnswer();
        
        console.log('Setting local description (answer)');
        await pc.setLocalDescription(answer);
        
        console.log('Emitting answer back to:', data.from);
        socket.emit('answer', {
          answer: answer,
          to: data.from
        });
        
        console.log('✅ Answer sent successfully to', data.from);
      } catch (error) {
        console.error('❌ Error handling offer:', error);
        handlePartnerDisconnected();
      }
    };
    
    // Handle incoming answer
    const handleAnswer = async (data) => {
      try {
        console.log('📨 Received answer from:', data.from);
        
        if (!peerConnection) {
          console.error('❌ No peer connection exists when receiving answer');
          return;
        }
        
        console.log('Current signaling state:', peerConnection.signalingState);
        
        if (peerConnection.signalingState !== 'have-local-offer') {
          console.error('❌ Invalid state for answer:', peerConnection.signalingState);
          return;
        }
        
        console.log('Setting remote description (answer)');
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        console.log('✅ Answer processed successfully from', data.from);
      } catch (error) {
        console.error('❌ Error handling answer:', error);
        // If there's an error, try to reconnect
        handlePartnerDisconnected();
      }
    };
    
    // Handle ICE candidate
    const handleIceCandidate = async (data) => {
      try {
        if (peerConnection) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    };
    
    // Handle partner disconnected
    const handlePartnerDisconnected = () => {
      console.log('Partner disconnected');
      
      if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
      }
      
      currentPartnerId = null;
      remoteVideo.value.srcObject = null;
      remoteVideoActive.value = false;
      remoteStatus.value = 'Partner disconnected';
      
      updateStatus('waiting', 'Partner left');
      
      // Auto-search for new partner after 2 seconds
      setTimeout(() => {
        if (!currentPartnerId) {
          remoteStatus.value = 'Finding a new partner...';
          socket.emit('find-partner');
        }
      }, 2000);
    };
    
    // Skip current partner
    const skip = () => {
      console.log('Skipping partner');
      
      if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
      }
      
      currentPartnerId = null;
      remoteVideo.value.srcObject = null;
      remoteVideoActive.value = false;
      remoteStatus.value = 'Finding a new partner...';
      
      updateStatus('waiting', 'Searching...');
      socket.emit('skip');
    };
    
    // Toggle video
    const toggleVideo = () => {
      if (localStream) {
        isVideoEnabled.value = !isVideoEnabled.value;
        localStream.getVideoTracks().forEach(track => {
          track.enabled = isVideoEnabled.value;
        });
      }
    };
    
    // Toggle audio
    const toggleAudio = () => {
      if (localStream) {
        isAudioEnabled.value = !isAudioEnabled.value;
        localStream.getAudioTracks().forEach(track => {
          track.enabled = isAudioEnabled.value;
        });
      }
    };
    
    // Lifecycle hooks
    onMounted(() => {
      // Auto-initialize on mount
      // User will click Start button to begin
    });
    
    onBeforeUnmount(() => {
      // Cleanup
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (peerConnection) {
        peerConnection.close();
      }
      if (socket) {
        socket.disconnect();
      }
    });
    
    return {
      // Refs
      localVideo,
      remoteVideo,
      
      // State
      statusText,
      statusClass,
      remoteStatus,
      remoteVideoActive,
      isStarted,
      skipEnabled,
      isVideoEnabled,
      isAudioEnabled,
      onlineCount,
      
      // Methods
      handleStartButton,
      skip,
      toggleVideo,
      toggleAudio
    };
  }
}).mount('#app');