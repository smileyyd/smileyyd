function sendToAllUserIds(io, userIds = [], event, data) {
    try {
        io.sockets.sockets.forEach( socket => {
            if (socket.decoded && userIds.includes(socket.decoded._id.toString())) {
                socket.emit(event, data)
            }
        })
    } catch (error) {
        console.error(error.message)
    }
}

module.exports = {
    sendToAllUserIds
}