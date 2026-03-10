/**
 * WebSocket Proxy Client
 * 
 * Client library for connecting to the simplified WebSocket proxy server.
 * Features:
 * - Reconnection logic
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
   */
  constructor(options = {}) {
    // Configuration
    this.config = {
      url: options.url || 'ws://localhost:4001',
      autoReconnect: options.autoReconnect !== false,
      maxReconnectAttempts: options.maxReconnectAttempts || 5,
      reconnectDelay: options.reconnectDelay || 3000
    };

    // Connection state
    this.ws = null;
    this.token = null;
    this._isConnected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;

    // Data stores
    this.activeConnections = new Map(); // token -> {metadata}
    this.channelSubscriptions = new Map(); // channel -> {tokens, lastUpdate}
    
    // Event system
    this.eventHandlers = new Map();

    // Bind methods
    this.handleOpen = this.handleOpen.bind(this);
    this.handleMessage = this.handleMessage.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.handleError = this.handleError.bind(this);
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
    this._isConnected = true;
    this.reconnectAttempts = 0;

    this.emit('connect');
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
    console.log(`Connected to server. Token: ${this.token}`);
    
    this.emit('token_assigned', this.token);
  }

  /**
   * Handle incoming message from another client
   * @param {Object} data 
   */
  handleIncomingMessage(data) {
    const { from, message, timestamp } = data;
    
    // Track the sender as an active connection
    if (!this.activeConnections.has(from)) {
      this.activeConnections.set(from, {
        connectedAt: Date.now(),
        lastMessage: timestamp,
        messageCount: 0
      });
    }
    
    const conn = this.activeConnections.get(from);
    conn.lastMessage = timestamp;
    conn.messageCount = (conn.messageCount || 0) + 1;

    // Try to parse as JSON
    let parsedMessage = null;
    try {
      parsedMessage = JSON.parse(message);
    } catch (e) {
      // Not JSON, treat as plain text
    }

    console.log(`Message from ${from}: ${message.substring(0, 60)}`);
    this.emit('message', from, message, timestamp, parsedMessage);
  }

  /**
   * Handle message sent confirmation
   * @param {Object} data 
   */
  handleMessageSent(data) {
    const { sent, total, failed, timestamp } = data;
    
    if (failed && failed.length > 0) {
      console.warn(`Message partial: ${sent}/${total}. Failed: ${failed.join(', ')}`);
      this.emit('message_partial', { sent, total, failed, timestamp });
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
    
    if (this.activeConnections.has(target)) {
      this.activeConnections.delete(target);
    }
    
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
    this._isConnected = false;
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
   * Unpublish from a public channel
   * @param {string} channel Channel name
   * @returns {Promise<void>}
   */
  unpublish(channel) {
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
        type: 'unpublish',
        channel: channel
      };
      
      try {
        this.ws.send(JSON.stringify(payload));
        console.log(`Unpublished from channel: ${channel}`);
        resolve();
      } catch (error) {
        console.error('Error unpublishing from channel:', error);
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
      // emit('channel_updated', channel, tokens, count, timestamp) → args son separados
      const handler = (updatedChannel, tokens) => {
        if (updatedChannel === channel) {
          this.off('channel_updated', handler);
          resolve(tokens || []);
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
    this._isConnected = false;
    this.token = null;
    this.reconnectAttempts = 0;
    this.activeConnections.clear();
    this.channelSubscriptions.clear();
    
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
   * Check if connected to the WebSocket server
   * @returns {boolean} True if connected
   */
  isConnected() {
    return this._isConnected;
  }

  /**
   * Get active connections
   * @returns {Map<string, Object>} Map of active connections
   */
  getActiveConnections() {
    return new Map(this.activeConnections);
  }

  /**
   * Check if a specific token has sent us a message (is a known peer)
   * @param {string} token Token to check
   * @returns {boolean} True if known
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
