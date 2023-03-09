const { instrument } = require('@socket.io/admin-ui')
const dotenv = require('dotenv')
dotenv.config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);

app.use(cors());

app.get('/health', (req, res) => {
    res.send('Server is up!');
});

const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGINS.split(','),
        methods: ['GET', 'POST'],
        credentials: true
    }
})

var room = {};

io.on('connection', (socket) => {
    socket.on('create-room', (data) => {
        room = data;
        socket.join(data.roomId);
    })

    socket.on('update-room', (data) => {
        room = data;
        socket.nsp.to(data.roomId).emit('room-updated', room);
    })

    socket.on('join-room', (data) => {
        if (room.players) {
            if (room.players.length < process.env.MAX_PLAYERS_PER_ROOM) {
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

    socket.on('disconnecting', () => {
        room.players = room.players?.filter(x => x.id !== socket.id);
        if (room.players?.length > 0) {
            room.players[Math.floor(Math.random() * room.players.length)].admin = true;
            socket.to(room.roomId).emit('user-disconnected', room.players)
        }
    });
})

instrument(io, {
    auth: {
        type: "basic",
        username: process.env.ADMIN_UI_USER,
        password: bcrypt.hashSync(process.env.ADMIN_UI_PASS, 10)
    }
})

server.listen(process.env.PORT, () => {
    console.log('Server is running on port ' + process.env.PORT)
})