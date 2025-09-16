// webrtc-client.js
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
        // Add your TURN server here
        {
          urls: 'turn:your-turn-server.com:3478',
          username: 'your-username',
          credential: 'your-password'
        }
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
        autoGainControl: true
      }
    };
    
    this.setupEventListeners();
  }

  async initialize() {
    try {
      await this.getLocalStream();
      return true;
    } catch (error) {
      console.error('Failed to initialize WebRTC:', error);
      return false;
    }
  }

  async getLocalStream(constraints = this.constraints) {
    try {
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
      }
      
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localVideoElement.srcObject = this.localStream;
      
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
        audio: true
      };
      
      this.screenStream = await navigator.mediaDevices.getDisplayMedia(screenConstraints);
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
  }

  async handleParticipantJoined(data) {
    const { participant } = data;
    console.log('Participant joined:', participant);
    
    // Create peer connection for new participant
    await this.createPeerConnection(participant.id);
    
    // Create and send offer
    await this.createOffer(participant.id);
  }

  handleParticipantLeft(data) {
    const { participantId } = data;
    console.log('Participant left:', participantId);
    
    this.closePeerConnection(participantId);
    this.removeRemoteVideo(participantId);
  }

  async createPeerConnection(peerId) {
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
        this.handleRemoteStream(peerId, event.streams[0]);
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
        console.log(`Connection state with ${peerId}: ${peerConnection.connectionState}`);
        
        if (peerConnection.connectionState === 'disconnected' || 
            peerConnection.connectionState === 'failed') {
          this.closePeerConnection(peerId);
          this.removeRemoteVideo(peerId);
        }
      };

      // Create data channel for each peer
      const dataChannel = peerConnection.createDataChannel('messages', {
        ordered: true
      });
      
      dataChannel.onopen = () => {
        console.log(`Data channel opened with ${peerId}`);
      };
      
      dataChannel.onmessage = (event) => {
        console.log(`Received data from ${peerId}:`, event.data);
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
      if (!peerConnection) return;

      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });

      await peerConnection.setLocalDescription(offer);
      
      this.socket.emit('offer', {
        targetId: peerId,
        offer: offer,
        streamType: 'camera'
      });
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  }

  async handleOffer(data) {
    try {
      const { fromId, offer, streamType } = data;
      
      let peerConnection = this.peerConnections.get(fromId);
      if (!peerConnection) {
        peerConnection = await this.createPeerConnection(fromId);
      }

      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      this.socket.emit('answer', {
        targetId: fromId,
        answer: answer,
        streamType: streamType
      });
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }

  async handleAnswer(data) {
    try {
      const { fromId, answer } = data;
      const peerConnection = this.peerConnections.get(fromId);
      
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      }
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }

  async handleIceCandidate(data) {
    try {
      const { fromId, candidate } = data;
      const peerConnection = this.peerConnections.get(fromId);
      
      if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  }

  handleRemoteStream(peerId, stream) {
    console.log('Received remote stream from:', peerId);
    
    this.remoteStreams.set(peerId, stream);
    this.createRemoteVideoElement(peerId, stream);
  }

  createRemoteVideoElement(peerId, stream) {
    // Remove existing video element if it exists
    this.removeRemoteVideo(peerId);
    
    const videoContainer = document.createElement('div');
    videoContainer.className = 'remote-video-container';
    videoContainer.id = `video-container-${peerId}`;
    
    const videoElement = document.createElement('video');
    videoElement.id = `remote-video-${peerId}`;
    videoElement.className = 'remote-video';
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.muted = true; // Remote videos should be muted
    videoElement.srcObject = stream;
    
    const nameLabel = document.createElement('div');
    nameLabel.className = 'participant-name';
    nameLabel.textContent = `Participant ${peerId.substring(0, 8)}`;
    
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'video-controls';
    
    // Add audio/video indicators
    const audioIndicator = document.createElement('div');
    audioIndicator.className = 'audio-indicator';
    audioIndicator.innerHTML = '🎤';
    
    const videoIndicator = document.createElement('div');
    videoIndicator.className = 'video-indicator';
    videoIndicator.innerHTML = '📹';
    
    controlsContainer.appendChild(audioIndicator);
    controlsContainer.appendChild(videoIndicator);
    
    videoContainer.appendChild(videoElement);
    videoContainer.appendChild(nameLabel);
    videoContainer.appendChild(controlsContainer);
    
    this.remoteVideosContainer.appendChild(videoContainer);
  }

  removeRemoteVideo(peerId) {
    const videoContainer = document.getElementById(`video-container-${peerId}`);
    if (videoContainer) {
      videoContainer.remove();
    }
    
    this.remoteStreams.delete(peerId);
  }

  handleRemoteVideoToggle(data) {
    const { participantId, hasVideo } = data;
    const videoElement = document.getElementById(`remote-video-${participantId}`);
    
    if (videoElement) {
      videoElement.style.display = hasVideo ? 'block' : 'none';
    }
  }

  handleRemoteAudioToggle(data) {
    const { participantId, hasAudio } = data;
    const audioIndicator = document.querySelector(`#video-container-${participantId} .audio-indicator`);
    
    if (audioIndicator) {
      audioIndicator.style.opacity = hasAudio ? '1' : '0.3';
    }
  }

  async toggleVideo() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        
        this.socket.emit('toggle-video', {
          hasVideo: videoTrack.enabled
        });
        
        return videoTrack.enabled;
      }
    }
    return false;
  }

  async toggleAudio() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        
        this.socket.emit('toggle-audio', {
          hasAudio: audioTrack.enabled
        });
        
        return audioTrack.enabled;
      }
    }
    return false;
  }

  async startScreenShare() {
    try {
      const screenStream = await this.getScreenStream();
      
      // Replace video track in all peer connections
      const videoTrack = screenStream.getVideoTracks()[0];
      
      for (const [peerId, peerConnection] of this.peerConnections) {
        const sender = peerConnection.getSenders().find(s => 
          s.track && s.track.kind === 'video'
        );
        
        if (sender) {
          await sender.replaceTrack(videoTrack);
        }
      }
      
      // Update local video
      this.localVideoElement.srcObject = screenStream;
      
      // Handle screen share end
      videoTrack.onended = () => {
        this.stopScreenShare();
      };
      
      this.socket.emit('screen-share', { isSharing: true });
      
      return true;
    } catch (error) {
      console.error('Error starting screen share:', error);
      return false;
    }
  }

  async stopScreenShare() {
    try {
      if (this.screenStream) {
        this.screenStream.getTracks().forEach(track => track.stop());
      }
      
      // Get camera stream back
      const cameraStream = await this.getLocalStream();
      const videoTrack = cameraStream.getVideoTracks()[0];
      
      // Replace screen track with camera track
      for (const [peerId, peerConnection] of this.peerConnections) {
        const sender = peerConnection.getSenders().find(s => 
          s.track && s.track.kind === 'video'
        );
        
        if (sender) {
          await sender.replaceTrack(videoTrack);
        }
      }
      
      this.socket.emit('screen-share', { isSharing: false });
      
      return true;
    } catch (error) {
      console.error('Error stopping screen share:', error);
      return false;
    }
  }

  closePeerConnection(peerId) {
    const peerConnection = this.peerConnections.get(peerId);
    if (peerConnection) {
      peerConnection.close();
      this.peerConnections.delete(peerId);
    }
    
    const dataChannel = this.dataChannels.get(peerId);
    if (dataChannel) {
      dataChannel.close();
      this.dataChannels.delete(peerId);
    }
  }

  disconnect() {
    // Close all peer connections
    for (const [peerId] of this.peerConnections) {
      this.closePeerConnection(peerId);
    }
    
    // Stop local streams
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }
    
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
    }
  }
}
