const mongoose = require('mongoose')

const withdrawalsSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    amount: Number,
    currency: String,
    createdAt: {
        type: Date,
        default: Date.now,
    }
})

const Withdrawals = mongoose.model('withdrawals', withdrawalsSchema)

module.exports = Withdrawals