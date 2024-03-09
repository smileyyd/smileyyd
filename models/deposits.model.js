const mongoose = require('mongoose')

const depositsSchema = new mongoose.Schema({
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    victim: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    newAmount: Number,
    oldAmount: Number,
    currency: String,
    createdAt: {
        type: Date,
        default: Date.now,
    }
})

const Deposits = mongoose.model('deposits', depositsSchema)

module.exports = Deposits