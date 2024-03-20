const mongoose = require('mongoose')

const gamesSchema = new mongoose.Schema({
    active: {
        type: Boolean,
        default: true
    },
    game: {
        type: String,
        enum: ['mines', 'limbo']
    },
    amount: {
        type: String,
        default: '0.00000000'
    },
    payout: {
        type: Number,
        default: 0
    },
    payoutMultiplier: {
        type: Number,
        default: 0
    },
    currency: {
        type: String,
        default: 'btc'
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    state: {
        type: Object,
    },
    minesMap: {
        type: Array,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    }
})

const Games = mongoose.model('Games', gamesSchema)

module.exports = Games