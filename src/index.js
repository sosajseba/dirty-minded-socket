const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

app.use(cors());

const io = new Server(server, {
    cors: {
        origin: 'http://localhost:3000',
        methods: ['GET', 'POST']
    }
})

var room = {};

io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`)

    socket.on('create-room', (data) => {
        room = data;
        socket.join(data.roomId);
    })

    socket.on('update-room', (data) => {
        room = data;
        console.log(room)
        socket.nsp.to(data.roomId).emit('room-updated', room);
    })

    socket.on('join-room', (data) => {
        if (room.players) {
            if (room.players.length < 3) //TODO: move max players to an env variable
            {
                socket.join(data.roomId);
                room.players.push(data.player);
                socket.nsp.to(data.roomId).emit('new-player', room);
            } else {
                socket.nsp.to(data.player.id).emit('room-is-full', true);
            }
        }
    })

    socket.on('send', (data) => {
        socket.to(data.room).emit('receive', data.message)
    })
})

server.listen(3001, () => {
    console.log('Server is running on port 3001')
})