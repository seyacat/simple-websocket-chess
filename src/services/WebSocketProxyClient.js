/**
 * WebSocket Proxy Client
 * 
 * Client library for connecting to the simplified WebSocket proxy server.
 * Features:
 * - Reconnection logic with local identifier handshake
 * - Channel support (publish/list)
 * - Active connections tracking
 * - Event-based API
 */

export class WebSocketProxyClient {
  /**
   * Create a new WebSocketProxyClient instance
   * @param {Object} options Configuration options
   * @param {string} options.url WebSocket server URL (default: 'ws://localhost:4001')
   * @param {boolean} options.autoReconnect Enable auto-reconnection (default: true)
   * @param {number} options.maxReconnectAttempts Maximum reconnection attempts (default: 5)
   * @param {number} options.reconnectDelay Delay between reconnection attempts in ms (default: 3000)
   * @param {string} options.localIdentifier Local identifier for handshake (auto-generated if not provided)
   */
  constructor(options = {}) {
    // Configuration
    this.config = {
      url: options.url || 'ws://localhost:4001',
      autoReconnect: options.autoReconnect !== false,
      maxReconnectAttempts: options.maxReconnectAttempts || 5,
      reconnectDelay: options.reconnectDelay || 3000,
      localIdentifier: options.localIdentifier || this.generateLocalIdentifier()
    };

    // Connection state
    this.ws = null;
    this.token = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.pendingReconnect = false;

    // Data stores
    this.activeConnections = new Map(); // token -> {metadata}
    this.channelSubscriptions = new Map(); // channel -> {tokens, lastUpdate}
    this.waitingHandshakes = new Map(); // messageId -> {targetToken, localId, timestamp, timeout}
    
    // Event system
    this.eventHandlers = new Map();

    // Bind methods
    this.handleOpen = this.handleOpen.bind(this);
    this.handleMessage = this.handleMessage.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  /**
   * Generate a local identifier for handshake
   * @returns {string} Local identifier
   */
  generateLocalIdentifier() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `local_${timestamp}_${random}`;
  }

  /**
   * Connect to the WebSocket server
   * @returns {Promise<void>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.log('WebSocket already connected');
        resolve();
        return;
      }

      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }

      console.log(`Connecting to WebSocket: ${this.config.url}`);

      try {
        this.ws = new WebSocket(this.config.url);

        this.ws.onopen = (event) => {
          this.handleOpen(event);
          resolve();
        };

        this.ws.onerror = (error) => {
          this.handleError(error);
          reject(new Error(`WebSocket connection error: ${error.message || 'Unknown error'}`));
        };

        // Set other handlers
        this.ws.onmessage = this.handleMessage;
        this.ws.onclose = this.handleClose;

      } catch (error) {
        console.error('Error creating WebSocket:', error);
        reject(error);
      }
    });
  }

  /**
   * Handle WebSocket open event
   * @param {Event} event 
   */
  handleOpen(event) {
    console.log('WebSocket connected');
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.pendingReconnect = false;

    // Send handshake with local identifier
    this.sendHandshake();

    this.emit('connect', this.config.localIdentifier);
  }

  /**
   * Send handshake message with local identifier
   */
  sendHandshake() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const handshake = {
      type: 'handshake',
      localId: this.config.localIdentifier,
      timestamp: new Date().toISOString()
    };

