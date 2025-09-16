// Main application script for WebRTC Virtual Classroom
class VirtualClassroom {
  constructor() {
    // Core components
    this.socket = null;
    this.webrtcClient = null;
    this.chatManager = null;

    // State management
    this.currentRoom = null;
    this.currentUser = null;
    this.isHost = false;
    this.participants = new Map();

    // UI state
    this.activeTab = 'chat';
    this.isFullscreen = false;
    this.isRecording = false;
    this.settings = {
      videoQuality: 'medium',
      audioQuality: 'medium',
      notifications: true
    };

    this.init();
  }

  init() {
    this.loadSettings();
    this.setupEventListeners();
    this.checkWebRTCSupport();
    this.requestNotificationPermission();
  }

  checkWebRTCSupport() {
    if (!WebRTCClient.isSupported()) {
      this.showError('Your browser does not support WebRTC. Please use a modern browser.');
      return false;
    }
    return true;
  }

  loadSettings() {
    const saved = localStorage.getItem('classroom-settings');
    if (saved) {
      this.settings = { ...this.settings, ...JSON.parse(saved) };
    }
  }

  saveSettings() {
    localStorage.setItem('classroom-settings', JSON.stringify(this.settings));
  }

  setupEventListeners() {
    // Global event listeners
    document.addEventListener('participantsUpdated', (e) => {
      this.updateParticipantsCount(e.detail.count);
    });

    document.addEventListener('webrtcError', (e) => {
      this.showError(e.detail.message);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      this.handleKeyboardShortcuts(e);
    });

    // Visibility change (for notifications)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.chatManager) {
        this.chatManager.clearUnreadCount();
      }
    });

    // Window beforeunload
    window.addEventListener('beforeunload', (e) => {
      if (this.currentRoom) {
        e.preventDefault();
        e.returnValue = 'Are you sure you want to leave the classroom?';
      }
    });

    // Resize handler
    window.addEventListener('resize', () => {
      this.handleResize();
    });
  }

  handleKeyboardShortcuts(e) {
    // Only handle shortcuts when not typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    if (e.ctrlKey) {
      switch (e.key) {
        case 'm':
        case 'M':
          e.preventDefault();
          this.toggleAudio();
          break;
        case 'v':
        case 'V':
          e.preventDefault();
          this.toggleVideo();
          break;
        case 'Enter':
          e.preventDefault();
          if (this.chatManager) {
            document.getElementById('messageInput').focus();
          }
          break;
      }
    }

    // ESC key
    if (e.key === 'Escape') {
      this.closeModals();
    }
  }

  closeModals() {
    // Close any open modals
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
      if (modal.style.display !== 'none') {
        modal.style.display = 'none';
      }
    });
  }

  async requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }

  // Room management
  async joinRoom() {
    const roomId = document.getElementById('roomId').value.trim();
    const userName = document.getElementById('userName').value.trim();
    const userRole = document.getElementById('userRole').value;

    if (!roomId || !userName) {
      this.showError('Please enter both room ID and your name');
      return;
    }

    this.showLoading(true);

    try {
      // Connect to server
      // Configuration for WebRTC Virtual Classroom
// NEW CODE - Replace with this:
this.socket = io(window.APP_CONFIG.SERVER_URL, {
  transports: ['websocket', 'polling'],
  timeout: 20000,
  forceNew: false,
  withCredentials: true
});


// Auto-detect environment
const environment = window.location.hostname === 'localhost' ? 'development' : 'production';

// Export current config
window.APP_CONFIG = config[environment];

console.log('🔗 Connecting to backend:', window.APP_CONFIG.SERVER_URL);


      // Setup connection event handlers
      this.socket.on('connect', () => {
        console.log('Connected to server');
      });

      this.socket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);
        this.handleDisconnection(reason);
      });

      this.socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        this.showError('Failed to connect to server. Please try again.');
        this.showLoading(false);
      });

      // Setup WebRTC client
      const localVideo = document.getElementById('localVideo');
      const remoteVideos = document.getElementById('remoteVideos');

      this.webrtcClient = new WebRTCClient(this.socket, localVideo, remoteVideos);

      // Initialize WebRTC
      const initialized = await this.webrtcClient.initialize();
      if (!initialized) {
        throw new Error('Failed to access camera/microphone');
      }

      // Setup chat manager
      const chatMessages = document.getElementById('chatMessages');
      const messageInput = document.getElementById('messageInput');
      const sendButton = document.getElementById('sendButton');

      this.chatManager = new ChatManager(this.socket, chatMessages, messageInput, sendButton);

      // Store user info
      this.currentUser = {
        name: userName,
        role: userRole
      };

      // Join room
      this.socket.emit('join-room', {
        roomId: roomId,
        userData: this.currentUser
      }, (response) => {
        this.handleJoinResponse(response, roomId);
      });

      // Setup additional event listeners
      this.setupRoomEventListeners();

    } catch (error) {
      console.error('Error joining room:', error);
      this.showError('Failed to join room: ' + error.message);
      this.showLoading(false);
    }
  }

  handleJoinResponse(response, roomId) {
    this.showLoading(false);

    if (response.success) {
      this.currentRoom = roomId;
      this.showMainInterface();
      this.updateRoomInfo(roomId);

      // Show success message
      this.showNotification('Successfully joined the classroom!', 'success');
    } else {
      this.showError('Failed to join room: ' + response.error);
    }
  }

  setupRoomEventListeners() {
    this.socket.on('room-joined', (data) => {
      this.isHost = data.isHost;
      this.updateParticipantsCount(data.participants.length);
      this.updateHostControls();

      // Load chat history is handled by ChatManager
      console.log('Room joined successfully', data);
    });

    this.socket.on('participant-joined', (data) => {
      this.participants.set(data.participant.id, data.participant);
      this.updateParticipantsList();
      this.showNotification(`${data.participant.name} joined the classroom`);
    });

    this.socket.on('participant-left', (data) => {
      const participant = this.participants.get(data.participantId);
      const name = participant ? participant.name : 'A participant';
      this.participants.delete(data.participantId);
      this.updateParticipantsList();
      this.showNotification(`${name} left the classroom`);
    });

    this.socket.on('new-host', (data) => {
      this.isHost = (data.hostId === this.socket.id);
      this.updateHostControls();
      this.showNotification('Host has changed', 'info');
    });

    this.socket.on('kicked', () => {
      this.showError('You have been removed from the classroom');
      this.leaveRoom();
    });

    this.socket.on('force-mute', (data) => {
      if (data.muted && this.webrtcClient && this.webrtcClient.isAudioEnabled) {
        this.toggleAudio();
        this.showNotification('You have been muted by the host', 'warning');
      }
    });
  }

  leaveRoom() {
    if (confirm('Are you sure you want to leave the classroom?')) {
      this.performLeave();
    }
  }

  performLeave() {
    if (this.socket) {
      this.socket.emit('leave-room');
      this.socket.disconnect();
    }

    if (this.webrtcClient) {
      this.webrtcClient.disconnect();
    }

    // Reset state
    this.resetApplicationState();

    // Show join form
    this.showJoinForm();

    console.log('Left classroom');
  }

  resetApplicationState() {
    this.currentRoom = null;
    this.currentUser = null;
    this.isHost = false;
    this.participants.clear();
    this.activeTab = 'chat';
    this.isRecording = false;

    // Clear UI
    document.getElementById('remoteVideos').innerHTML = '';
    document.getElementById('chatMessages').innerHTML = '';
    document.getElementById('participantsList').innerHTML = '';

    // Reset form
    document.getElementById('roomId').value = '';
    document.getElementById('userName').value = '';
  }

  handleDisconnection(reason) {
    if (reason === 'io server disconnect') {
      // Server disconnected us
      this.showError('Disconnected by server');
    } else if (reason === 'transport close') {
      // Connection lost
      this.showError('Connection lost. Attempting to reconnect...');
    }

    // Don't automatically leave on temporary disconnections
    setTimeout(() => {
      if (this.socket && !this.socket.connected) {
        this.showError('Unable to reconnect. Please rejoin the classroom.');
        this.performLeave();
      }
    }, 10000);
  }

  // Media controls
  async toggleVideo() {
    if (this.webrtcClient) {
      const isEnabled = await this.webrtcClient.toggleVideo();
      this.updateVideoButton(isEnabled);
      return isEnabled;
    }
    return false;
  }

  async toggleAudio() {
    if (this.webrtcClient) {
      const isEnabled = await this.webrtcClient.toggleAudio();
      this.updateAudioButton(isEnabled);
      return isEnabled;
    }
    return false;
  }

  async toggleScreenShare() {
    if (this.webrtcClient) {
      const isSharing = await this.webrtcClient.toggleScreenShare();
      this.updateScreenButton(isSharing);
      return isSharing;
    }
    return false;
  }

  toggleRecording() {
    // This is a placeholder for recording functionality
    this.isRecording = !this.isRecording;
    this.updateRecordButton(this.isRecording);

    if (this.isRecording) {
      this.showNotification('Recording started', 'info');
    } else {
      this.showNotification('Recording stopped', 'info');
    }
  }

  // UI Updates
  updateVideoButton(isEnabled) {
    const btn = document.getElementById('videoBtn');
    const icon = btn.querySelector('.btn-icon');
    const text = btn.querySelector('.btn-text');

    if (isEnabled) {
      btn.classList.add('active');
      btn.classList.remove('inactive');
      icon.textContent = '📹';
      text.textContent = 'Video';
      btn.title = 'Turn off video';
    } else {
      btn.classList.remove('active');
      btn.classList.add('inactive');
      icon.textContent = '📹';
      text.textContent = 'Video Off';
      btn.title = 'Turn on video';
    }
  }

  updateAudioButton(isEnabled) {
    const btn = document.getElementById('audioBtn');
    const icon = btn.querySelector('.btn-icon');
    const text = btn.querySelector('.btn-text');

    if (isEnabled) {
      btn.classList.add('active');
      btn.classList.remove('inactive');
      icon.textContent = '🎤';
      text.textContent = 'Audio';
      btn.title = 'Turn off audio';
    } else {
      btn.classList.remove('active');
      btn.classList.add('inactive');
      icon.textContent = '🎤';
      text.textContent = 'Muted';
      btn.title = 'Turn on audio';
    }
  }

  updateScreenButton(isSharing) {
    const btn = document.getElementById('screenBtn');
    const icon = btn.querySelector('.btn-icon');
    const text = btn.querySelector('.btn-text');

    if (isSharing) {
      btn.classList.add('active');
      icon.textContent = '🖥️';
      text.textContent = 'Stop Share';
      btn.title = 'Stop screen sharing';
    } else {
      btn.classList.remove('active');
      icon.textContent = '🖥️';
      text.textContent = 'Share';
      btn.title = 'Share screen';
    }
  }

  updateRecordButton(isRecording) {
    const btn = document.getElementById('recordBtn');
    const icon = btn.querySelector('.btn-icon');
    const text = btn.querySelector('.btn-text');

    if (isRecording) {
      btn.classList.add('active');
      icon.textContent = '⏹️';
      text.textContent = 'Stop Rec';
      btn.title = 'Stop recording';
    } else {
      btn.classList.remove('active');
      icon.textContent = '⏺️';
      text.textContent = 'Record';
      btn.title = 'Start recording';
    }
  }

  updateParticipantsCount(count) {
    const countElement = document.getElementById('participantsCount');
    const badgeElement = document.getElementById('peopleBadge');

    if (countElement) {
      countElement.textContent = `${count} participant${count !== 1 ? 's' : ''}`;
    }

    if (badgeElement) {
      badgeElement.textContent = count;
    }
  }

  updateRoomInfo(roomId) {
    const roomElement = document.getElementById('roomName');
    if (roomElement) {
      roomElement.textContent = `Room: ${roomId}`;
    }

    // Update page title
    document.title = `Virtual Classroom - ${roomId}`;
  }

  updateHostControls() {
    // Show/hide host-specific controls
    const hostControls = document.querySelectorAll('.host-only');
    hostControls.forEach(control => {
      control.style.display = this.isHost ? 'block' : 'none';
    });
  }

  updateParticipantsList() {
    const container = document.getElementById('participantsList');
    if (!container) return;

    container.innerHTML = '';

    // Add current user
    const selfItem = this.createParticipantItem({
      id: 'self',
      name: this.currentUser.name + ' (You)',
      role: this.currentUser.role,
      isHost: this.isHost,
      isSelf: true
    });
    container.appendChild(selfItem);

    // Add other participants
    this.participants.forEach(participant => {
      const item = this.createParticipantItem(participant);
      container.appendChild(item);
    });
  }

  createParticipantItem(participant) {
    const item = document.createElement('div');
    item.className = 'participant-item';
    item.setAttribute('data-participant-id', participant.id);

    const avatarColor = this.getColorFromString(participant.name);
    const initial = participant.name.charAt(0).toUpperCase();

    item.innerHTML = `
      <div class="participant-avatar" style="background: ${avatarColor}">
        ${initial}
      </div>
      <div class="participant-info">
        <div class="participant-name">
          ${this.escapeHtml(participant.name)}
          ${participant.isHost ? ' 👑' : ''}
        </div>
        <div class="participant-status">
          <span class="role">${participant.role || 'participant'}</span>
          <span class="connection">🟢 Connected</span>
        </div>
      </div>
      ${this.createParticipantActions(participant)}
    `;

    return item;
  }

  createParticipantActions(participant) {
    if (participant.isSelf || !this.isHost) {
      return '<div class="participant-actions"></div>';
    }

    return `
      <div class="participant-actions">
        <button class="action-btn mute" onclick="classroom.muteParticipant('${participant.id}')" title="Mute">
          🔇
        </button>
        <button class="action-btn kick" onclick="classroom.kickParticipant('${participant.id}')" title="Remove">
          ❌
        </button>
      </div>
    `;
  }

  // Host controls
  muteParticipant(participantId) {
    if (this.isHost && this.socket) {
      this.socket.emit('mute-participant', {
        participantId: participantId,
        muted: true
      });

      const participant = this.participants.get(participantId);
      const name = participant ? participant.name : 'Participant';
      this.showNotification(`Muted ${name}`, 'info');
    }
  }

  kickParticipant(participantId) {
    const participant = this.participants.get(participantId);
    const name = participant ? participant.name : 'participant';

    if (confirm(`Are you sure you want to remove ${name} from the classroom?`)) {
      if (this.isHost && this.socket) {
        this.socket.emit('kick-participant', {
          participantId: participantId
        });

        this.showNotification(`Removed ${name} from classroom`, 'info');
      }
    }
  }

  // Tab management
  switchTab(tabName) {
    // Update active tab
    this.activeTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}Tab`).classList.add('active');

    // Clear unread count for active tab
    if (tabName === 'chat' && this.chatManager) {
      this.chatManager.clearUnreadCount();
    }
  }

  // Modal management
  showSettings() {
    const modal = document.getElementById('settingsModal');
    modal.style.display = 'flex';

    // Load current settings
    document.getElementById('videoQuality').value = this.settings.videoQuality;
    document.getElementById('audioQuality').value = this.settings.audioQuality;
    document.getElementById('notifications').checked = this.settings.notifications;
  }

  closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
  }

  saveSettings() {
    this.settings.videoQuality = document.getElementById('videoQuality').value;
    this.settings.audioQuality = document.getElementById('audioQuality').value;
    this.settings.notifications = document.getElementById('notifications').checked;

    this.saveSettings();
    this.closeSettings();

    this.showNotification('Settings saved', 'success');
  }

  showHelp() {
    const modal = document.getElementById('helpModal');
    modal.style.display = 'flex';
  }

  closeHelp() {
    document.getElementById('helpModal').style.display = 'none';
  }

  // Utility functions
  createQuickRoom() {
    const roomId = 'room-' + Math.random().toString(36).substr(2, 8);
    document.getElementById('roomId').value = roomId;
    document.getElementById('userName').focus();
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        this.isFullscreen = true;
      });
    } else {
      document.exitFullscreen().then(() => {
        this.isFullscreen = false;
      });
    }
  }

  togglePiP() {
    const localVideo = document.getElementById('localVideo');
    if (localVideo.requestPictureInPicture) {
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture();
      } else {
        localVideo.requestPictureInPicture();
      }
    }
  }

  handleResize() {
    // Handle responsive layout changes
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');

    if (window.innerWidth < 768) {
      // Mobile layout adjustments
      if (sidebar) {
        sidebar.style.position = 'absolute';
        sidebar.style.bottom = '0';
        sidebar.style.height = '300px';
      }
    } else {
      // Desktop layout
      if (sidebar) {
        sidebar.style.position = 'static';
        sidebar.style.height = 'auto';
      }
    }
  }

  // UI Helper functions
  showLoading(show) {
    const loading = document.getElementById('loading');
    loading.style.display = show ? 'block' : 'none';
  }

  showJoinForm() {
    document.getElementById('joinForm').style.display = 'flex';
    document.getElementById('mainContainer').style.display = 'none';
  }

  showMainInterface() {
    document.getElementById('joinForm').style.display = 'none';
    document.getElementById('mainContainer').style.display = 'flex';
  }

  showError(message) {
    this.showNotification(message, 'error');
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      border-radius: 8px;
      color: white;
      font-weight: 500;
      z-index: 3000;
      max-width: 300px;
      word-wrap: break-word;
      animation: slideInRight 0.3s ease;
    `;

    // Set background color based on type
    const colors = {
      success: '#4CAF50',
      error: '#f44336',
      warning: '#ff9800',
      info: '#2196F3'
    };
    notification.style.backgroundColor = colors[type] || colors.info;

    notification.textContent = message;

    document.body.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 300);
      }
    }, 5000);

    // Browser notification if permitted and window not focused
    if (this.settings.notifications && 
        'Notification' in window && 
        Notification.permission === 'granted' && 
        document.hidden) {
      new Notification('Virtual Classroom', {
        body: message,
        icon: '/favicon.ico'
      });
    }
  }

  getColorFromString(str) {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];

    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// CSS animations
