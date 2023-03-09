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

const cardsPerPlayer = process.env.CARDS_PER_PLAYER;

var room = {};

io.on('connection', (socket) => {

    socket.on('emit-create-room', (data) => {
        room = data;
        socket.join(data.roomId);
    })

    socket.on('emit-join-room', (data) => {
        if (room.players) {
            if (room.players.length < process.env.MAX_PLAYERS_PER_ROOM) {
                socket.join(data.roomId);
                room.players.push(data.player);
                delete data.player.cards;
                socket.nsp.to(data.roomId).emit('receive-new-player', { players: room.players, roomId: data.roomId });
            } else {
                socket.nsp.to(data.player.id).emit('receive-room-is-full', true);
            }
        }
    })

    socket.on('emit-message', (data) => {
        socket.to(data.room).emit('receive-message', data.message)
    })

    socket.on('emit-initial-cards-order', (data) => {
        room.whiteCards = data.whiteCards;
        room.blackCards = data.blackCards;
    })

    socket.on('emit-cards-distribution', () => {
        room.players.forEach(player => {
            const firstCards = room.whiteCards.slice(0, cardsPerPlayer);
            let lastCards = room.whiteCards.slice(cardsPerPlayer, room.whiteCards.length);
            player.cards = firstCards;
            lastCards = lastCards.concat(firstCards);
            room.whiteCards = lastCards;
            socket.nsp.to(player.id).emit('receive-cards-distribution', firstCards);
        });
    })

    socket.on('emit-cards-replacement', () => {
        room.players.forEach(player => {
            if (player.reads === false) {
                const firstCardList = room.whiteCards.slice(0, 1);
                let lastCards = room.whiteCards.slice(1, room.whiteCards.length);
                player.cards = player.cards.concat(firstCardList);
                lastCards = lastCards.concat(firstCardList);
                room.whiteCards = lastCards;
                socket.nsp.to(player.id).emit('receive-cards-replacement', firstCardList);
            }
        });
    })

    socket.on('emit-player-picked-white-card', (data) => {
        socket.nsp.to(room.roomId).emit('receive-player-picked-white-card', { player: data.playerId, pickedCard: data.cardIndex });
    })

    socket.on('emit-winner-gets-one-point', (roundWinnerId) => {
        room.round++
        socket.nsp.to(room.roomId).emit('receive-winner-gets-one-point', roundWinnerId);
    })

    socket.on('emit-current-black-card', (roomId) => {
        const cardIndex = room.blackCards[room.round]
        room.currentBlackCard = cardIndex;
        socket.nsp.to(roomId).emit('receive-current-black-card', cardIndex)
    })

    socket.on('emit-first-turn', () => {
        var rand = Math.floor(Math.random() * room.players.length);
        room.players[rand].reads = true
        socket.nsp.to(room.roomId).emit('receive-first-turn', rand)
    })

    socket.on('emit-next-turn', () => {
        for (let i = 0; i < room.players.length; i++) {
            if (room.players[i].reads === true) {
                room.players[i].reads = false;
                if (room.players.length - 1 === i) {
                    room.players[0].reads = true;
                    room.players.readerId = room.players[0].id
                } else {
                    room.players[i + 1].reads = true;
                    room.players.readerId = room.players[i + 1].id
                }
                break;
            }
        }
        socket.nsp.to(room.roomId).emit('receive-next-turn', null)
    })

    socket.on('disconnecting', () => {
        room.players = room.players?.filter(x => x.id !== socket.id);
        if (room.players?.length > 0) {
            var rand = Math.floor(Math.random() * room.players.length)
            room.players[rand].admin = true;
            socket.to(room.roomId).emit('receive-user-disconnected', { admin: room.players[rand].id, disconnected: socket.id })
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