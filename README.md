# WebRTC Virtual Classroom - Frontend

A modern, responsive frontend for the WebRTC Virtual Classroom application built with vanilla HTML, CSS, and JavaScript.

## Features

- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Modern UI**: Clean, minimalistic design with light theme
- **Real-time Video Calls**: Support for up to 100 participants
- **Interactive Chat**: Text messages, private messages, and file sharing
- **Screen Sharing**: Share your screen with all participants
- **Participant Management**: View and manage classroom participants
- **File Sharing**: Share files up to 10MB with the class
- **Keyboard Shortcuts**: Quick access to common functions
- **Settings Panel**: Customize video/audio quality and notifications

## File Structure

```
frontend/
├── index.html          # Main HTML file
├── css/
│   └── styles.css      # All CSS styles
├── js/
│   ├── webrtc-client.js    # WebRTC functionality
│   ├── chat.js         # Chat and messaging
│   └── main.js         # Main application logic
└── README.md           # This file
```

## Getting Started

### Prerequisites

- Modern web browser with WebRTC support (Chrome, Firefox, Safari, Edge)
- Camera and microphone access
- WebRTC Virtual Classroom backend server running

### Installation

1. **Serve the files**: The frontend needs to be served over HTTP/HTTPS, not opened directly as files.

2. **Using the backend server** (recommended):
   ```bash
   cd ../backend
   npm start
   # Frontend will be available at http://localhost:3001
   ```

3. **Using a simple HTTP server**:
   ```bash
   # Python 3
   python -m http.server 8000

   # Python 2
   python -m SimpleHTTPServer 8000

   # Node.js (with http-server)
   npx http-server

   # PHP
   php -S localhost:8000
   ```

4. **Open in browser**: Navigate to `http://localhost:8000` (or your server URL)

## Usage

### Joining a Classroom

1. **Enter Room Details**:
   - Room ID: Enter the classroom identifier
   - Your Name: Enter your display name
   - Role: Select Student, Teacher, or Guest

2. **Grant Permissions**: Allow camera and microphone access when prompted

3. **Join**: Click "Join Classroom" to enter the room

### Controls

#### Video Controls
- **Video Toggle**: Turn camera on/off
- **Audio Toggle**: Mute/unmute microphone
- **Screen Share**: Share your screen with participants
- **Record**: Start/stop session recording (placeholder)

#### Chat Features
- **Text Messages**: Send messages to all participants
- **Private Messages**: Use `/private [userId] [message]` command
- **File Sharing**: Click attachment icon to share files
- **Emoji**: Use emoji picker or shortcodes like `:smile:`

#### Keyboard Shortcuts
- `Ctrl+M`: Toggle microphone
- `Ctrl+V`: Toggle video camera
- `Ctrl+Enter`: Focus chat input
- `Enter`: Send chat message
- `Escape`: Close modals

### Chat Commands

- `/private [userId] [message]` - Send private message
- `/pm [userId] [message]` - Send private message (alias)
- `/clear` - Clear your chat history
- `/help` - Show help information
- `/emoji` - Show emoji picker
- `/users` - List all participants

### Settings

Access settings via the gear icon in the header:

- **Video Quality**: Low (480p), Medium (720p), High (1080p)
- **Audio Quality**: Low, Medium, High
- **Notifications**: Enable/disable sound notifications

## Browser Compatibility

### Supported Browsers

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome | 60+ | Full support |
| Firefox | 60+ | Full support |
| Safari | 12+ | Full support |
| Edge | 79+ | Full support |
| Mobile Safari | 12+ | Limited on iOS < 14.3 |
| Chrome Mobile | 60+ | Full support |

### Required Features

- WebRTC (RTCPeerConnection, getUserMedia)
- WebSockets (Socket.io)
- ES6+ JavaScript features
- CSS Grid and Flexbox
- File API for file sharing

## Customization

### Themes

The application uses CSS custom properties for easy theming:

```css
:root {
  --primary-color: #667eea;
  --primary-light: #764ba2;
  --secondary-color: #f093fb;
  --success-color: #4CAF50;
  --warning-color: #ff9800;
  --danger-color: #f44336;
  /* ... more variables */
}
```

### Adding Custom Features

1. **Add UI Elements**: Modify `index.html`
2. **Style Elements**: Update `styles.css`
3. **Add Functionality**: Extend classes in JavaScript files

Example - Adding a new control button:

```html
<!-- In index.html -->
<button class="control-btn custom" onclick="customFunction()">
  <span class="btn-icon">🎨</span>
  <span class="btn-text">Custom</span>
</button>
```

```css
/* In styles.css */
.control-btn.custom {
  background: #9C27B0;
  color: white;
}
```

```javascript
// In main.js
function customFunction() {
  classroom.showNotification('Custom feature activated!', 'info');
}
```

## API Integration

### WebRTC Client

The `WebRTCClient` class handles all WebRTC functionality:

