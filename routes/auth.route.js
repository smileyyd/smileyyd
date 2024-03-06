const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')


const authJwt = require('../middlewares/authJwt')
const config = require('../config')
const db = require("../models")
const User = db.user


function generateUUID() {
    var d = new Date().getTime();
    if (typeof performance !== 'undefined' && typeof performance.now === 'function'){
        d += performance.now(); // use high-precision timer if available
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function validateUsername(username) {
    if (!username) return false
    
    if (username.length < 2) return false
  
    return true
}

function validatePassword(password) {
    if (!password) return false

    if (password.length < 2) return false

    return true
}

router.post('/signin', async (req, res) => {
    try {
        const { username, password } = req.body

        const user = await User.findOne({username})

        if (!user) throw new Error('Invalid username or password')
        
        const isMatch = await bcrypt.compare(password, user.password)
        if (!isMatch) throw new Error('Invalid username or password')

        res.status(200).json({ token: user.uuid })
    } catch (err) {
        res.status(401).json({ message: err.message })
    }
})

router.post('/signup', async (req, res) => {
    try {
        const { username, password } = req.body

        const usernameValidated = validateUsername(username)
        if( !usernameValidated ) return res.status(400).send({ message: "Username is not valid.", username: true })

        const usernameRegistered = await User.findOne({ username: username })
        if( usernameRegistered ) return res.status(400).send({ message: "Username is already registered.", username: true })

        if( !validatePassword(password) ) return res.status(400).send({ message: "Your password is weak.", password: true })

        let uuid = ''
        let uuidExists = true
        while (uuidExists) {
            uuid = generateUUID()
            const existingUser = await User.findOne({ uuid })
            uuidExists = !!existingUser
        }

        const hashedPassword = await bcrypt.hash(password, 10)
        const user = await User.create({
            username,
            password: hashedPassword,
            uuid
        })
        
        res.json({ message: 'User created successfully', token: uuid })
    } catch (err) {
        console.error(err.message)
        res.status(500).json({ error: err.message })
    }
})

router.get( '/user', authJwt, async (req, res) => {
    try {
        res.status(200).json(req.user)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.get( '/priv', authJwt, async (req, res) => {
    try {
        res.status(200).json(req.user.adminAccess ? 1 : 0)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

module.exports = router