    this.ws.send(JSON.stringify(handshake));
    console.log('Handshake sent:', handshake);
  }

  /**
   * Handle WebSocket message event
   * @param {MessageEvent} event 
   */
  handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      this.processMessage(data);
    } catch (error) {
      console.error('Error parsing WebSocket message:', error, event.data);
      this.emit('error', { type: 'parse_error', error: error.message, data: event.data });
    }
  }

  /**
   * Process incoming message from server
   * @param {Object} data Parsed message data
   */
  processMessage(data) {
    const { type, ...rest } = data;

    switch (type) {
      case 'connected':
        this.handleConnected(rest);
        break;
      case 'message':
        this.handleIncomingMessage(rest);
        break;
      case 'message_sent':
        this.handleMessageSent(rest);
        break;
      case 'disconnected':
        this.handleDisconnected(rest);
        break;
      case 'disconnect_confirmation':
        this.handleDisconnectConfirmation(rest);
        break;
      case 'published':
        this.handlePublished(rest);
        break;
      case 'channel_list':
        this.handleChannelList(rest);
        break;
      case 'handshake_accepted':
        this.handleHandshakeAccepted(rest);
        break;
      case 'error':
        this.handleErrorResponse(rest);
        break;
      default:
        console.log('Unhandled message type:', type, rest);
        this.emit('unknown_message', { type, ...rest });
    }
  }

  /**
   * Handle connected message from server
   * @param {Object} data 
   */
  handleConnected(data) {
    this.token = data.token;
    console.log(`Connected to server. Token: ${this.token}, Timestamp: ${data.timestamp}`);
    
    this.emit('token_assigned', this.token);
    
    // If we have pending handshake (reconnection), resend it
    if (this.pendingReconnect) {
      this.sendHandshake();
      this.pendingReconnect = false;
    }
  }

  /**
   * Handle incoming message from another client
   * @param {Object} data 
   */
  handleIncomingMessage(data) {
    const { from, message, timestamp } = data;
    
    // Add to active connections if not already there
    if (!this.activeConnections.has(from)) {
      this.activeConnections.set(from, {
        connectedAt: Date.now(),
        lastMessage: timestamp,
        messageCount: 0
      });
      this.emit('paired', from);
    }
    
    // Update connection info
    const conn = this.activeConnections.get(from);
    conn.lastMessage = timestamp;
    conn.messageCount = (conn.messageCount || 0) + 1;
    
    console.log(`Message from ${from}: ${message}`);
    this.emit('message', from, message, timestamp);
  }

  /**
   * Handle message sent confirmation
   * @param {Object} data 
   */
  handleMessageSent(data) {
    const { sent, total, failed, timestamp } = data;
    
    if (failed && failed.length > 0) {
      console.log(`Message sent: ${sent}/${total} successful. Failed: ${failed.join(', ')}`);
      this.emit('message_partial', { sent, total, failed, timestamp });
    } else {
      console.log(`Message sent: ${sent}/${total} successful`);
      this.emit('message_delivered', { sent, total, timestamp });
    }
  }

  /**
   * Handle disconnected notification
   * @param {Object} data 
   */
  handleDisconnected(data) {
    const { token, timestamp } = data;
    
    // Remove from active connections
    if (this.activeConnections.has(token)) {
      this.activeConnections.delete(token);
      this.emit('unpaired', token, timestamp);
    }
    
    console.log(`Disconnected from ${token} at ${timestamp}`);
    this.emit('peer_disconnected', token, timestamp);
  }

  /**
   * Handle disconnect confirmation
   * @param {Object} data 
   */
  handleDisconnectConfirmation(data) {
    const { target, timestamp } = data;
    console.log(`Disconnect confirmed from ${target} at ${timestamp}`);
    this.emit('disconnect_confirmed', target, timestamp);
  }

  /**
   * Handle published confirmation
   * @param {Object} data 
   */
  handlePublished(data) {
    const { channel, timestamp } = data;
    console.log(`Published to channel ${channel} at ${timestamp}`);
    this.emit('published', channel, timestamp);
  }

  /**
   * Handle channel list response
   * @param {Object} data
   */
  handleChannelList(data) {
    const { channel, tokens, count, maxEntries, timestamp } = data;
    
    // Update channel subscriptions
    this.channelSubscriptions.set(channel, {
      tokens,
      lastUpdate: timestamp,
      count,
      maxEntries
    });
    
    console.log(`Channel ${channel}: ${count} tokens (max: ${maxEntries})`);
    this.emit('channel_updated', channel, tokens, count, timestamp);
  }

  /**
   * Handle handshake accepted response
   * @param {Object} data
   */
  handleHandshakeAccepted(data) {
    const { localId, token, timestamp } = data;
    
    if (localId === this.config.localIdentifier) {
      console.log(`Handshake accepted by server. Local ID: ${localId}, Token: ${token}`);
      this.emit('handshake_accepted', { localId, token, timestamp });
      
      // Mark handshake as completed
      this.pendingReconnect = false;
    } else {
      console.warn(`Handshake accepted for different local ID: ${localId} (expected: ${this.config.localIdentifier})`);
    }
  }

  /**
   * Handle error response from server
   * @param {Object} data
   */
  handleErrorResponse(data) {
    const { error } = data;
    console.error(`Server error: ${error}`);
    this.emit('error', { type: 'server_error', error });
  }

  /**
   * Handle WebSocket close event
   * @param {CloseEvent} event 
   */
  handleClose(event) {
    console.log(`WebSocket disconnected: ${event.code} ${event.reason || 'No reason'}`);
    this.isConnected = false;
    this.token = null;
    
    // Clear active connections on disconnect
    const disconnectedTokens = Array.from(this.activeConnections.keys());
    this.activeConnections.clear();
    
    this.emit('disconnect', {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
      disconnectedTokens
    });
    
    // Attempt reconnection if enabled and not a normal closure
    if (this.config.autoReconnect && event.code !== 1000) {
      this.attemptReconnection();
    }
  }

  /**
   * Handle WebSocket error event
   * @param {Event} error 
   */
  handleError(error) {
    console.error('WebSocket error:', error);
    this.emit('error', { type: 'connection_error', error });
  }

  /**
   * Attempt to reconnect to the server
   */
  attemptReconnection() {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      this.emit('reconnect_failed', this.reconnectAttempts);
      return;
    }
    
    this.reconnectAttempts++;
    console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts} in ${this.config.reconnectDelay}ms`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
        this.attemptReconnection();
      });
    }, this.config.reconnectDelay);
    
    this.emit('reconnecting', this.reconnectAttempts, this.config.maxReconnectAttempts);
  }

  /**
   * Send a message to one or more targets
   * @param {string|string[]} to Target token(s)
   * @param {string} message Message content
   * @returns {Promise<void>}
   */
  send(to, message) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      
      if (!this.token) {
        reject(new Error('No token assigned yet'));
        return;
      }
      
      const targetTokens = Array.isArray(to) ? to : [to];
      
      if (targetTokens.length === 0) {
        reject(new Error('No target tokens specified'));
        return;
      }
      
      // Check if sending to self
      if (targetTokens.includes(this.token)) {
        reject(new Error('Cannot send message to yourself'));
        return;
      }
      
      const payload = {
        to: targetTokens,
        message: message
      };
      
      try {
        this.ws.send(JSON.stringify(payload));
        console.log(`Message sent to ${targetTokens.length} target(s): ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
        
        // Add to active connections for each target
        targetTokens.forEach(token => {
          if (!this.activeConnections.has(token)) {
            this.activeConnections.set(token, {
              connectedAt: Date.now(),
              lastMessage: null,
              messageCount: 0
            });
            this.emit('paired', token);
          }
        });
        
        resolve();
      } catch (error) {
        console.error('Error sending message:', error);
        reject(error);
      }
    });
  }

  /**
   * Manually disconnect from a specific client
   * @param {string} target Target token
   * @returns {Promise<void>}
   */
  disconnectFrom(target) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      
      if (!this.token) {
        reject(new Error('No token assigned yet'));
        return;
      }
      
      if (target === this.token) {
        reject(new Error('Cannot disconnect from yourself'));
        return;
      }
      
      const payload = {
        type: 'disconnect',
        target: target
      };
      
      try {
        this.ws.send(JSON.stringify(payload));
        console.log(`Disconnect request sent to ${target}`);
        resolve();
      } catch (error) {
        console.error('Error sending disconnect request:', error);
        reject(error);
      }
    });
  }

  /**
   * Publish to a public channel
   * @param {string} channel Channel name
   * @returns {Promise<void>}
   */
  publish(channel) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      
      if (!this.token) {
        reject(new Error('No token assigned yet'));
        return;
      }
      
      const payload = {
        type: 'publish',
        channel: channel
      };
      
      try {
        this.ws.send(JSON.stringify(payload));
        console.log(`Published to channel: ${channel}`);
        resolve();
      } catch (error) {
        console.error('Error publishing to channel:', error);
        reject(error);
      }
    });
  }

  /**
   * List tokens in a public channel
   * @param {string} channel Channel name
   * @returns {Promise<string[]>} Array of tokens in the channel
   */
  listChannel(channel) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      
      const payload = {
        type: 'list',
        channel: channel
      };
      
      // Set up one-time handler for the response
      const handler = (data) => {
        if (data.channel === channel) {
          this.off('channel_updated', handler);
          resolve(data.tokens || []);
        }
      };
      
      this.on('channel_updated', handler);
      
      // Set timeout for response
      setTimeout(() => {
        this.off('channel_updated', handler);
        reject(new Error(`Timeout waiting for channel list: ${channel}`));
      }, 5000);
      
      try {
        this.ws.send(JSON.stringify(payload));
        console.log(`Requested list for channel: ${channel}`);
      } catch (error) {
        this.off('channel_updated', handler);
        console.error('Error requesting channel list:', error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    // Clear reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Close WebSocket connection
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    // Reset state
    this.isConnected = false;
    this.token = null;
    this.reconnectAttempts = 0;
    this.activeConnections.clear();
    
    console.log('Disconnected from server');
  }

  /**
   * Get current token
   * @returns {string|null} Current token or null if not connected
   */
  getToken() {
    return this.token;
  }

  /**
   * Get local identifier
   * @returns {string} Local identifier
   */
  getLocalIdentifier() {
    return this.config.localIdentifier;
  }

  /**
   * Get active connections
   * @returns {Map<string, Object>} Map of active connections
   */
  getActiveConnections() {
    return new Map(this.activeConnections);
  }

  /**
   * Check if connected to a specific token
   * @param {string} token Token to check
   * @returns {boolean} True if connected
   */
  hasConnection(token) {
    return this.activeConnections.has(token);
  }

  /**
   * Get channel information
   * @param {string} channel Channel name
   * @returns {Object|null} Channel information or null if not subscribed
   */
  getChannelInfo(channel) {
    return this.channelSubscriptions.get(channel) || null;
  }

  // Event system methods

  /**
   * Register an event handler
   * @param {string} event Event name
   * @param {Function} handler Event handler function
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  /**
   * Remove an event handler
   * @param {string} event Event name
   * @param {Function} handler Event handler function to remove
   */
  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event
   * @param {string} event Event name
   * @param {...any} args Event arguments
   * @private
   */
  emit(event, ...args) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event);
      handlers.forEach(handler => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in event handler for "${event}":`, error);
        }
      });
    }
  }
}

/**
 * Create and return a singleton instance of WebSocketProxyClient
 * @param {Object} options Configuration options
 * @returns {WebSocketProxyClient} Singleton instance
 */
export function createWebSocketProxyClient(options = {}) {
  let instance = null;
  
  return () => {
    if (!instance) {
      instance = new WebSocketProxyClient(options);
    }
    return instance;
  };
}

/**
 * Default singleton instance getter
 */
export const getWebSocketProxyClient = createWebSocketProxyClient();
