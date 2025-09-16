// chat.js
class ChatManager {
  constructor(socket, chatContainer, messageInput, sendButton) {
    this.socket = socket;
    this.chatContainer = chatContainer;
    this.messageInput = messageInput;
    this.sendButton = sendButton;
    
    this.participants = new Map();
    this.messageHistory = [];
    this.privateChats = new Map();
    this.isMinimized = false;
    this.unreadCount = 0;
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Send message on button click
    this.sendButton.addEventListener('click', () => {
      this.sendMessage();
    });

    // Send message on Enter key
    this.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Socket event listeners
    this.socket.on('new-message', (message) => {
      this.displayMessage(message);
    });

    this.socket.on('private-message', (message) => {
      this.displayPrivateMessage(message);
    });

    this.socket.on('file-shared', (fileData) => {
      this.displayFileMessage(fileData);
    });

    this.socket.on('participant-joined', (data) => {
      this.addParticipant(data.participant);
      this.displaySystemMessage(`${data.participant.name} joined the room`);
    });

    this.socket.on('participant-left', (data) => {
      this.displaySystemMessage(`${data.participantName || 'A participant'} left the room`);
    });

    // File input for file sharing
    this.setupFileSharing();
  }

  sendMessage() {
    const message = this.messageInput.value.trim();
    if (!message) return;

    // Check for commands
    if (message.startsWith('/')) {
      this.handleCommand(message);
      this.messageInput.value = '';
      return;
    }

    // Send regular message
    this.socket.emit('send-message', {
      message: message,
      type: 'text'
    });

    this.messageInput.value = '';
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
        }
        break;
        
      case 'clear':
        this.clearChat();
        break;
        
      case 'help':
        this.showHelp();
        break;
        
      default:
        this.displaySystemMessage(`Unknown command: ${cmd}`);
    }
  }

  sendPrivateMessage(targetId, message) {
    this.socket.emit('send-private-message', {
      targetId: targetId,
      message: message
    });
  }

  displayMessage(message) {
    this.messageHistory.push(message);
    
    const messageElement = this.createMessageElement(message);
    this.chatContainer.appendChild(messageElement);
    
    this.scrollToBottom();
    
    if (this.isMinimized) {
      this.unreadCount++;
      this.updateUnreadIndicator();
    }
  }

  displayPrivateMessage(message) {
    const messageElement = this.createMessageElement(message, true);
    this.chatContainer.appendChild(messageElement);
    this.scrollToBottom();
  }

  displayFileMessage(fileData) {
    const messageElement = this.createFileMessageElement(fileData);
    this.chatContainer.appendChild(messageElement);
    this.scrollToBottom();
  }

  displaySystemMessage(text) {
    const messageElement = document.createElement('div');
    messageElement.className = 'system-message';
    messageElement.innerHTML = `
      <span class="system-text">${this.escapeHtml(text)}</span>
      <span class="message-time">${this.formatTime(new Date())}</span>
    `;
    
    this.chatContainer.appendChild(messageElement);
    this.scrollToBottom();
  }

  createMessageElement(message, isPrivate = false) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isPrivate ? 'private-message' : ''}`;
    messageElement.setAttribute('data-message-id', message.id);
    
    const time = new Date(message.timestamp);
    
    messageElement.innerHTML = `
      <div class="message-header">
        <div class="sender-info">
          ${message.senderAvatar ? `<img src="${message.senderAvatar}" class="sender-avatar" alt="">` : ''}
          <span class="sender-name">${this.escapeHtml(message.senderName)}</span>
          ${isPrivate ? '<span class="private-label">Private</span>' : ''}
        </div>
        <span class="message-time">${this.formatTime(time)}</span>
      </div>
      <div class="message-content">
        ${this.formatMessageContent(message.message)}
      </div>
    `;
    
    return messageElement;
  }

  createFileMessageElement(fileData) {
    const messageElement = document.createElement('div');
    messageElement.className = 'message file-message';
    
    const time = new Date(fileData.timestamp);
    const fileSize = this.formatFileSize(fileData.fileSize);
    
    messageElement.innerHTML = `
      <div class="message-header">
        <div class="sender-info">
          <span class="sender-name">${this.escapeHtml(fileData.senderName)}</span>
        </div>
        <span class="message-time">${this.formatTime(time)}</span>
      </div>
      <div class="file-content">
        <div class="file-info">
          <div class="file-icon">${this.getFileIcon(fileData.fileType)}</div>
          <div class="file-details">
            <div class="file-name">${this.escapeHtml(fileData.fileName)}</div>
            <div class="file-size">${fileSize}</div>
          </div>
        </div>
        <button class="download-btn" onclick="this.downloadFile('${fileData.fileData}', '${fileData.fileName}')">
          Download
        </button>
      </div>
    `;
    
    return messageElement;
  }

  setupFileSharing() {
    // Create file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.style.display = 'none';
    fileInput.multiple = false;
    fileInput.accept = '*/*';
    
    // Create file share button
    const fileButton = document.createElement('button');
    fileButton.className = 'file-share-btn';
    fileButton.innerHTML = '📎';
    fileButton.title = 'Share file';
    
    fileButton.addEventListener('click', () => {
      fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.shareFile(file);
      }
    });
    
    // Add to chat input container
    const inputContainer = this.messageInput.parentElement;
    inputContainer.insertBefore(fileButton, this.sendButton);
    document.body.appendChild(fileInput);
  }

  async shareFile(file) {
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      alert('File size must be less than 10MB');
      return;
    }
    
    try {
      const fileData = await this.fileToBase64(file);
      
      this.socket.emit('share-file', {
        fileName: file.name,
        fileData: fileData,
        fileType: file.type,
        fileSize: file.size
      });
      
    } catch (error) {
      console.error('Error sharing file:', error);
      alert('Failed to share file');
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
    const link = document.createElement('a');
    link.href = fileData;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  formatMessageContent(content) {
    // Basic text formatting
    let formatted = this.escapeHtml(content);
    
    // URLs
    formatted = formatted.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    
    // Bold text **text**
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic text *text*
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
  }

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
    return '📁';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  scrollToBottom() {
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  clearChat() {
    this.chatContainer.innerHTML = '';
    this.messageHistory = [];
  }

  showHelp() {
    const helpText = `
      Available commands:
      /private [userId] [message] - Send private message
      /pm [userId] [message] - Send private message (alias)
      /clear - Clear chat
      /help - Show this help message
    `;
    this.displaySystemMessage(helpText);
  }

  minimizeChat() {
    this.isMinimized = true;
    this.chatContainer.parentElement.classList.add('minimized');
  }

  maximizeChat() {
    this.isMinimized = false;
    this.unreadCount = 0;
    this.updateUnreadIndicator();
    this.chatContainer.parentElement.classList.remove('minimized');
  }

  updateUnreadIndicator() {
    // Update UI to show unread count
    const indicator = document.querySelector('.unread-indicator');
    if (indicator) {
      indicator.textContent = this.unreadCount;
      indicator.style.display = this.unreadCount > 0 ? 'block' : 'none';
    }
  }

  addParticipant(participant) {
    this.participants.set(participant.id, participant);
  }

  removeParticipant(participantId) {
    this.participants.delete(participantId);
  }
}
