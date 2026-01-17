const { io } = require('socket.io-client');

const socket = io('http://localhost:3000');

socket.on('price-update', (data) => {
  console.log('📈 Price Update:', data);
});
