const config = require('../config')
const mongoose = require('mongoose')

const db = {}

db.mongoose = mongoose

db.user = require("./user.model")
db.games = require("./games.model")
db.deposits = require("./deposits.model")
db.rigs = require("./rigs.model")

module.exports = db