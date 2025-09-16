// WebRTC Client for Virtual Classroom
class WebRTCClient {
  constructor(socket, localVideoElement, remoteVideosContainer) {
    this.socket = socket;
    this.localVideoElement = localVideoElement;
    this.remoteVideosContainer = remoteVideosContainer;

    // WebRTC Configuration with STUN/TURN servers
    this.pcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        // Add your TURN server here for production
        // {
        //   urls: 'turn:your-turn-server.com:3478',
        //   username: 'classroom',
        //   credential: 'classroom123'
        // }
      ],
      iceCandidatePoolSize: 10
    };

    // Peer connections storage
    this.peerConnections = new Map();
    this.localStream = null;
    this.screenStream = null;
    this.remoteStreams = new Map();
    this.dataChannels = new Map();

    // Media constraints
    this.constraints = {
      video: {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 60 }
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 44100
      }
    };

    // State tracking
    this.isVideoEnabled = true;
    this.isAudioEnabled = true;
    this.isScreenSharing = false;
    this.isInitialized = false;

    this.setupEventListeners();
  }

  async initialize() {
    try {
      await this.getLocalStream();
      this.isInitialized = true;
      console.log('WebRTC Client initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize WebRTC:', error);
      this.showError('Failed to access camera/microphone. Please check permissions.');
      return false;
    }
  }

  async getLocalStream(constraints = this.constraints) {
    try {
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
      }

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

      if (this.localVideoElement) {
        this.localVideoElement.srcObject = this.localStream;
      }

      // Update UI state
      this.isVideoEnabled = this.localStream.getVideoTracks().length > 0;
      this.isAudioEnabled = this.localStream.getAudioTracks().length > 0;

      console.log('Local stream acquired:', {
        video: this.isVideoEnabled,
        audio: this.isAudioEnabled
      });

      return this.localStream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      throw error;
    }
  }

  async getScreenStream() {
    try {
      const screenConstraints = {
        video: {
          mediaSource: 'screen',
          width: { max: 1920 },
          height: { max: 1080 },
          frameRate: { max: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      };

      this.screenStream = await navigator.mediaDevices.getDisplayMedia(screenConstraints);

      // Handle screen share end when user stops sharing via browser UI
      this.screenStream.getVideoTracks()[0].onended = () => {
        console.log('Screen sharing ended by user');
        this.stopScreenShare();
      };

      return this.screenStream;
    } catch (error) {
      console.error('Error accessing screen share:', error);
      throw error;
    }
  }

  setupEventListeners() {
    this.socket.on('participant-joined', (data) => {
      this.handleParticipantJoined(data);
    });

    this.socket.on('participant-left', (data) => {
      this.handleParticipantLeft(data);
    });

    this.socket.on('offer', (data) => {
      this.handleOffer(data);
    });

    this.socket.on('answer', (data) => {
      this.handleAnswer(data);
    });

    this.socket.on('ice-candidate', (data) => {
      this.handleIceCandidate(data);
    });

    this.socket.on('participant-video-toggle', (data) => {
      this.handleRemoteVideoToggle(data);
    });

    this.socket.on('participant-audio-toggle', (data) => {
      this.handleRemoteAudioToggle(data);
    });

    this.socket.on('participant-screen-share', (data) => {
      this.handleRemoteScreenShare(data);
    });

    // Handle connection state changes
    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
      this.handleSocketDisconnect();
    });

    this.socket.on('connect', () => {
      console.log('Socket reconnected');
    });
  }

  async handleParticipantJoined(data) {
    const { participant } = data;
    console.log('Participant joined:', participant);

    // Create peer connection for new participant
    await this.createPeerConnection(participant.id, participant);

    // Create and send offer to new participant
    await this.createOffer(participant.id);

    // Update UI
    this.updateParticipantsList();
  }

  handleParticipantLeft(data) {
    const { participantId } = data;
    console.log('Participant left:', participantId);

    this.closePeerConnection(participantId);
    this.removeRemoteVideo(participantId);
    this.updateParticipantsList();
  }

  async createPeerConnection(peerId, participantData = null) {
    try {
      const peerConnection = new RTCPeerConnection(this.pcConfig);
      this.peerConnections.set(peerId, peerConnection);

      // Add local stream tracks to peer connection
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, this.localStream);
        });
      }

      // Handle remote stream
      peerConnection.ontrack = (event) => {
        console.log('Received remote track:', event);
        this.handleRemoteStream(peerId, event.streams[0], participantData);
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.emit('ice-candidate', {
            targetId: peerId,
            candidate: event.candidate
          });
        }
      };

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log(`Connection state with ${peerId}: ${state}`);

        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          setTimeout(() => {
            if (peerConnection.connectionState === 'failed') {
              console.log(`Cleaning up failed connection with ${peerId}`);
              this.closePeerConnection(peerId);
              this.removeRemoteVideo(peerId);
            }
          }, 5000);
        } else if (state === 'connected') {
          console.log(`Successfully connected to ${peerId}`);
        }
      };

      // Handle ICE connection state changes
      peerConnection.oniceconnectionstatechange = () => {
        const iceState = peerConnection.iceConnectionState;
        console.log(`ICE connection state with ${peerId}: ${iceState}`);
      };

      // Create data channel for each peer (optional for future features)
      const dataChannel = peerConnection.createDataChannel('messages', {
        ordered: true,
        maxRetransmits: 3
      });

      dataChannel.onopen = () => {
        console.log(`Data channel opened with ${peerId}`);
      };

      dataChannel.onmessage = (event) => {
        console.log(`Received data from ${peerId}:`, event.data);
        this.handleDataChannelMessage(peerId, event.data);
      };

      dataChannel.onerror = (error) => {
        console.error(`Data channel error with ${peerId}:`, error);
      };

      this.dataChannels.set(peerId, dataChannel);

      return peerConnection;
    } catch (error) {
      console.error('Error creating peer connection:', error);
      throw error;
    }
  }

  async createOffer(peerId) {
    try {
      const peerConnection = this.peerConnections.get(peerId);
      if (!peerConnection) {
        throw new Error(`No peer connection found for ${peerId}`);
      }

      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        voiceActivityDetection: true
      });

      await peerConnection.setLocalDescription(offer);

      this.socket.emit('offer', {
        targetId: peerId,
        offer: offer,
        streamType: this.isScreenSharing ? 'screen' : 'camera'
      });

      console.log(`Offer sent to ${peerId}`);
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  }

  async handleOffer(data) {
    try {
      const { fromId, offer, streamType } = data;
      console.log(`Received offer from ${fromId}, streamType: ${streamType}`);

      let peerConnection = this.peerConnections.get(fromId);
      if (!peerConnection) {
        peerConnection = await this.createPeerConnection(fromId);
      }

      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await peerConnection.createAnswer({
        voiceActivityDetection: true
      });
      await peerConnection.setLocalDescription(answer);

      this.socket.emit('answer', {
        targetId: fromId,
        answer: answer,
        streamType: streamType
      });

      console.log(`Answer sent to ${fromId}`);
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }

  async handleAnswer(data) {
    try {
      const { fromId, answer, streamType } = data;
      console.log(`Received answer from ${fromId}, streamType: ${streamType}`);

      const peerConnection = this.peerConnections.get(fromId);

      if (peerConnection && peerConnection.signalingState === 'have-local-offer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log(`Answer processed from ${fromId}`);
      }
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }

  async handleIceCandidate(data) {
    try {
      const { fromId, candidate } = data;
      const peerConnection = this.peerConnections.get(fromId);

      if (peerConnection && peerConnection.remoteDescription) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        // Queue the candidate if remote description is not set yet
        console.log(`Queueing ICE candidate from ${fromId}`);
        setTimeout(() => this.handleIceCandidate(data), 500);
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  }

  handleRemoteStream(peerId, stream, participantData = null) {
    console.log('Handling remote stream from:', peerId);

    this.remoteStreams.set(peerId, stream);
    this.createRemoteVideoElement(peerId, stream, participantData);
  }

  createRemoteVideoElement(peerId, stream, participantData = null) {
    // Remove existing video element if it exists
    this.removeRemoteVideo(peerId);

    const videoContainer = document.createElement('div');
    videoContainer.className = 'remote-video-container fade-in';
    videoContainer.id = `video-container-${peerId}`;

    const videoElement = document.createElement('video');
    videoElement.id = `remote-video-${peerId}`;
    videoElement.className = 'remote-video';
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.muted = true;
    videoElement.srcObject = stream;

    // Handle video loading
    videoElement.onloadedmetadata = () => {
      console.log(`Remote video loaded for ${peerId}`);
    };

    videoElement.onerror = (error) => {
      console.error(`Remote video error for ${peerId}:`, error);
    };

    const participantName = participantData ? participantData.name : `User ${peerId.substring(0, 8)}`;

    const nameLabel = document.createElement('div');
    nameLabel.className = 'participant-name';
    nameLabel.textContent = participantName;

    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'video-controls';

    // Add audio/video indicators
    const audioIndicator = document.createElement('div');
    audioIndicator.className = 'audio-indicator';
    audioIndicator.innerHTML = '🎤';
    audioIndicator.title = 'Audio';

    const videoIndicator = document.createElement('div');
    videoIndicator.className = 'video-indicator';
    videoIndicator.innerHTML = '📹';
    videoIndicator.title = 'Video';

    controlsContainer.appendChild(audioIndicator);
    controlsContainer.appendChild(videoIndicator);

    videoContainer.appendChild(videoElement);
    videoContainer.appendChild(nameLabel);
    videoContainer.appendChild(controlsContainer);

    this.remoteVideosContainer.appendChild(videoContainer);

    console.log(`Created remote video element for ${peerId}`);
  }

  removeRemoteVideo(peerId) {
    const videoContainer = document.getElementById(`video-container-${peerId}`);
    if (videoContainer) {
      videoContainer.remove();
      console.log(`Removed remote video for ${peerId}`);
    }

    this.remoteStreams.delete(peerId);
  }

  handleRemoteVideoToggle(data) {
    const { participantId, hasVideo } = data;
    const videoElement = document.getElementById(`remote-video-${participantId}`);
    const videoIndicator = document.querySelector(`#video-container-${participantId} .video-indicator`);

    if (videoElement) {
      videoElement.style.opacity = hasVideo ? '1' : '0.3';
    }

    if (videoIndicator) {
      videoIndicator.style.opacity = hasVideo ? '1' : '0.3';
      videoIndicator.title = hasVideo ? 'Video On' : 'Video Off';
    }
  }

  handleRemoteAudioToggle(data) {
    const { participantId, hasAudio } = data;
    const audioIndicator = document.querySelector(`#video-container-${participantId} .audio-indicator`);

    if (audioIndicator) {
      audioIndicator.style.opacity = hasAudio ? '1' : '0.3';
      audioIndicator.title = hasAudio ? 'Audio On' : 'Audio Off';
    }
  }

  handleRemoteScreenShare(data) {
    const { participantId, isSharing } = data;
    const videoContainer = document.getElementById(`video-container-${participantId}`);

    if (videoContainer) {
      if (isSharing) {
        videoContainer.classList.add('screen-sharing');
        videoContainer.style.border = '3px solid #9C27B0';
      } else {
        videoContainer.classList.remove('screen-sharing');
        videoContainer.style.border = '';
      }
    }
  }

  handleDataChannelMessage(peerId, message) {
    try {
      const data = JSON.parse(message);
      console.log(`Data channel message from ${peerId}:`, data);

      // Handle different types of data channel messages
      switch (data.type) {
        case 'ping':
          this.sendDataChannelMessage(peerId, { type: 'pong' });
          break;
        case 'pong':
          // Handle pong response
          break;
        default:
          console.log('Unknown data channel message type:', data.type);
      }
    } catch (error) {
      console.error('Error parsing data channel message:', error);
    }
  }

  sendDataChannelMessage(peerId, message) {
    const dataChannel = this.dataChannels.get(peerId);
    if (dataChannel && dataChannel.readyState === 'open') {
      dataChannel.send(JSON.stringify(message));
    }
  }

  async toggleVideo() {
    if (!this.localStream) return false;

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      this.isVideoEnabled = videoTrack.enabled;

      this.socket.emit('toggle-video', {
        hasVideo: this.isVideoEnabled
      });

      console.log('Video toggled:', this.isVideoEnabled);
      return this.isVideoEnabled;
    }
    return false;
  }

  async toggleAudio() {
    if (!this.localStream) return false;

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      this.isAudioEnabled = audioTrack.enabled;

      this.socket.emit('toggle-audio', {
        hasAudio: this.isAudioEnabled
      });

      console.log('Audio toggled:', this.isAudioEnabled);
      return this.isAudioEnabled;
    }
    return false;
  }

  async startScreenShare() {
    try {
      if (this.isScreenSharing) {
        return false;
      }

      const screenStream = await this.getScreenStream();
      const videoTrack = screenStream.getVideoTracks()[0];

      // Replace video track in all peer connections
      const senders = [];
      for (const [peerId, peerConnection] of this.peerConnections) {
        const sender = peerConnection.getSenders().find(s => 
          s.track && s.track.kind === 'video'
        );

        if (sender) {
          await sender.replaceTrack(videoTrack);
          senders.push({ peerId, sender });
        }
      }

      // Update local video
      if (this.localVideoElement) {
        this.localVideoElement.srcObject = screenStream;
      }

      this.isScreenSharing = true;

      this.socket.emit('screen-share', { isSharing: true });

      console.log('Screen sharing started');
      return true;
    } catch (error) {
      console.error('Error starting screen share:', error);
      this.showError('Failed to start screen sharing');
      return false;
    }
  }

  async stopScreenShare() {
    try {
      if (!this.isScreenSharing) {
        return false;
      }

      // Stop screen stream
      if (this.screenStream) {
        this.screenStream.getTracks().forEach(track => track.stop());
        this.screenStream = null;
      }

      // Get camera stream back
      const cameraStream = await this.getLocalStream();
      const videoTrack = cameraStream.getVideoTracks()[0];

      // Replace screen track with camera track in all peer connections
      for (const [peerId, peerConnection] of this.peerConnections) {
        const sender = peerConnection.getSenders().find(s => 
          s.track && s.track.kind === 'video'
        );

        if (sender && videoTrack) {
          await sender.replaceTrack(videoTrack);
        }
      }

      this.isScreenSharing = false;

      this.socket.emit('screen-share', { isSharing: false });

      console.log('Screen sharing stopped');
      return true;
    } catch (error) {
      console.error('Error stopping screen share:', error);
      return false;
    }
  }

  async toggleScreenShare() {
    if (this.isScreenSharing) {
      return await this.stopScreenShare();
    } else {
      return await this.startScreenShare();
    }
  }

  closePeerConnection(peerId) {
    const peerConnection = this.peerConnections.get(peerId);
    if (peerConnection) {
      peerConnection.close();
      this.peerConnections.delete(peerId);
      console.log(`Closed peer connection for ${peerId}`);
    }

    const dataChannel = this.dataChannels.get(peerId);
    if (dataChannel) {
      dataChannel.close();
      this.dataChannels.delete(peerId);
    }
  }

  handleSocketDisconnect() {
    console.log('Handling socket disconnection...');
    // Don't close peer connections immediately, they might reconnect
    setTimeout(() => {
      if (this.socket && !this.socket.connected) {
        this.disconnect();
      }
    }, 5000);
  }

  disconnect() {
    console.log('Disconnecting WebRTC client...');

    // Close all peer connections
    for (const [peerId] of this.peerConnections) {
      this.closePeerConnection(peerId);
    }

    // Stop local streams
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }

    // Clear remote videos
    if (this.remoteVideosContainer) {
      this.remoteVideosContainer.innerHTML = '';
    }

    this.remoteStreams.clear();
    this.isInitialized = false;

    console.log('WebRTC client disconnected');
  }

  // Utility methods
  updateParticipantsList() {
    const count = this.peerConnections.size + 1; // +1 for local user
    const event = new CustomEvent('participantsUpdated', { detail: { count } });
    document.dispatchEvent(event);
  }

  showError(message) {
    const event = new CustomEvent('webrtcError', { detail: { message } });
    document.dispatchEvent(event);
  }

  // Get connection statistics (for debugging)
  async getConnectionStats(peerId) {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) return null;

    const stats = await peerConnection.getStats();
    return stats;
  }

  // Check if WebRTC is supported
  static isSupported() {
    return !!(navigator.mediaDevices && 
              navigator.mediaDevices.getUserMedia && 
              window.RTCPeerConnection);
  }
}

// Export for use in other files
window.WebRTCClient = WebRTCClient;
