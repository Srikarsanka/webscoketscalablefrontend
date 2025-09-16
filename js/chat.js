// Chat Manager for Virtual Classroom
class ChatManager {
  constructor(socket, chatContainer, messageInput, sendButton) {
    this.socket = socket;
    this.chatContainer = chatContainer;
    this.messageInput = messageInput;
    this.sendButton = sendButton;

    this.participants = new Map();
    this.messageHistory = [];
    this.privateChats = new Map();
    this.isTyping = false;
    this.typingTimer = null;
    this.unreadCount = 0;
    this.isPrivateMode = false;
    this.currentPrivateTarget = null;

    // Message types
    this.messageTypes = {
      TEXT: 'text',
      FILE: 'file',
      IMAGE: 'image',
      SYSTEM: 'system',
      PRIVATE: 'private'
    };

    // Emoji list for quick access
    this.commonEmojis = ['😀', '😂', '😍', '🤔', '👍', '👎', '❤️', '🎉', '👏', '🔥'];

    this.setupEventListeners();
    this.setupFileSharing();
  }

  setupEventListeners() {
    // Send message on button click
    this.sendButton.addEventListener('click', (e) => {
      e.preventDefault();
      this.sendMessage();
    });

    // Send message on Enter key (Ctrl+Enter for newline)
    this.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        this.sendMessage();
      } else if (e.key === 'Enter' && e.ctrlKey) {
        // Insert newline
        const start = this.messageInput.selectionStart;
        const end = this.messageInput.selectionEnd;
        const value = this.messageInput.value;
        this.messageInput.value = value.slice(0, start) + '\n' + value.slice(end);
        this.messageInput.selectionStart = this.messageInput.selectionEnd = start + 1;
      }
    });

    // Typing indicator
    this.messageInput.addEventListener('input', () => {
      this.handleTyping();
      this.autoResizeInput();
    });

    // Socket event listeners
    this.socket.on('new-message', (message) => {
      this.displayMessage(message);
      this.playNotificationSound();
    });

    this.socket.on('private-message', (message) => {
      this.displayPrivateMessage(message);
      this.playNotificationSound();
    });

    this.socket.on('file-shared', (fileData) => {
      this.displayFileMessage(fileData);
      this.playNotificationSound();
    });

    this.socket.on('participant-joined', (data) => {
      this.addParticipant(data.participant);
      this.displaySystemMessage(`${data.participant.name} joined the classroom`);
    });

    this.socket.on('participant-left', (data) => {
      const participantName = this.participants.get(data.participantId)?.name || 'A participant';
      this.removeParticipant(data.participantId);
      this.displaySystemMessage(`${participantName} left the classroom`);
    });

    this.socket.on('user-typing', (data) => {
      this.showTypingIndicator(data.userId, data.userName, data.isTyping);
    });

    // Auto-resize message input
    this.autoResizeInput();
  }

  sendMessage() {
    const message = this.messageInput.value.trim();
    if (!message) return;

    // Check for commands
    if (message.startsWith('/')) {
      this.handleCommand(message);
      this.messageInput.value = '';
      this.autoResizeInput();
      return;
    }

    // Send private message if in private mode
    if (this.isPrivateMode && this.currentPrivateTarget) {
      this.sendPrivateMessage(this.currentPrivateTarget, message);
    } else {
      // Send regular message
      this.socket.emit('send-message', {
        message: message,
        type: this.messageTypes.TEXT
      });
    }

    this.messageInput.value = '';
    this.autoResizeInput();
    this.stopTyping();
  }

  handleCommand(command) {
    const [cmd, ...args] = command.slice(1).split(' ');

    switch (cmd.toLowerCase()) {
      case 'private':
      case 'pm':
        const targetId = args[0];
        const privateMessage = args.slice(1).join(' ');
        if (targetId && privateMessage) {
          this.sendPrivateMessage(targetId, privateMessage);
        } else {
          this.displaySystemMessage('Usage: /private [userId] [message]');
        }
        break;

      case 'clear':
        this.clearChat();
        break;

      case 'help':
        this.showHelp();
        break;

      case 'emoji':
        this.showEmojiPicker();
        break;

      case 'users':
      case 'participants':
        this.listParticipants();
        break;

      default:
        this.displaySystemMessage(`Unknown command: /${cmd}. Type /help for available commands.`);
    }
  }

  sendPrivateMessage(targetId, message) {
    this.socket.emit('send-private-message', {
      targetId: targetId,
      message: message
    });

    // Show confirmation to sender
    const targetName = this.participants.get(targetId)?.name || targetId;
    this.displaySystemMessage(`Private message sent to ${targetName}`);
  }

  displayMessage(message) {
    this.messageHistory.push(message);

    const messageElement = this.createMessageElement(message);
    this.chatContainer.appendChild(messageElement);

    this.scrollToBottom();
    this.updateUnreadCount();

    // Trim old messages to prevent memory issues
    if (this.messageHistory.length > 1000) {
      this.messageHistory = this.messageHistory.slice(-500);
      this.trimOldMessages();
    }
  }

  displayPrivateMessage(message) {
    const messageElement = this.createMessageElement(message, true);
    this.chatContainer.appendChild(messageElement);
    this.scrollToBottom();
    this.updateUnreadCount();
  }

  displayFileMessage(fileData) {
    const messageElement = this.createFileMessageElement(fileData);
    this.chatContainer.appendChild(messageElement);
    this.scrollToBottom();
    this.updateUnreadCount();

    // Update files count
    this.updateFilesCount();
  }

  displaySystemMessage(text, type = 'info') {
    const messageElement = document.createElement('div');
    messageElement.className = `message system-message ${type}`;
    messageElement.innerHTML = `
      <div class="system-content">
        <span class="system-icon">${this.getSystemIcon(type)}</span>
        <span class="system-text">${this.escapeHtml(text)}</span>
        <span class="message-time">${this.formatTime(new Date())}</span>
      </div>
    `;

    this.chatContainer.appendChild(messageElement);
    this.scrollToBottom();
  }

  createMessageElement(message, isPrivate = false) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isPrivate ? 'private-message' : ''}`;
    messageElement.setAttribute('data-message-id', message.id);
    messageElement.setAttribute('data-sender-id', message.senderId);

    const time = new Date(message.timestamp);
    const avatar = message.senderAvatar || this.generateAvatar(message.senderName);

    messageElement.innerHTML = `
      <div class="message-header">
        <div class="sender-info">
          <img src="${avatar}" class="sender-avatar" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"50\" fill=\"${this.getColorFromString(message.senderName)}\"/><text x=\"50\" y=\"55\" text-anchor=\"middle\" fill=\"white\" font-size=\"40\" font-weight=\"bold\">${message.senderName.charAt(0).toUpperCase()}</text></svg>'">
          <span class="sender-name">${this.escapeHtml(message.senderName)}</span>
          ${isPrivate ? '<span class="private-label">Private</span>' : ''}
        </div>
        <div class="message-actions">
          <span class="message-time">${this.formatTime(time)}</span>
          <button class="message-action-btn" onclick="chatManager.replyToMessage('${message.id}')" title="Reply">↩️</button>
          ${!isPrivate ? `<button class="message-action-btn" onclick="chatManager.startPrivateChat('${message.senderId}')" title="Private Message">💬</button>` : ''}
        </div>
      </div>
      <div class="message-content">
        ${this.formatMessageContent(message.message)}
      </div>
    `;

    // Add animation
    messageElement.classList.add('fade-in');

    return messageElement;
  }

  createFileMessageElement(fileData) {
    const messageElement = document.createElement('div');
    messageElement.className = 'message file-message';

    const time = new Date(fileData.timestamp);
    const fileSize = this.formatFileSize(fileData.fileSize);
    const isImage = fileData.fileType.startsWith('image/');

    messageElement.innerHTML = `
      <div class="message-header">
        <div class="sender-info">
          <span class="sender-name">${this.escapeHtml(fileData.senderName)}</span>
        </div>
        <span class="message-time">${this.formatTime(time)}</span>
      </div>
      <div class="file-content">
        ${isImage ? this.createImagePreview(fileData) : this.createFilePreview(fileData)}
        <div class="file-actions">
          <button class="download-btn" onclick="chatManager.downloadFile('${fileData.fileData}', '${fileData.fileName}')">
            📥 Download
          </button>
          <span class="file-size">${fileSize}</span>
        </div>
      </div>
    `;

    return messageElement;
  }

  createImagePreview(fileData) {
    return `
      <div class="image-preview">
        <img src="${fileData.fileData}" alt="${fileData.fileName}" 
             onclick="chatManager.openImageModal(this.src, '${fileData.fileName}')"
             style="max-width: 200px; max-height: 150px; border-radius: 8px; cursor: pointer;">
        <div class="file-name">${this.escapeHtml(fileData.fileName)}</div>
      </div>
    `;
  }

  createFilePreview(fileData) {
    return `
      <div class="file-info">
        <div class="file-icon">${this.getFileIcon(fileData.fileType)}</div>
        <div class="file-details">
          <div class="file-name">${this.escapeHtml(fileData.fileName)}</div>
          <div class="file-type">${fileData.fileType}</div>
        </div>
      </div>
    `;
  }

  setupFileSharing() {
    // Create file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.style.display = 'none';
    fileInput.multiple = false;
    fileInput.accept = '*/*';

    // Find and setup file share button
    const fileButton = document.querySelector('.file-share-btn');
    if (fileButton) {
      fileButton.addEventListener('click', () => {
        fileInput.click();
      });
    }

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.shareFile(file);
      }
      // Reset input
      fileInput.value = '';
    });

    document.body.appendChild(fileInput);
  }

  async shareFile(file) {
    const maxSize = 10 * 1024 * 1024; // 10MB limit

    if (file.size > maxSize) {
      this.displaySystemMessage('File size must be less than 10MB', 'error');
      return;
    }

    try {
      // Show upload progress
      this.showUploadProgress(file.name);

      const fileData = await this.fileToBase64(file);

      this.socket.emit('share-file', {
        fileName: file.name,
        fileData: fileData,
        fileType: file.type,
        fileSize: file.size
      });

      this.hideUploadProgress();
      this.displaySystemMessage(`File "${file.name}" shared successfully`, 'success');

    } catch (error) {
      console.error('Error sharing file:', error);
      this.hideUploadProgress();
      this.displaySystemMessage('Failed to share file', 'error');
    }
  }

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  }

  downloadFile(fileData, fileName) {
    try {
      const link = document.createElement('a');
      link.href = fileData;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error downloading file:', error);
      this.displaySystemMessage('Failed to download file', 'error');
    }
  }

  // Typing indicator functionality
  handleTyping() {
    if (!this.isTyping) {
      this.isTyping = true;
      this.socket.emit('user-typing', { isTyping: true });
    }

    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => {
      this.stopTyping();
    }, 2000);
  }

  stopTyping() {
    if (this.isTyping) {
      this.isTyping = false;
      this.socket.emit('user-typing', { isTyping: false });
    }
    clearTimeout(this.typingTimer);
  }

  showTypingIndicator(userId, userName, isTyping) {
    const indicator = document.getElementById('typingIndicator');
    if (!indicator) return;

    if (isTyping) {
      indicator.textContent = `${userName} is typing...`;
      indicator.style.opacity = '1';
    } else {
      indicator.textContent = '';
      indicator.style.opacity = '0';
    }
  }

  // Message formatting
  formatMessageContent(content) {
    let formatted = this.escapeHtml(content);

    // URLs
    formatted = formatted.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" class="message-link">$1</a>'
    );

    // Email addresses
    formatted = formatted.replace(
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
      '<a href="mailto:$1" class="message-link">$1</a>'
    );

    // Bold text **text**
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Italic text *text*
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Code blocks `code`
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');

    // Emoji shortcodes
    formatted = this.replaceEmojiShortcodes(formatted);

    return formatted;
  }

  replaceEmojiShortcodes(text) {
    const emojiMap = {
      ':smile:': '😀',
      ':laugh:': '😂',
      ':heart:': '❤️',
      ':thumbsup:': '👍',
      ':thumbsdown:': '👎',
      ':fire:': '🔥',
      ':party:': '🎉',
      ':clap:': '👏',
      ':thinking:': '🤔'
    };

    for (const [shortcode, emoji] of Object.entries(emojiMap)) {
      text = text.replace(new RegExp(shortcode, 'g'), emoji);
    }

    return text;
  }

  // Utility functions
  formatTime(date) {
    return date.toLocaleTimeString('en-US', {
      hour12: true,
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getFileIcon(fileType) {
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType.startsWith('video/')) return '🎥';
    if (fileType.startsWith('audio/')) return '🎵';
    if (fileType.includes('pdf')) return '📄';
    if (fileType.includes('document') || fileType.includes('word')) return '📝';
    if (fileType.includes('spreadsheet') || fileType.includes('excel')) return '📊';
    if (fileType.includes('presentation') || fileType.includes('powerpoint')) return '📊';
    if (fileType.includes('zip') || fileType.includes('rar')) return '🗜️';
    return '📁';
  }

  getSystemIcon(type) {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info':
      default: return 'ℹ️';
    }
  }

  generateAvatar(name) {
    const firstLetter = name.charAt(0).toUpperCase();
    const color = this.getColorFromString(name);

    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="${color}"/><text x="50" y="55" text-anchor="middle" fill="white" font-size="40" font-weight="bold">${firstLetter}</text></svg>`;
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

  scrollToBottom(smooth = true) {
    this.chatContainer.scrollTo({
      top: this.chatContainer.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto'
    });
  }

  autoResizeInput() {
    this.messageInput.style.height = 'auto';
    this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 100) + 'px';
  }

  // Chat management functions
  clearChat() {
    this.chatContainer.innerHTML = '';
    this.messageHistory = [];
    this.displaySystemMessage('Chat cleared', 'info');
  }

  exportChat() {
    const chatData = {
      messages: this.messageHistory,
      exportedAt: new Date().toISOString(),
      participants: Array.from(this.participants.values())
    };

    const blob = new Blob([JSON.stringify(chatData, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chat-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    this.displaySystemMessage('Chat exported successfully', 'success');
  }

  showHelp() {
    const helpText = `
      <strong>Available Commands:</strong><br>
      <code>/private [userId] [message]</code> - Send private message<br>
      <code>/pm [userId] [message]</code> - Send private message (alias)<br>
      <code>/clear</code> - Clear chat<br>
      <code>/help</code> - Show this help<br>
      <code>/emoji</code> - Show emoji picker<br>
      <code>/users</code> - List participants<br><br>

      <strong>Formatting:</strong><br>
      <code>**bold**</code> - <strong>bold text</strong><br>
      <code>*italic*</code> - <em>italic text</em><br>
      <code>\`code\`</code> - <code>code text</code><br><br>

      <strong>Shortcuts:</strong><br>
      <kbd>Enter</kbd> - Send message<br>
      <kbd>Ctrl+Enter</kbd> - New line<br>
      <kbd>Ctrl+M</kbd> - Toggle microphone<br>
      <kbd>Ctrl+V</kbd> - Toggle video
    `;

    this.displaySystemMessage(helpText, 'info');
  }

  listParticipants() {
    const participantList = Array.from(this.participants.values())
      .map(p => `• ${p.name} (${p.role || 'participant'})`)
      .join('<br>');

    this.displaySystemMessage(`<strong>Participants:</strong><br>${participantList}`, 'info');
  }

  // Private chat functionality
  togglePrivateMode() {
    this.isPrivateMode = !this.isPrivateMode;
    const button = document.querySelector('[onclick="togglePrivateMode()"]');

    if (this.isPrivateMode) {
      button.style.background = '#ff9800';
      this.messageInput.placeholder = 'Private mode: Select a participant to message...';
      this.displaySystemMessage('Private mode enabled. Click on a participant to start private chat.', 'info');
    } else {
      button.style.background = '';
      this.messageInput.placeholder = 'Type a message...';
      this.currentPrivateTarget = null;
      this.displaySystemMessage('Private mode disabled.', 'info');
    }
  }

  startPrivateChat(participantId) {
    this.isPrivateMode = true;
    this.currentPrivateTarget = participantId;
    const participant = this.participants.get(participantId);
    const name = participant ? participant.name : participantId;

    this.messageInput.placeholder = `Private message to ${name}...`;
    this.messageInput.focus();

    this.displaySystemMessage(`Started private chat with ${name}`, 'info');
  }

  // Emoji functionality
  insertEmoji() {
    this.showEmojiPicker();
  }

  showEmojiPicker() {
    // Simple emoji picker implementation
    const emojiContainer = document.createElement('div');
    emojiContainer.className = 'emoji-picker';
    emojiContainer.style.cssText = `
      position: absolute;
      bottom: 60px;
      right: 20px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 10px;
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 5px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      z-index: 1000;
    `;

    this.commonEmojis.forEach(emoji => {
      const button = document.createElement('button');
      button.textContent = emoji;
      button.style.cssText = `
        border: none;
        background: none;
        font-size: 20px;
        cursor: pointer;
        padding: 5px;
        border-radius: 4px;
      `;
      button.onmouseover = () => button.style.background = '#f0f0f0';
      button.onmouseout = () => button.style.background = 'none';
      button.onclick = () => {
        this.insertTextAtCursor(emoji);
        document.body.removeChild(emojiContainer);
      };
      emojiContainer.appendChild(button);
    });

    // Close picker when clicking outside
    const closeHandler = (e) => {
      if (!emojiContainer.contains(e.target)) {
        document.body.removeChild(emojiContainer);
        document.removeEventListener('click', closeHandler);
      }
    };

    document.body.appendChild(emojiContainer);
    setTimeout(() => document.addEventListener('click', closeHandler), 100);
  }

  insertTextAtCursor(text) {
    const start = this.messageInput.selectionStart;
    const end = this.messageInput.selectionEnd;
    const value = this.messageInput.value;

    this.messageInput.value = value.slice(0, start) + text + value.slice(end);
    this.messageInput.selectionStart = this.messageInput.selectionEnd = start + text.length;
    this.messageInput.focus();
    this.autoResizeInput();
  }

  // Participant management
  addParticipant(participant) {
    this.participants.set(participant.id, participant);
    this.updateParticipantsUI();
  }

  removeParticipant(participantId) {
    this.participants.delete(participantId);
    this.updateParticipantsUI();
  }

  updateParticipantsUI() {
    // Update participants count
    const event = new CustomEvent('participantsUpdated', {
      detail: { count: this.participants.size + 1 } // +1 for current user
    });
    document.dispatchEvent(event);
  }

  // UI helper functions
  updateUnreadCount() {
    if (document.hidden || !this.isVisible()) {
      this.unreadCount++;
      this.updateChatBadge();
    }
  }

  updateChatBadge() {
    const badge = document.getElementById('chatBadge');
    if (badge) {
      badge.textContent = this.unreadCount;
      badge.style.display = this.unreadCount > 0 ? 'block' : 'none';
    }
  }

  updateFilesCount() {
    const fileMessages = this.chatContainer.querySelectorAll('.file-message');
    const badge = document.getElementById('filesBadge');
    if (badge) {
      badge.textContent = fileMessages.length;
      badge.style.display = fileMessages.length > 0 ? 'block' : 'none';
    }
  }

  clearUnreadCount() {
    this.unreadCount = 0;
    this.updateChatBadge();
  }

  isVisible() {
    const chatTab = document.getElementById('chatTab');
    return chatTab && chatTab.classList.contains('active');
  }

  // Utility functions
  showUploadProgress(fileName) {
    const progress = document.createElement('div');
    progress.id = 'uploadProgress';
    progress.className = 'upload-progress';
    progress.innerHTML = `
      <div class="progress-content">
        <span>Uploading ${fileName}...</span>
        <div class="progress-bar">
          <div class="progress-fill"></div>
        </div>
      </div>
    `;
    progress.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 15px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      z-index: 1000;
    `;

    document.body.appendChild(progress);
  }

  hideUploadProgress() {
    const progress = document.getElementById('uploadProgress');
    if (progress) {
      document.body.removeChild(progress);
    }
  }

  playNotificationSound() {
    // Simple notification sound using Web Audio API
    if (this.audioContext && this.isVisible()) return; // Don't play if chat is visible

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
      // Fallback to system notification
      if (Notification.permission === 'granted') {
        new Notification('New message in classroom', {
          icon: '/favicon.ico',
          tag: 'chat-message'
        });
      }
    }
  }

  trimOldMessages() {
    const messages = this.chatContainer.querySelectorAll('.message');
    const maxMessages = 500;

    if (messages.length > maxMessages) {
      for (let i = 0; i < messages.length - maxMessages; i++) {
        messages[i].remove();
      }
    }
  }

  // Message interaction functions
  replyToMessage(messageId) {
    const message = this.messageHistory.find(m => m.id === messageId);
    if (message) {
      this.messageInput.value = `@${message.senderName} `;
      this.messageInput.focus();
      this.autoResizeInput();
    }
  }

  openImageModal(src, fileName) {
    // Create image modal
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      cursor: pointer;
    `;

    modal.innerHTML = `
      <img src="${src}" alt="${fileName}" style="max-width: 90%; max-height: 90%; border-radius: 8px;">
      <div style="position: absolute; top: 20px; right: 20px; color: white; font-size: 24px; cursor: pointer;">×</div>
    `;

    modal.onclick = () => document.body.removeChild(modal);
    document.body.appendChild(modal);
  }
}

// Export for use in other files
window.ChatManager = ChatManager;
