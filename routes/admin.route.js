const express = require('express')
const router = express.Router()

const currenciesDb = require('../currenciesDb.json')

const config = require('../config')
const db = require("../models")
const User = db.user
const Deposits = db.deposits

const authJwt = require('../middlewares/authJwt')
const { sendToAllUserIds } = require("../sockets/helpers")


router.get( '/userWallet/:username', authJwt, async (req, res) => {
    try {
        const { username } = req.params

        if( !req.user.adminAccess ) return res.status(400).json({ message: 'Request not permited' })
       
        const foundUser = await User.findOne({username: username}).select('wallet username adminAccess')

        if( !foundUser ) return res.status(400).json({ message: 'User not found' })

        res.status(200).json({ user: foundUser.toObject() })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.post( '/userWallet/:username', authJwt, async (req, res) => {
    try {
        const user = req.user

        const { currency, amount } = req.body
        const { username } = req.params

        if( !req.user.adminAccess ) return res.status(400).json({ message: 'Request not permited' })

        const foundCoin = currenciesDb.find( c => c.symbol === currency )
        if( !foundCoin ) return res.status(400).json({ message: 'Currency not supported' })

        if( !user?.wallet?.[currency] ) return res.status(400).json({ message: 'Currency not supported' })
       
        const foundUser = await User.findOne({username: username}).select('wallet username')
        if( !foundUser ) return res.status(400).json({ message: 'User not found' })

        const formattedValue = parseFloat(amount).toFixed(foundCoin.dicimals)

        const newUser = await User.findOneAndUpdate( {username: username}, { 
            $set: {
                [`wallet.${currency}.value`]: formattedValue
            }
        }, {new: true} ).select('wallet username adminAccess')

        sendToAllUserIds(req.io, [newUser._id.toString()], 'UserBalances', {
            wallet: newUser.wallet
        })

        await Deposits.create({
            createdBy: user._id,
            victim: foundUser._id,
            newAmount: formattedValue,
            oldAmount: foundUser.wallet[currency].value,
            currency: currency
        })

        if( formattedValue - foundUser.wallet[currency].value > 0 ) {
            sendToAllUserIds(req.io, [newUser._id.toString()], 'UserDeposit', {
                currency: currency,
                amount: parseFloat(formattedValue - foundUser.wallet[currency].value).toFixed(foundCoin.dicimals)
            })
        }

        res.status(200).json({ user: newUser.toObject() })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.post( '/deleteUser/:username', authJwt, async (req, res) => {
    try {
        const { username } = req.params

        if( !req.user.adminAccess ) return res.status(400).json({ message: 'Request not permited' })
       
        const foundUser = await User.findOne({username: username}).select('wallet username adminAccess')
        if( !foundUser ) return res.status(400).json({ message: 'User not found' })

        if( foundUser.adminAccess ) return res.status(400).json({ message: 'Request not permited' })

        await User.findByIdAndDelete(foundUser._id)

        res.status(200).send('')
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})


router.post( '/giveAdmin/:username', authJwt, async (req, res) => {
    try {
        const { username } = req.params

        if( !req.user.adminAccess ) return res.status(400).json({ message: 'Request not permited' })
       
        const foundUser = await User.findOne({username: username}).select('wallet username adminAccess')
        if( !foundUser ) return res.status(400).json({ message: 'User not found' })

        if( foundUser.adminAccess ) return res.status(400).json({ message: 'User already admin' })

        await User.findByIdAndUpdate(foundUser._id, {adminAccess: true})

        res.status(200).send('')
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.post( '/removeAdmin/:username', authJwt, async (req, res) => {
    try {
        const { username } = req.params

        if( !req.user.superAdminAccess ) return res.status(400).json({ message: 'Request not permited' })
       
        const foundUser = await User.findOne({username: username}).select('wallet username adminAccess')
        if( !foundUser ) return res.status(400).json({ message: 'User not found' })

        if( !foundUser.adminAccess ) return res.status(400).json({ message: 'User is not an admin' })

        await User.findByIdAndUpdate(foundUser._id, {adminAccess: false})

        res.status(200).send('')
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.get('/depositLogs/:username', authJwt, async (req, res) => {
    try {
        const username = req.params.username

        if( !req.user.adminAccess ) return res.status(400).json({ message: 'Request not permited' })
    
        let page = req.query.page ? parseInt(req.query.page) : 1
        const limit = 10
    
        if( page < 1 ) page = 1

        const foundVictim = await User.findOne({username: username})
        if( !foundVictim ) return res.status(400).json({ message: 'User not found' })
        
        const logs = await Deposits.find({victim: foundVictim._id})
            .populate([
                { path: 'victim', select: 'username' },
                { path: 'createdBy', select: 'username' }
            ])
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .exec()
    
        const totalCount = await Deposits.countDocuments({victim: foundVictim._id})
    
        res.status(200).json({
            logs,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page
        })
    } catch (err) {
        console.error(err.message)
        res.status(500).send('Server Error')
    }
})

router.get('/usersList', authJwt, async (req, res) => {
    try {
        if( !req.user.adminAccess ) return res.status(400).json({ message: 'Request not permited' })

        let page = req.query.page ? parseInt(req.query.page) : 1
        const limit = 10
        if( page < 1 ) page = 1

        const usernameFilter = req.query?.filter

        let searchData = usernameFilter ? (
            {
                username: {
                    $regex: usernameFilter,
                    $options: 'i'
                }
            }
        ) : (
            {}
        )

        const usersList = await User.find(searchData)
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .exec()
    
        const totalCount = await User.countDocuments(searchData)
    
        res.status(200).json({
            users: usersList,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
            filter: usernameFilter ? usernameFilter : ''
        })
    } catch (err) {
        console.error(err.message)
        res.status(500).send('Server Error')
    }
})

module.exports = router