const animationCSS = `
@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOutRight {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}
`;

// Add animation styles
const style = document.createElement('style');
style.textContent = animationCSS;
document.head.appendChild(style);

// Initialize the application
let classroom;

// Global functions (called from HTML)
function joinRoom() {
  classroom.joinRoom();
}

function leaveRoom() {
  classroom.leaveRoom();
}

function toggleVideo() {
  classroom.toggleVideo();
}

function toggleAudio() {
  classroom.toggleAudio();
}

function toggleScreenShare() {
  classroom.toggleScreenShare();
}

function toggleRecording() {
  classroom.toggleRecording();
}

function toggleWhiteboard() {
  // Placeholder for whiteboard functionality
  classroom.showNotification('Whiteboard feature coming soon!', 'info');
}

function toggleFileShare() {
  // Switch to files tab
  classroom.switchTab('files');
}

function switchTab(tabName) {
  classroom.switchTab(tabName);
}

function toggleFullscreen() {
  classroom.toggleFullscreen();
}

function togglePiP() {
  classroom.togglePiP();
}

function showSettings() {
  classroom.showSettings();
}

function closeSettings() {
  classroom.closeSettings();
}

function saveSettings() {
  classroom.saveSettings();
}

function showHelp() {
  classroom.showHelp();
}

