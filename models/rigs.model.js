const mongoose = require('mongoose')

const rigsSchema = new mongoose.Schema({
    coinFlipChance: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now,
    }
})

const Rigs = mongoose.model('Rigs', rigsSchema)

module.exports = Rigs