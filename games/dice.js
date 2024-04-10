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


function generateRandomMultiplier(target, winningChance, condition) {
    const randomNumber = generateRandomNumber(0, 100)

    if( randomNumber < Number(winningChance) ) {
        let result
        if( condition === "above" ) {
            result = generateRandomNumber(Number(target), 100)
        } else {
            result = generateRandomNumber(0.01, Number(target))
        }
        
        return result
    } else {
        let result

        if( condition === "above" ) {
            result = generateRandomNumber(0.01, Number(target))
        } else {
            result = generateRandomNumber(Number(target), 100)
        }

        return result
    }
}

const createDiceRoll = async (req, res) => {
    try {
        const user = req.user

        const { variables } = req.body
        if(!variables || typeof variables !== 'object') return res.status(400).json({ message: 'Invalid request data' })

        const { condition, currency, amount, target, identifier } = variables

        if( isNaN(amount) ) return res.status(400).json({ message: 'Invalid request data' })

        const foundCoin = currenciesDb.find( c => c.symbol === currency )
        if( !foundCoin ) return res.status(400).json({ message: 'Currency not supported' })

        if( !user?.wallet?.[currency] ) return res.status(400).json({ message: 'Currency not supported' })

        if ( !["above", "below"].includes(condition) ) return res.status(400).json({ message: 'Invalid request data' })

        if( Number(target) < 0.01 ) res.status(400).json({ message: 'Minimum is "0.01"' })
        if( Number(target) > 99 ) res.status(400).json({ message: 'Maximum is "99"' })
        
        const formattedValue = parseFloat(amount).toFixed(foundCoin.dicimals)
        const formattedUmValue = parseFloat(user.wallet[currency].value).toFixed(foundCoin.dicimals)

        if( Number(formattedValue) < 0 ) return res.status(400).json({ message: 'Insufficient amount' })

        if( Number(formattedUmValue) < Number(formattedValue) ) return res.status(400).json({ message: 'Insufficient amount' })

        const calcWinChance = condition === "above" ? (
            100 - Number(target)
        ) : (
            Number(target)
        )

        const multiplier = parseFloat(100 * (1 - 0.01) / Number(calcWinChance)).toFixed(4)

        const newWinChance = parseFloat(calcWinChance).toFixed(4)

        const gameResult = generateRandomMultiplier(target, newWinChance, condition)

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
        if( gameResult > Number(target) ) {
            if( condition === "above" ) {
                newStatisticScoped.wins++

                resultPayoutMultiplier = Number(multiplier)
                resultPayout = Number(formattedValue) * Number(multiplier)
                newAmount = parseFloat( Number(formattedUmValue) + (Number(formattedValue) * Number(multiplier) - Number(formattedValue)) ).toFixed(foundCoin.dicimals)
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
        } else {
            if( condition === "above" ) {
                newStatisticScoped.losses++

                resultPayoutMultiplier = 0
                resultPayout = 0
                if( Number(formattedUmValue) < Number(formattedValue) ) {
                    newAmount = parseFloat( 0 ).toFixed(foundCoin.dicimals)
                } else {
                    newAmount = parseFloat( Number(formattedUmValue) - Number(formattedValue) ).toFixed(foundCoin.dicimals)
                }
            } else {
                newStatisticScoped.wins++

                resultPayoutMultiplier = Number(multiplier)
                resultPayout = Number(formattedValue) * Number(multiplier)
                newAmount = parseFloat( Number(formattedUmValue) + (Number(formattedValue) * Number(multiplier) - Number(formattedValue)) ).toFixed(foundCoin.dicimals)
            }
        }

        const newGame = await Games.create({
            active: false,
            amount,
            currency,
            game: 'dice',
            user: user._id,
            payout: resultPayout,
            payoutMultiplier: resultPayoutMultiplier,
            state: {
                condition,
                target,
                result: gameResult
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
    createDiceRoll
}