function closeHelp() {
  classroom.closeHelp();
}

function createQuickRoom() {
  classroom.createQuickRoom();
}

function clearChat() {
  if (classroom.chatManager) {
    classroom.chatManager.clearChat();
  }
}

function exportChat() {
  if (classroom.chatManager) {
    classroom.chatManager.exportChat();
  }
}

function insertEmoji() {
  if (classroom.chatManager) {
    classroom.chatManager.insertEmoji();
  }
}

function togglePrivateMode() {
  if (classroom.chatManager) {
    classroom.chatManager.togglePrivateMode();
  }
}

function inviteParticipants() {
  const roomId = classroom.currentRoom;
  const url = `${window.location.origin}?room=${encodeURIComponent(roomId)}`;

  if (navigator.share) {
    navigator.share({
      title: 'Join Virtual Classroom',
      text: `Join my virtual classroom: ${roomId}`,
      url: url
    });
  } else {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(url).then(() => {
      classroom.showNotification('Invitation link copied to clipboard!', 'success');
    });
  }
}

function manageParticipants() {
  classroom.switchTab('participants');
}

function uploadFile() {
  // Trigger file input
  const fileInput = document.querySelector('input[type="file"]');
  if (fileInput) {
    fileInput.click();
  }
}

function clearFiles() {
  // Clear files list
  classroom.showNotification('Files cleared', 'info');
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  classroom = new VirtualClassroom();

  // Check for room ID in URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('room');
  if (roomId) {
    document.getElementById('roomId').value = roomId;
  }
});

// Export for debugging
window.classroom = classroom;
