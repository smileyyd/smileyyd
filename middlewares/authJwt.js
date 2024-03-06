const config = require('../config')
const db = require('../models')
const User = db.user


const authJwt = async (req, res, next) => {
    try {
        const token = req.headers.authorization
        const user = await User.findOne({uuid: token})

        if (!user) return res.status(404).json({ message: 'User not found' })

        req.user = user

        next()
    } catch (error) {
        console.log( error )
        res.status(401).json({ message: 'Invalid token' })
    }
}

module.exports = authJwt