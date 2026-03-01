/**
 * Test script for WebSocketProxyClient
 * 
 * Run this test to verify the WebSocket proxy client library works correctly.
 * Make sure the proxy server is running on ws://localhost:4001
 */

import { WebSocketProxyClient } from '../services/WebSocketProxyClient.js';

console.log('=== WebSocketProxyClient Test ===\n');

// Create client instance
const client = new WebSocketProxyClient({
  url: 'ws://localhost:4001',
  autoReconnect: true,
  maxReconnectAttempts: 3,
  reconnectDelay: 2000
});

// Set up event handlers
client.on('connect', (localId) => {
  console.log(`✅ Connected with local ID: ${localId}`);
});

client.on('token_assigned', (token) => {
  console.log(`✅ Token assigned: ${token}`);
});

client.on('message', (from, message, timestamp) => {
  console.log(`✅ Message from ${from}: ${message} (${timestamp})`);
});

client.on('paired', (token) => {
  console.log(`✅ Paired with ${token}`);
});

client.on('unpaired', (token, timestamp) => {
  console.log(`✅ Unpaired from ${token} at ${timestamp}`);
});

client.on('peer_disconnected', (token, timestamp) => {
  console.log(`✅ Peer disconnected: ${token} at ${timestamp}`);
});

client.on('disconnect', (data) => {
  console.log(`✅ Disconnected: ${data.reason || 'No reason'} (code: ${data.code})`);
});

client.on('error', (error) => {
  console.error(`❌ Error: ${error.type} - ${error.error || 'Unknown error'}`);
});

client.on('published', (channel, timestamp) => {
  console.log(`✅ Published to channel ${channel} at ${timestamp}`);
});

client.on('channel_updated', (channel, tokens, count, timestamp) => {
  console.log(`✅ Channel ${channel} updated: ${count} tokens at ${timestamp}`);
  console.log(`   Tokens: ${tokens.join(', ')}`);
});

// Run tests
async function runTests() {
  try {
    console.log('1. Connecting to server...');
    await client.connect();
    
    // Wait a bit for token assignment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const token = client.getToken();
    if (!token) {
      throw new Error('No token assigned after connection');
    }
    
    console.log(`2. Current token: ${token}`);
    console.log(`3. Local identifier: ${client.getLocalIdentifier()}`);
    
    // Test channel operations
    console.log('4. Testing channel operations...');
    await client.publish('test-channel');
    
    console.log('5. Listing channel tokens...');
    const tokens = await client.listChannel('test-channel');
    console.log(`   Found ${tokens.length} tokens in channel`);
    
    if (tokens.length > 0) {
      console.log('6. Testing message sending...');
      // Try to send a message to the first token in the channel (if not ourselves)
      const targetToken = tokens.find(t => t !== token);
      if (targetToken) {
        await client.send(targetToken, 'Hello from test!');
        console.log(`   Message sent to ${targetToken}`);
      } else {
        console.log('   No other tokens in channel to send message to');
      }
    }
    
    // Test active connections
    console.log('7. Checking active connections...');
    const activeConnections = client.getActiveConnections();
    console.log(`   Active connections: ${activeConnections.size}`);
    
    // Test disconnect from specific client (if we have one)
    if (activeConnections.size > 0) {
      const [firstToken] = activeConnections.keys();
      console.log(`8. Testing disconnect from ${firstToken}...`);
      await client.disconnectFrom(firstToken);
    }
    
    console.log('\n9. All tests completed successfully!');
    console.log('\n=== Test Summary ===');
    console.log(`- Token: ${token}`);
    console.log(`- Local ID: ${client.getLocalIdentifier()}`);
    console.log(`- Active connections: ${client.getActiveConnections().size}`);
    console.log(`- Channel subscriptions: ${client.getChannelInfo('test-channel') ? 'Yes' : 'No'}`);
    
    // Clean up
    console.log('\n10. Disconnecting...');
    client.disconnect();
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    
    // Clean up on error
    client.disconnect();
    process.exit(1);
  }
}

// Check if server is running
console.log('Note: Make sure the WebSocket proxy server is running on ws://localhost:4001');
console.log('Run: cd ../simple-websocket-proxy && node server.js\n');

// Run tests after a short delay
setTimeout(runTests, 2000);