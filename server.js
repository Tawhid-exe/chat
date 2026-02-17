const { PeerServer } = require('peer');
const express = require('express');

const app = express();

// Health check route so Render knows the server is alive
app.get('/', (req, res) => res.send('DonkeyChat signaling server is running 🫏'));

// Mount PeerJS on /peerjs path
const server = app.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
});

const peerServer = PeerServer({
    server,
    path: '/peerjs',
    allow_discovery: false,
});

peerServer.on('connection', (client) => {
    console.log('Peer connected:', client.getId());
});

peerServer.on('disconnect', (client) => {
    console.log('Peer disconnected:', client.getId());
});
