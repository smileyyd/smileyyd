const mongoose = require('mongoose')

const templateSchema = new mongoose.Schema({
    createdAt: {
        type: Date,
        default: Date.now,
    }
})

const Template = mongoose.model('Template', templateSchema)

module.exports = Template