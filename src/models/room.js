const { Schema, model } = require('mongoose');

const Player = new Schema({
    admin: {
        type: Boolean,
        required: true
    },
    id: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    reads: {
        type: Boolean,
        required: true
    },
    score: {
        type: Number,
        required: true
    },
    cards: {
        type: [Number],
        default: undefined
    }
});

const schema = new Schema({
    blackCards: {
        type: [Number],
        default: undefined,
        required: false
    },
    currentBlackCard: {
        type: Number,
        default: undefined,
        required: false
    },
    gameOver: {
        type: Boolean,
        default: false,
        required: true
    },
    gameStarted: {
        type: Boolean,
        default: false,
        required: true
    },
    players: {
        type: [Player]
    },
    readerId: {
        type: String,
        required: false
    },
    roomId: {
        type: String,
        required: true
    },
    round: {
        type: Number,
        required: true
    },
    whiteCards: {
        type: [Number],
        default: undefined,
        required: false
    },
})

module.exports = model('room', schema)