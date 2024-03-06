const config = require('../config')
const mongoose = require('mongoose')

const db = {}

db.mongoose = mongoose

db.user = require("./user.model")
db.games = require("./games.model")

module.exports = db