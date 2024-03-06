const db = require("../models")
const User = db.user

const bcrypt = require('bcrypt')

const currenciesDb = require('../currenciesDb.json')

const createVaultDeposit = async (req, res) => {
    try {
        const user = req.user

        const { variables } = req.body
        if(!variables || typeof variables !== 'object') return res.status(400).json({ message: 'Invalid request data' })
        const { currency, amount } = variables

        const foundCoin = currenciesDb.find( c => c.symbol === currency )
        if( !foundCoin ) return res.status(400).json({ message: 'Currency not supported' })

        if( !user?.wallet?.[currency] ) return res.status(400).json({ message: 'Currency not supported' })

        const formattedValue = parseFloat(amount).toFixed(foundCoin.dicimals)
        const formattedUmValue = parseFloat(user.wallet[currency].value).toFixed(foundCoin.dicimals)
        if( Number(formattedValue) === 0 ) return res.status(400).json({ message: 'Insufficient amount' })
        if( Number(formattedUmValue) < Number(formattedValue) ) return res.status(400).json({ message: 'Insufficient amount' })

        let toRemoveAmount
        if( Number(formattedUmValue) < Number(formattedValue) ) toRemoveAmount = Number(formattedUmValue)
            else toRemoveAmount = Number(formattedValue)

        await User.findOneAndUpdate({_id: user._id}, {
            $inc: {
                [`wallet.${currency}.value`]: -toRemoveAmount,
                [`wallet.${currency}.vault`]: toRemoveAmount,
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

const createVaultWithdraw = async (req, res) => {
    try {
        const user = req.user

        const { variables } = req.body
        if(!variables || typeof variables !== 'object') return res.status(400).json({ message: 'Invalid request data' })
        const { currency, amount, password } = variables

        if( !password || typeof password !== 'string' ) return res.status(400).json({ message: 'Invalid password' })

        const isMatch = await bcrypt.compare(password, user.password)
        if (!isMatch) return res.status(400).json({ message: 'Invalid password' })

        const foundCoin = currenciesDb.find( c => c.symbol === currency )
        if( !foundCoin ) return res.status(400).json({ message: 'Currency not supported' })

        if( !user?.wallet?.[currency] ) return res.status(400).json({ message: 'Currency not supported' })

        const formattedValue = parseFloat(amount).toFixed(foundCoin.dicimals)
        const formattedUmValue = parseFloat(user.wallet[currency].vault).toFixed(foundCoin.dicimals)
        if( Number(formattedValue) === 0 ) return res.status(400).json({ message: 'Insufficient amount' })
        if( Number(formattedUmValue) < Number(formattedValue) ) return res.status(400).json({ message: 'Insufficient amount' })

        let toRemoveAmount
        if( Number(formattedUmValue) < Number(formattedValue) ) toRemoveAmount = Number(formattedUmValue)
            else toRemoveAmount = Number(formattedValue)

        await User.findOneAndUpdate({_id: user._id}, {
            $inc: {
                [`wallet.${currency}.value`]: toRemoveAmount,
                [`wallet.${currency}.vault`]: -toRemoveAmount,
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


module.exports = {
    createVaultDeposit,
    createVaultWithdraw
}