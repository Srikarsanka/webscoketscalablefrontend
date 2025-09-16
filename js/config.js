// Configuration for WebRTC Virtual Classroom
const config = {
  development: {
    SERVER_URL: 'http://localhost:3001',
    API_BASE_URL: 'http://localhost:3001/api'
  },
  production: {
    SERVER_URL: 'https://web-scoketscalable.onrender.com',
    API_BASE_URL: 'https://web-scoketscalable.onrender.com/api'
  }
};

// Auto-detect environment
const environment = window.location.hostname === 'localhost' ? 'development' : 'production';

// Export current config
window.APP_CONFIG = config[environment];

console.log('🔗 Connecting to backend:', window.APP_CONFIG.SERVER_URL);
