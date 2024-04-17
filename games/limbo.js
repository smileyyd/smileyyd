const db = require("../models")
const User = db.user
const Games = db.games

const { sendToAllUserIds } = require("../sockets/helpers")
const currenciesDb = require('../currenciesDb.json')
const { updateUserStats } = require("../middlewares/extras")



function generateRandomNumber(min, max) {
    return Math.random() * (max - min) + min
}

function getRandomWithChances(arr, weights, numValues) {
    if (arr.length !== weights.length) {
        throw new Error("Array length and weights length must be the same.")
    }

    const weightedArr = [];
    for (let i = 0; i < arr.length; i++) {
        for (let j = 0; j < weights[i]; j++) {
            weightedArr.push(arr[i]);
        }
    }

    const result = [];
    for (let i = 0; i < numValues; i++) {
        const randomIndex = Math.floor(Math.random() * weightedArr.length)
        result.push(weightedArr[randomIndex])
    }

    return result
}


function generateRandomMultiplier(targetMultiplier, winningChance) {
    const randomNumber = generateRandomNumber(0, 100)
    
    if( randomNumber > Number(winningChance) ) {
        let result
        const loseRandomNumber = generateRandomNumber(0, 100)
        if( loseRandomNumber < 80 ) {
            let newFakeMultiplier = 3
            if( Number(targetMultiplier) <= 3 ) {
                newFakeMultiplier = Number(targetMultiplier)
            }

            result = generateRandomNumber(1, newFakeMultiplier)
        } else {
            result = generateRandomNumber(1, Number(targetMultiplier))
        }
        
        return result
    } else {
        const maxMultipliersArr = [2, 2.4, 3, 4, 5, 10, 15, 20, 30]
        const maxMultipliersWeights = [270, 250, 235, 225, 220, 210, 80, 20, 2]
        
        const newRandomMaxMultiplier =  getRandomWithChances( maxMultipliersArr, maxMultipliersWeights, 1)[0]

        //const previewsMaxMultiplierIndex = maxMultipliersArr.indexOf(newRandomMaxMultiplier)
        //const previewsMaxMultiplier = maxMultipliersArr[previewsMaxMultiplierIndex-1] || 1

        const result = generateRandomNumber(Number(targetMultiplier), Number(targetMultiplier) * newRandomMaxMultiplier)
        return result
    }
}

const createLimboBet = async (req, res) => {
    try {
        const user = req.user

        const { variables } = req.body
        if(!variables || typeof variables !== 'object') return res.status(400).json({ message: 'Invalid request data' })

        const { currency, amount, multiplierTarget, identifier } = variables

        if( isNaN(amount) ) return res.status(400).json({ message: 'Invalid request data' })

        const foundCoin = currenciesDb.find( c => c.symbol === currency )
        if( !foundCoin ) return res.status(400).json({ message: 'Currency not supported' })

        if( !user?.wallet?.[currency] ) return res.status(400).json({ message: 'Currency not supported' })

        if( Number(multiplierTarget) < 1.01 ) res.status(400).json({ message: 'Minimum is "1.01"' })
        if( Number(multiplierTarget) > 1000000 ) res.status(400).json({ message: 'Maximum is "1000000"' })
        
        const formattedValue = parseFloat(amount).toFixed(foundCoin.dicimals)
        const formattedUmValue = parseFloat(user.wallet[currency].value).toFixed(foundCoin.dicimals)

        if( Number(formattedValue) < 0 ) return res.status(400).json({ message: 'Insufficient amount' })
        if( Number(formattedUmValue) < Number(formattedValue) ) return res.status(400).json({ message: 'Insufficient amount' })

        const calcWinChance = 99 / Number(multiplierTarget)
        const newWinChance = parseFloat(calcWinChance).toFixed(8)

        const gameResult = generateRandomMultiplier(multiplierTarget, newWinChance)

        let newStatisticScoped = {
            wins: 0,
            losses: 0,
            ties: 0,
            betAmount: Number(formattedValue),
            bets: 1
        }
        
        let resultPayoutMultiplier
        let resultPayout
        let newAmount
        if( gameResult > Number(multiplierTarget) ) {
            newStatisticScoped.wins++

            resultPayoutMultiplier = multiplierTarget
            resultPayout = Number(formattedValue) * Number(multiplierTarget)
            newAmount = parseFloat( Number(formattedUmValue) + (Number(formattedValue) * Number(multiplierTarget) - Number(formattedValue)) ).toFixed(foundCoin.dicimals)
        } else {
            newStatisticScoped.losses++

            resultPayoutMultiplier = 0
            resultPayout = 0
            if( Number(formattedUmValue) < Number(formattedValue) ) {
                newAmount = parseFloat( 0 ).toFixed(foundCoin.dicimals)
            } else {
                newAmount = parseFloat( Number(formattedUmValue) - Number(formattedValue) ).toFixed(foundCoin.dicimals)
            }
        }

        const newGame = await Games.create({
            active: false,
            amount,
            currency,
            game: 'limbo',
            user: user._id,
            payout: resultPayout,
            payoutMultiplier: resultPayoutMultiplier,
            state: {
                multiplierTarget: multiplierTarget,
                result: gameResult
            }
        })


        //const newUser = await User.findOneAndUpdate({_id: user._id}, { $set: { [`wallet.${currency}.value`]: newAmount } }, { new: true })

        const newUser = await updateUserStats(user, newStatisticScoped, newAmount, currency)

        /*sendToAllUserIds(req.io, [newUser._id.toString()], 'UserBalances', {
            wallet: newUser.wallet
        })*/

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
    createLimboBet
}