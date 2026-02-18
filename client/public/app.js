const { createApp, ref, computed, onMounted, onBeforeUnmount } = Vue;

createApp({
  setup() {
    // Refs
    const localVideo = ref(null);
    const remoteVideo = ref(null);

    // State
    const statusText = ref("Disconnected");
    const statusType = ref("disconnected"); // disconnected, connected, waiting
    const remoteStatus = ref("Waiting for partner...");
    const remoteVideoActive = ref(false);
    const isStarted = ref(false);
    const skipEnabled = ref(false);
    const isVideoEnabled = ref(true);
    const isAudioEnabled = ref(true);
    const isSoundEnabled = ref(true); // Sound notifications
    const onlineCount = ref("-");

    // Chat state
    const chatVisible = ref(false);
    const messages = ref([]);
    const messageInput = ref("");
    const unreadMessages = ref(0);
    const messagesContainer = ref(null);

    // Filter state
    const filtersVisible = ref(false);
    const activePreset = ref("Normal");
    const filters = ref({
      brightness: 100,
      contrast: 100,
      saturate: 100,
      blur: 0,
      grayscale: 0,
      sepia: 0,
      hue: 0,
      invert: 0,
      opacity: 100,
    });

    // Filter debounce timer
    let filterDebounce = null;

    // Filter controls configuration
    const filterControls = ref([
      {
        name: "brightness",
        label: "Brightness",
        min: 0,
        max: 200,
        step: 1,
        unit: "%",
      },
      {
        name: "contrast",
        label: "Contrast",
        min: 0,
        max: 200,
        step: 1,
        unit: "%",
      },
      {
        name: "saturate",
        label: "Saturation",
        min: 0,
        max: 200,
        step: 1,
        unit: "%",
      },
      { name: "blur", label: "Blur", min: 0, max: 10, step: 0.1, unit: "px" },
      {
        name: "grayscale",
        label: "Grayscale",
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
      },
      { name: "sepia", label: "Sepia", min: 0, max: 100, step: 1, unit: "%" },
      { name: "hue", label: "Hue", min: 0, max: 360, step: 1, unit: "°" },
      { name: "invert", label: "Invert", min: 0, max: 100, step: 1, unit: "%" },
    ]);

    // Filter presets
    const filterPresets = ref([
      {
        name: "Normal",
        filters: {
          brightness: 100,
          contrast: 100,
          saturate: 100,
          blur: 0,
          grayscale: 0,
          sepia: 0,
          hue: 0,
          invert: 0,
        },
      },
      {
        name: "Vintage",
        filters: {
          brightness: 110,
          contrast: 90,
          saturate: 80,
          blur: 0,
          grayscale: 0,
          sepia: 40,
          hue: 10,
          invert: 0,
        },
      },
      {
        name: "B&W",
        filters: {
          brightness: 100,
          contrast: 120,
          saturate: 0,
          blur: 0,
          grayscale: 100,
          sepia: 0,
          hue: 0,
          invert: 0,
        },
      },
      {
        name: "Dramatic",
        filters: {
          brightness: 90,
          contrast: 150,
          saturate: 120,
          blur: 0,
          grayscale: 0,
          sepia: 0,
          hue: 0,
          invert: 0,
        },
      },
      {
        name: "Warm",
        filters: {
          brightness: 110,
          contrast: 100,
          saturate: 110,
          blur: 0,
          grayscale: 0,
          sepia: 20,
          hue: 20,
          invert: 0,
        },
      },
      {
        name: "Cool",
        filters: {
          brightness: 100,
          contrast: 100,
          saturate: 90,
          blur: 0,
          grayscale: 0,
          sepia: 0,
          hue: 200,
          invert: 0,
        },
      },
    ]);

    // Camera state
    const currentFacingMode = ref("user"); // 'user' = front, 'environment' = back

    // Audio Context for sound notifications
    let audioContext = null;

    // Initialize Audio Context
    const initAudioContext = () => {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
    };

    // Play notification sound
    const playSound = (type) => {
      if (!isSoundEnabled.value) return; // Don't play if muted

      initAudioContext();

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Different sounds for different events
      switch (type) {
        case "matched":
          // Happy ascending tone
          oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
          oscillator.frequency.setValueAtTime(
            659.25,
            audioContext.currentTime + 0.1,
          ); // E5
          oscillator.frequency.setValueAtTime(
            783.99,
            audioContext.currentTime + 0.2,
          ); // G5
          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(
            0.01,
            audioContext.currentTime + 0.3,
          );
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.3);
          break;

        case "connected":
          // Success tone (two beeps)
          oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
          oscillator.frequency.setValueAtTime(
            1000,
            audioContext.currentTime + 0.15,
          );
          gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(
            0.01,
            audioContext.currentTime + 0.3,
          );
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.3);
          break;

        case "disconnected":
          // Sad descending tone
          oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime); // E5
          oscillator.frequency.setValueAtTime(
            523.25,
            audioContext.currentTime + 0.1,
          ); // C5
          oscillator.frequency.setValueAtTime(
            392.0,
            audioContext.currentTime + 0.2,
          ); // G4
          gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(
            0.01,
            audioContext.currentTime + 0.3,
          );
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.3);
          break;

        case "message":
          // Quick tick sound
          oscillator.frequency.setValueAtTime(1200, audioContext.currentTime);
          gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(
            0.01,
            audioContext.currentTime + 0.1,
          );
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.1);
          break;
      }
    };

    // WebRTC
    let socket = null;
    let localStream = null;
    let peerConnection = null;
    let currentPartnerId = null;

    // WebRTC configuration
    const configuration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    };

    // Computed
    const statusClass = computed(() => {
      const classes = {
        disconnected: "bg-red-500",
        connected: "bg-green-500",
        waiting: "bg-yellow-500",
      };
      return classes[statusType.value] || "bg-red-500";
    });

    // Initialize
    const init = async () => {
      try {
        // Initialize Socket.io - Auto-detect environment
        const socketUrl =
          window.location.hostname === "localhost"
            ? "http://localhost:3000"
            : "https://ometv-clone-nnkw.onrender.com";

        socket = io(socketUrl);
        console.log("Connecting to:", socketUrl);
        setupSocketListeners();

        // Get user media
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: currentFacingMode.value },
          audio: true,
        });

        localVideo.value.srcObject = localStream;
        console.log("Local stream initialized");

        isStarted.value = true;
        updateStatus("connected", "Ready");
      } catch (error) {
        console.error("Error accessing media devices:", error);
        alert(
          "Could not access camera/microphone. Please grant permissions and reload.",
        );
      }
    };

    // Socket listeners
    const setupSocketListeners = () => {
      socket.on("connect", () => {
        console.log("Connected to server");
        updateStatus("connected", "Connected");
      });

      socket.on("disconnect", () => {
        console.log("Disconnected from server");
        updateStatus("disconnected", "Disconnected");
      });

      socket.on("waiting", () => {
        console.log("Waiting for partner");
        updateStatus("waiting", "Waiting...");
        remoteStatus.value = "Waiting for someone to join...";
      });

      socket.on("matched", async (data) => {
        console.log("Matched with partner:", data.partnerId);
        console.log("Am I the initiator?", data.initiator);
        console.log("Full data received:", JSON.stringify(data));
        updateStatus("waiting", "Connecting...");
        remoteStatus.value = "Connecting to partner...";

        // Play matched sound
        playSound("matched");

        // Check if initiator flag exists (from updated server)
        if (data.initiator === undefined) {
          console.warn(
            "⚠️ Server not updated! Using fallback - both will try to create offer",
          );
          // Fallback: Use socket ID to determine who creates offer
          // Lower socket ID creates offer to avoid collision
          const shouldInitiate = socket.id < data.partnerId;
          console.log("Fallback: Should I initiate?", shouldInitiate);

          if (shouldInitiate) {
            console.log("I have lower socket ID, creating offer in 500ms...");
            setTimeout(() => {
              console.log("Now creating offer to:", data.partnerId);
              createOffer(data.partnerId);
            }, 500);
          } else {
            console.log("Partner has lower socket ID, waiting for offer...");
          }
        } else if (data.initiator) {
          console.log("✅ We are the initiator, creating offer in 500ms...");
          setTimeout(() => {
            console.log("Now creating offer to:", data.partnerId);
            createOffer(data.partnerId);
          }, 500);
        } else {
          console.log("✅ Waiting for offer from partner...");
        }
      });

      socket.on("offer", handleOffer);

      socket.on("answer", handleAnswer);

      socket.on("ice-candidate", handleIceCandidate);

      socket.on("partner-disconnected", handlePartnerDisconnected);

      socket.on("chat-message", (data) => {
        console.log("Received message:", data.message);
        messages.value.push({
          sender: "stranger",
          text: data.message,
        });

        // Play message sound
        playSound("message");

        // Show unread count if chat is hidden
        if (!chatVisible.value) {
          unreadMessages.value++;
        }

        // Auto-scroll to bottom
        setTimeout(() => {
          if (messagesContainer.value) {
            messagesContainer.value.scrollTop =
              messagesContainer.value.scrollHeight;
          }
        }, 100);
      });

      socket.on("filter-change", (data) => {
        console.log("Received filter change from partner");
        applyFiltersToVideo(remoteVideo.value, data.filters);
      });
    };

    // Update status
    const updateStatus = (type, text) => {
      statusType.value = type;
      statusText.value = text;
    };

    // Find partner
    const findPartner = () => {
      if (!localStream) {
        alert("Please allow camera/microphone access first");
        return;
      }

      updateStatus("waiting", "Searching...");
      remoteStatus.value = "Finding a partner...";
      remoteVideoActive.value = false;

      socket.emit("find-partner");
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
      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });

      // Handle incoming stream
      peerConnection.ontrack = (event) => {
        console.log("Received remote stream");
        remoteVideo.value.srcObject = event.streams[0];
        remoteVideoActive.value = true;
        updateStatus("connected", "Connected");

        // Play connected sound
        playSound("connected");
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", {
            candidate: event.candidate,
            to: partnerId,
          });
        }
      };

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log("🔄 Connection state:", peerConnection.connectionState);

        if (peerConnection.connectionState === "connected") {
          console.log("✅ WebRTC connection established!");
          updateStatus("connected", "Connected");
        }

        if (peerConnection.connectionState === "disconnected") {
          console.log("⚠️ Connection disconnected, waiting before cleanup...");
          // Wait a bit before cleanup to allow reconnection attempts
          setTimeout(() => {
            if (
              peerConnection &&
              peerConnection.connectionState === "disconnected"
            ) {
              console.log("❌ Connection still disconnected, cleaning up...");
              handlePartnerDisconnected();
            }
          }, 3000);
        }

        if (peerConnection.connectionState === "failed") {
          console.log("❌ Connection failed");
          handlePartnerDisconnected();
        }
      };

      return peerConnection;
    };

    // Create and send offer
    const createOffer = async (partnerId) => {
      try {
        console.log("Creating peer connection for:", partnerId);
        const pc = createPeerConnection(partnerId);

        console.log("Creating offer...");
        const offer = await pc.createOffer();

        console.log("Setting local description...");
        await pc.setLocalDescription(offer);

        console.log("Emitting offer to server for:", partnerId);
        socket.emit("offer", {
          offer: offer,
          to: partnerId,
        });

        console.log("Offer sent successfully to", partnerId);
      } catch (error) {
        console.error("Error creating offer:", error);
      }
    };

    // Handle incoming offer
    const handleOffer = async (data) => {
      try {
        console.log("📨 Received offer from:", data.from);

        // Clean up any existing connection
        if (peerConnection) {
          console.log("Closing existing peer connection");
          peerConnection.close();
          peerConnection = null;
        }

        console.log("Creating peer connection to respond to offer");
        const pc = createPeerConnection(data.from);

        console.log("Setting remote description (offer)");
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

        console.log("Creating answer...");
        const answer = await pc.createAnswer();

        console.log("Setting local description (answer)");
        await pc.setLocalDescription(answer);

        console.log("Emitting answer back to:", data.from);
        socket.emit("answer", {
          answer: answer,
          to: data.from,
        });

        console.log("✅ Answer sent successfully to", data.from);
      } catch (error) {
        console.error("❌ Error handling offer:", error);
        handlePartnerDisconnected();
      }
    };

    // Handle incoming answer
    const handleAnswer = async (data) => {
      try {
        console.log("📨 Received answer from:", data.from);

        if (!peerConnection) {
          console.error("❌ No peer connection exists when receiving answer");
          return;
        }

        console.log("Current signaling state:", peerConnection.signalingState);

        if (peerConnection.signalingState !== "have-local-offer") {
          console.error(
            "❌ Invalid state for answer:",
            peerConnection.signalingState,
          );
          return;
        }

        console.log("Setting remote description (answer)");
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(data.answer),
        );
        console.log("✅ Answer processed successfully from", data.from);
      } catch (error) {
        console.error("❌ Error handling answer:", error);
        // If there's an error, try to reconnect
        handlePartnerDisconnected();
      }
    };

    // Handle ICE candidate
    const handleIceCandidate = async (data) => {
      try {
        if (peerConnection) {
          await peerConnection.addIceCandidate(
            new RTCIceCandidate(data.candidate),
          );
        }
      } catch (error) {
        console.error("Error adding ICE candidate:", error);
      }
    };

    // Handle partner disconnected
    const handlePartnerDisconnected = () => {
      console.log("Partner disconnected");


      // Reset filters when partner disconnects
      filters.value = { brightness: 100, contrast: 100, saturate: 100, blur: 0, grayscale: 0, sepia: 0, hue: 0, invert: 0 };
      activePreset.value = 'Normal';
      applyFiltersToVideo(localVideo.value, filters.value);
      applyFiltersToVideo(remoteVideo.value, filters.value);

      if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
      }

      currentPartnerId = null;
      remoteVideo.value.srcObject = null;
      remoteVideoActive.value = false;
      remoteStatus.value = "Partner disconnected";

      // Clear chat messages
      messages.value = [];
      unreadMessages.value = 0;

      updateStatus("waiting", "Partner left");

      // Play disconnected sound
      playSound("disconnected");

      // Auto-search for new partner after 2 seconds
      setTimeout(() => {
        if (!currentPartnerId) {
          remoteStatus.value = "Finding a new partner...";
          socket.emit("find-partner");
        }
      }, 2000);
    };

    // Skip current partner
    const skip = () => {
      console.log("Skipping partner");

      if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
      }

      currentPartnerId = null;
      remoteVideo.value.srcObject = null;
      remoteVideoActive.value = false;
      remoteStatus.value = "Finding a new partner...";

      // Clear chat messages
      messages.value = [];
      unreadMessages.value = 0;

      updateStatus("waiting", "Searching...");
      socket.emit("skip");
    };

    // Toggle video
    const toggleVideo = () => {
      if (localStream) {
        isVideoEnabled.value = !isVideoEnabled.value;
        localStream.getVideoTracks().forEach((track) => {
          track.enabled = isVideoEnabled.value;
        });
      }
    };

    // Toggle audio
    const toggleAudio = () => {
      if (localStream) {
        isAudioEnabled.value = !isAudioEnabled.value;
        localStream.getAudioTracks().forEach((track) => {
          track.enabled = isAudioEnabled.value;
        });
      }
    };

    // Toggle sound notifications
    const toggleSound = () => {
      isSoundEnabled.value = !isSoundEnabled.value;

      // Play a test sound when enabling
      if (isSoundEnabled.value) {
        playSound("message");
      }
    };

    // Switch camera (front/back)
    const switchCamera = async () => {
      try {
        // Toggle facing mode
        currentFacingMode.value =
          currentFacingMode.value === "user" ? "environment" : "user";

        // Stop current stream
        if (localStream) {
          localStream.getTracks().forEach((track) => track.stop());
        }

        // Get new stream with switched camera
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: currentFacingMode.value },
          audio: true,
        });

        // Update local video
        localVideo.value.srcObject = localStream;

        // If in a call, replace video track
        if (peerConnection && currentPartnerId) {
          const videoTrack = localStream.getVideoTracks()[0];
          const sender = peerConnection
            .getSenders()
            .find((s) => s.track?.kind === "video");
          if (sender) {
            sender.replaceTrack(videoTrack);
          }
        }

        console.log("Camera switched to:", currentFacingMode.value);
      } catch (error) {
        console.error("Error switching camera:", error);
        alert(
          "Could not switch camera. Make sure your device has multiple cameras.",
        );
      }
    };

    // Toggle chat visibility
    const toggleChat = () => {
      chatVisible.value = !chatVisible.value;

      // Clear unread count when opening chat
      if (chatVisible.value) {
        unreadMessages.value = 0;

        // Auto-scroll to bottom
        setTimeout(() => {
          if (messagesContainer.value) {
            messagesContainer.value.scrollTop =
              messagesContainer.value.scrollHeight;
          }
        }, 100);
      }
    };

    // Send message
    const sendMessage = () => {
      const text = messageInput.value.trim();

      if (!text) return;

      if (!currentPartnerId) {
        alert("Connect with someone first!");
        return;
      }

      // Add to local messages
      messages.value.push({
        sender: "you",
        text: text,
      });

      // Send via socket
      socket.emit("chat-message", {
        to: currentPartnerId,
        message: text,
      });

      // Clear input
      messageInput.value = "";

      // Auto-scroll to bottom
      setTimeout(() => {
        if (messagesContainer.value) {
          messagesContainer.value.scrollTop =
            messagesContainer.value.scrollHeight;
        }
      }, 100);
    };

    // Lifecycle hooks
    onMounted(() => {
      // Auto-initialize on mount
      // User will click Start button to begin
    });

    onBeforeUnmount(() => {
      // Cleanup
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      if (peerConnection) {
        peerConnection.close();
      }
      if (socket) {
        socket.disconnect();
      }
    });

    // Apply filters to video element
    const applyFiltersToVideo = (videoElement, filterValues) => {
      if (!videoElement) return;

      const filterString = `
    brightness(${filterValues.brightness}%)
    contrast(${filterValues.contrast}%)
    saturate(${filterValues.saturate}%)
    blur(${filterValues.blur}px)
    grayscale(${filterValues.grayscale}%)
    sepia(${filterValues.sepia}%)
    hue-rotate(${filterValues.hue}deg)
    invert(${filterValues.invert}%)
  `
        .trim()
        .replace(/\s+/g, " ");

      videoElement.style.filter = filterString;
    };

    // Handle filter change
    const onFilterChange = () => {
      // Apply to local video immediately
      applyFiltersToVideo(localVideo.value, filters.value);

      // Debounce socket emit to partner
      clearTimeout(filterDebounce);
      filterDebounce = setTimeout(() => {
        if (currentPartnerId) {
          socket.emit("filter-change", {
            to: currentPartnerId,
            filters: filters.value,
          });
        }
      }, 300); // 300ms debounce
    };

    // Toggle filters panel
    const toggleFilters = () => {
      filtersVisible.value = !filtersVisible.value;
    };

    // Apply filter preset
    const applyFilterPreset = (preset) => {
      activePreset.value = preset.name;
      filters.value = { ...preset.filters };
      onFilterChange();
    };

    // Reset filters to default
    const resetFilters = () => {
      const defaultPreset = filterPresets.value[0]; // Normal
      applyFilterPreset(defaultPreset);
    };

    return {
      // Refs
      localVideo,
      remoteVideo,
      messagesContainer,

      // State
      statusText,
      statusClass,
      remoteStatus,
      remoteVideoActive,
      isStarted,
      skipEnabled,
      isVideoEnabled,
      isAudioEnabled,
      isSoundEnabled,
      onlineCount,

      // Chat state
      chatVisible,
      messages,
      messageInput,
      unreadMessages,

      // Methods
      handleStartButton,
      skip,
      toggleVideo,
      toggleAudio,
      toggleSound,
      switchCamera,
      toggleChat,
      sendMessage,

      // Filter state
      filtersVisible,
      filters,
      filterControls,
      filterPresets,
      activePreset,

      // Filter methods
      toggleFilters,
      onFilterChange,
      applyFilterPreset,
      resetFilters,
    };
  },
}).mount("#app");
