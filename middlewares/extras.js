const db = require("../models")
const User = db.user
const Games = db.games
const Deposits = db.deposits

const currenciesDb = require('../currenciesDb.json')

const createWithdrawal = async (req, res) => {
    try {
        const user = req.user

        const { variables } = req.body
        if(!variables || typeof variables !== 'object') return res.status(400).json({ message: 'Invalid request data' })

        const { address, amount, currency, chain, emailCode } = variables

        const foundCoin = currenciesDb.find( c => c.symbol === currency )
        if( !foundCoin ) return res.status(400).json({ message: 'Currency not supported' })

        if( !user?.wallet?.[currency] ) return res.status(400).json({ message: 'Currency not supported' })

        const formattedValue = parseFloat(amount).toFixed(foundCoin.dicimals)
        const formattedUmValue = parseFloat(user.wallet[currency].value).toFixed(foundCoin.dicimals)
        if( Number(formattedValue) <= 0 ) return res.status(400).json({ message: 'Insufficient amount' })
        if( Number(formattedUmValue) < Number(formattedValue) ) return res.status(400).json({ message: 'Insufficient amount' })

        let newAmount
        if( Number(formattedUmValue) < Number(formattedValue) ) {
            newAmount = parseFloat( 0 ).toFixed(foundCoin.dicimals)
        } else {
            newAmount = parseFloat( Number(formattedUmValue) - Number(formattedValue) ).toFixed(foundCoin.dicimals)
        }

        await User.findOneAndUpdate({_id: user._id}, {
            $set: {
                [`wallet.${currency}.value`]: newAmount
            }
        }, { new: true })

        const populatedUser = await User.findById(user._id)
            .select('wallet username')

        const responseData = {
            amount: Number(formattedValue),
            currency,
            user: populatedUser
        }

        res.status(200).json(responseData)

    } catch ( err ) {
        console.error( err )
        res.status(500).json({ message: 'Internal server error' })
    }
}

const getMyBetsList = async (req, res) => {
    try {
        const user = req.user

        const { variables } = req.body
        if(!variables || typeof variables !== 'object') return res.status(400).json({ message: 'Invalid request data' })
        const { limit } = variables

        const foundBets = await Games.find({user: user._id, active: false})
            .sort({ createdAt: -1 })
            .limit(limit)
            .exec()

        res.status(200).json({ myBets: foundBets })
    } catch ( err ) {
        console.error( err )
        res.status(500).json({ message: 'Internal server error' })
    }
}

const getNotificationsList = async (req, res) => {
    try {
        const user = req.user

        const { variables } = req.body
        if(!variables || typeof variables !== 'object') return res.status(400).json({ message: 'Invalid request data' })
        const { limit } = variables

        const notifications = await Deposits.aggregate([
            {
                $match: {
                    victim: user._id,
                    $expr: { $gt: ["$newAmount", "$oldAmount"] }
                }
            },
            { $sort: { createdAt: -1 } },
            { $limit: limit }
        ])

        res.status(200).json({ notificationList: notifications })
    } catch ( err ) {
        console.error( err )
        res.status(500).json({ message: 'Internal server error' })
    }
}

module.exports = {
    getMyBetsList,
    getNotificationsList,
    createWithdrawal
}