```javascript
// Initialize WebRTC client
const webrtcClient = new WebRTCClient(socket, localVideo, remoteVideos);
await webrtcClient.initialize();

// Toggle media
await webrtcClient.toggleVideo();
await webrtcClient.toggleAudio();
await webrtcClient.startScreenShare();
```

### Chat Manager

The `ChatManager` class handles messaging:

```javascript
// Initialize chat
const chatManager = new ChatManager(socket, chatContainer, messageInput, sendButton);

// Send message
chatManager.sendMessage();

// Handle file sharing
chatManager.shareFile(file);
```

### Socket.io Events

#### Outgoing Events (Client → Server)

```javascript
// Join room
socket.emit('join-room', { roomId, userData }, callback);

// WebRTC signaling
socket.emit('offer', { targetId, offer, streamType });
socket.emit('answer', { targetId, answer, streamType });
socket.emit('ice-candidate', { targetId, candidate });

// Media controls
socket.emit('toggle-video', { hasVideo });
socket.emit('toggle-audio', { hasAudio });
socket.emit('screen-share', { isSharing });

// Chat
socket.emit('send-message', { message, type });
socket.emit('share-file', { fileName, fileData, fileType, fileSize });
```

#### Incoming Events (Server → Client)

```javascript
// Room events
socket.on('room-joined', (data) => { /* Handle room join */ });
socket.on('participant-joined', (data) => { /* New participant */ });
socket.on('participant-left', (data) => { /* Participant left */ });

// WebRTC signaling
socket.on('offer', (data) => { /* Handle offer */ });
socket.on('answer', (data) => { /* Handle answer */ });
socket.on('ice-candidate', (data) => { /* Handle ICE candidate */ });

// Chat events
socket.on('new-message', (message) => { /* Display message */ });
socket.on('file-shared', (fileData) => { /* Handle file */ });
```

## Performance Optimization

### For Large Groups (50+ participants)

1. **Limit Video Streams**: Implement video pagination
2. **Optimize Video Quality**: Use adaptive bitrate
3. **Lazy Load**: Load remote videos on demand
4. **Memory Management**: Clean up old messages and streams

### Code Example - Video Pagination

```javascript
class VideoGrid {
  constructor(container, maxVisible = 9) {
    this.container = container;
    this.maxVisible = maxVisible;
    this.currentPage = 0;
    this.videos = [];
  }

  showPage(page) {
    const start = page * this.maxVisible;
    const end = start + this.maxVisible;

    this.videos.forEach((video, index) => {
      video.style.display = (index >= start && index < end) ? 'block' : 'none';
    });
  }
}
```

## Troubleshooting

### Common Issues

1. **No Video/Audio**:
   - Check browser permissions
   - Ensure HTTPS (required for getUserMedia)
   - Check camera/microphone hardware

2. **Connection Issues**:
   - Verify backend server is running
   - Check network firewall settings
   - Ensure TURN servers are configured for production

3. **Screen Sharing Not Working**:
   - Use Chrome/Firefox (best support)
   - Check browser permissions
   - Ensure HTTPS connection

4. **Chat Messages Not Sending**:
   - Check Socket.io connection
   - Verify server is responding
   - Check browser console for errors

### Debug Tools

1. **Browser DevTools**:
   ```javascript
   // Check WebRTC stats
   classroom.webrtcClient.getConnectionStats(peerId).then(console.log);

   // Check socket connection
   console.log(classroom.socket.connected);

   // View participants
   console.log(classroom.participants);
   ```

2. **Network Tab**: Monitor Socket.io and WebRTC traffic

3. **Console Logs**: Check for JavaScript errors

### Mobile Issues

1. **iOS Safari Limitations**:
   - Limited WebRTC support on older versions
   - Picture-in-picture may not work
   - Screen sharing limited

2. **Android Chrome**:
   - Generally full support
   - May need HTTPS for some features

## Security Considerations

1. **Input Validation**: All user inputs are sanitized
2. **XSS Prevention**: HTML escaping for chat messages
3. **File Upload Limits**: 10MB max file size
4. **HTTPS Required**: For WebRTC functionality
5. **Content Security Policy**: Implement CSP headers

## Deployment

### Production Checklist

- [ ] Minify CSS and JavaScript files
- [ ] Enable HTTPS/SSL certificates
- [ ] Configure proper CORS settings
- [ ] Set up CDN for static assets
- [ ] Implement error tracking (Sentry, etc.)
- [ ] Add analytics if needed
- [ ] Test on all target browsers
- [ ] Configure proper caching headers

### Build Process (Optional)

You can use build tools to optimize the frontend:

```bash
# Using Webpack
npm install --save-dev webpack webpack-cli
npm install --save-dev css-loader mini-css-extract-plugin

# Using Vite
npm install --save-dev vite

# Using Parcel
npm install --save-dev parcel
```

## Contributing

1. Follow existing code style and conventions
2. Test on multiple browsers
3. Ensure responsive design works
4. Add comments for complex functionality
5. Update documentation for new features

## License

MIT License - see LICENSE file for details.
