const config = require('../config')
const db = require("../models")
const User = db.user

module.exports = (io) => {
    console.log(`Connected Sockets.`)
    return ( socket ) => {
        //console.log(`Socket ${socket.id} connected`)

        socket.on('authenticate', async (token) => {
            const user = await User.findOne({uuid: token})
            if (user) {
                //console.log(`User ${decoded.username} authenticated`)
                socket.decoded = user
            } else {
                socket.disconnect()
            }
        })

        socket.on('disconnect', () => {        
            //console.log(`Socket ${socket.id} disconnected`)
        })
    }
}