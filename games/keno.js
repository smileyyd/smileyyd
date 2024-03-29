const db = require("../models")
const User = db.user
const Games = db.games

const { updateUserStats } = require("../middlewares/extras")

const currenciesDb = require('../currenciesDb.json')
const kenoPayoutsDb = require('../kenoPayoutsDb.json')

const createKenoBet = async (req, res) => {
    try {
        const user = req.user

        const { variables } = req.body
        if(!variables || typeof variables !== 'object') return res.status(400).json({ message: 'Invalid request data' })

        const { currency, amount, numbers, risk, identifier } = variables

        if( !['classic', 'low', 'medium', 'high'].includes(risk) || !Array.isArray(numbers) ) return res.status(400).json({ message: 'Invalid request data' })

        if( numbers.length > 10 || numbers.length < 1 ) return res.status(400).json({ message: 'Invalid request data' })
        if( Array.from(new Set(numbers)).length !== numbers.length  ) return res.status(400).json({ message: 'Invalid request data' })
        if( !numbers.every(num => typeof num === 'number' && num >= 0 && num <= 39) ) return res.status(400).json({ message: 'Invalid request data' })

        if( isNaN(amount) ) return res.status(400).json({ message: 'Invalid request data' })

        const foundCoin = currenciesDb.find( c => c.symbol === currency )
        if( !foundCoin ) return res.status(400).json({ message: 'Currency not supported' })

        if( !user?.wallet?.[currency] ) return res.status(400).json({ message: 'Currency not supported' })

        const formattedValue = parseFloat(amount).toFixed(foundCoin.dicimals)
        const formattedUmValue = parseFloat(user.wallet[currency].value).toFixed(foundCoin.dicimals)

        if( Number(formattedValue) < 0 ) return res.status(400).json({ message: 'Insufficient amount' })
        if( Number(formattedUmValue) < Number(formattedValue) ) return res.status(400).json({ message: 'Insufficient amount' })


        const drawnNumbers = []

        Array(10).fill(0).forEach( () => {
            let randomIndex
            let isEmpty = false
            while(!isEmpty) {
                randomIndex = Math.floor(Math.random() * 40)
                const foundRound = drawnNumbers.includes(randomIndex)
                if( !foundRound ) isEmpty = true
            }

            drawnNumbers.push(randomIndex)
        } )


        const matchedNumbers = []
        drawnNumbers.forEach( num => {
            if( numbers.includes( num ) ) matchedNumbers.push(num)
        } )

        const payoutMultiplier = kenoPayoutsDb[risk][numbers.length+1][matchedNumbers.length]

        let newStatisticScoped = {
            wins: 0,
            losses: 0,
            ties: 0,
            betAmount: Number(formattedValue),
            bets: 1
        }

        let resultPayout
        let newAmount
        if( payoutMultiplier > 1 ) {
            resultPayout = Number(formattedValue) * Number(payoutMultiplier)
            newAmount = parseFloat( Number(formattedUmValue) + (Number(formattedValue) * Number(payoutMultiplier) - Number(formattedValue)) ).toFixed(foundCoin.dicimals)

            newStatisticScoped.wins++
        } else if ( payoutMultiplier === 1 ) {
            resultPayout = 0
            newAmount = parseFloat( Number(formattedUmValue) ).toFixed(foundCoin.dicimals)

            newStatisticScoped.ties++
        } else if ( payoutMultiplier < 1 && payoutMultiplier > 0 ) {
            resultPayout = 0

            newAmount = parseFloat( (Number(formattedUmValue) - Number(formattedValue)) + (Number(formattedValue) * Number(payoutMultiplier)) ).toFixed(foundCoin.dicimals)
            
            newStatisticScoped.losses++
        } else if ( payoutMultiplier === 0 ) {
            resultPayout = 0
            if( Number(formattedUmValue) < Number(formattedValue) ) {
                newAmount = parseFloat( 0 ).toFixed(foundCoin.dicimals)
            } else {
                newAmount = parseFloat( Number(formattedUmValue) - Number(formattedValue) ).toFixed(foundCoin.dicimals)
            }

            newStatisticScoped.losses++
        }

        const newGame = await Games.create({
            active: false,
            amount,
            currency,
            game: 'keno',
            user: user._id,
            payout: resultPayout,
            payoutMultiplier: payoutMultiplier,
            state: {
                drawnNumbers: drawnNumbers,
                risk: risk,
                selectedNumbers: numbers
            }
        })



        const newUser = await updateUserStats(user, newStatisticScoped, newAmount, currency)


        const populatedGame = await Games.findById(newGame._id)
            .populate('user', 'username')
            .select('active amount payout payoutMultiplier currency game state createdAt')

        res.status(200).json(populatedGame)
    } catch ( err ) {
        console.error( err )
        res.status(500).json({ message: 'Internal server error' })
    }
}

module.exports = {
    createKenoBet
}