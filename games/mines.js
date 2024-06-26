const db = require("../models")
const User = db.user
const Games = db.games

const minesWinRates = require('../minesWinRate.json')
const currenciesDb = require('../currenciesDb.json')
const { sendToAllUserIds } = require("../sockets/helpers")
const { updateUserStats } = require("../middlewares/extras")


function createMinesweeperArray(minesCount) {
    let array = Array(25).fill(0)
    
    for (let i = 0; i < minesCount; i++) {
        let randomIndex = Math.floor(Math.random() * 25)
        while (array[randomIndex] !== 0) {
            randomIndex = Math.floor(Math.random() * 25)
        }
        array[randomIndex] = 1
    }
    
    return array
}

const createMinesBet = async (req, res) => {
    try {
        const user = req.user

        const foundGame = await Games.findOne({game: 'mines', user: user._id, active: true})
        if(foundGame) return res.status(400).json({ message: 'already playing' })

        const { variables } = req.body
        if(!variables || typeof variables !== 'object') return res.status(400).json({ message: 'Invalid request data' })

        const { currency, amount, minesCount } = variables

        if( isNaN(minesCount) || minesCount > 24 ) return res.status(400).json({ message: 'Invalid request data' })
        if( isNaN(amount) ) return res.status(400).json({ message: 'Invalid request data' })

        const foundCoin = currenciesDb.find( c => c.symbol === currency )
        if( !foundCoin ) return res.status(400).json({ message: 'Currency not supported' })

        if( !user?.wallet?.[currency] ) return res.status(400).json({ message: 'Currency not supported' })

        
        const formattedValue = parseFloat(amount).toFixed(foundCoin.dicimals)
        const formattedUmValue = parseFloat(user.wallet[currency].value).toFixed(foundCoin.dicimals)

        if( Number(formattedValue) < 0 ) return res.status(400).json({ message: 'Insufficient amount' })

        if( Number(formattedUmValue) < Number(formattedValue) ) return res.status(400).json({ message: 'Insufficient amount' })

        const minesMap = createMinesweeperArray(minesCount) 

        const newGame = await Games.create({
            amount,
            currency,
            game: 'mines',
            user: user._id,
            state: {
                mines: null,
                minesCount,
                rounds: []
            },
            minesMap
        })


        let newAmount 
        if( Number(formattedUmValue) < Number(formattedValue) ) {
            newAmount = parseFloat( 0 ).toFixed(foundCoin.dicimals)
        } else {
            newAmount = parseFloat( Number(formattedUmValue) - Number(formattedValue) ).toFixed(foundCoin.dicimals)
        }

        const newUser = await User.findOneAndUpdate({_id: user._id}, { $set: { [`wallet.${currency}.value`]: newAmount } }, { new: true })

        sendToAllUserIds(req.io, [newUser._id.toString()], 'UserBalances', {
            wallet: newUser.wallet
        })

        const populatedGame = await Games.findById(newGame._id)
            .populate('user', 'username')
            .select('active amount payout payoutMultiplier currency game state createdAt')

        res.status(200).json(populatedGame)
    } catch ( err ) {
        console.error( err )
        res.status(500).json({ message: 'Internal server error' })
    }
}

const handleMinesNextMove = async (req, res) => {
    try {

        const user = req.user

        const { variables } = req.body
        if(!variables || typeof variables !== 'object') return res.status(400).json({ message: 'Invalid request data' })

        const foundGame = await Games.findOne({game: 'mines', user: user._id, active: true})
        if(!foundGame) return res.status(400).json({ message: 'Game not found' })

        const { fields } = variables

        const gameMinesMap = foundGame.minesMap

        let foundMine = false
        let newFields = []
        for (const [i, field] of fields.entries()) {
            let fieldAlreadyAdded = foundGame.state.rounds.find(r => r.field === field)
            if (fieldAlreadyAdded) continue

            if (gameMinesMap[field] === 0) {
                const playedRounds = foundGame.state.rounds.length + (i + 1)
                const currentPayout = minesWinRates[foundGame.state.minesCount][playedRounds]
                const newField = {
                    field,
                    payoutMultiplier: currentPayout
                }
                newFields.push(newField)

                if( 25 - foundGame.state.minesCount === playedRounds ) break
            } else {
                const newField = {
                    field,
                    payoutMultiplier: 0
                }
                newFields.push(newField)
                foundMine = true
            }
        }

        let minesPoses = []
        gameMinesMap.forEach( (p, i) => {
            if( p === 1 ) minesPoses.push(i)
        } )



        if( foundMine ) {

            let newStatisticScoped = {
                wins: 0,
                losses: 1,
                ties: 0,
                betAmount: Number(foundGame.amount),
                bets: 1
            }

            await Games.findOneAndUpdate( { _id: foundGame._id }, {
                    $push: {
                        'state.rounds': {
                            $each: newFields
                        }
                    },
                    $set: {
                        'state.mines': minesPoses,
                        'payout': 0,
                        'updatedAt': Date.now(),
                        'active': false
                    },
                }
            )

            const newUser = await updateUserStats(user, newStatisticScoped, null, foundGame.currency)

            const populatedGame = await Games.findById(foundGame._id)
                .populate('user', 'username')
                .select('active amount payout payoutMultiplier currency game state createdAt')

            
            return res.status(200).json(populatedGame)
        }

        const playedRounds = [...foundGame.state.rounds, ...newFields].length
        if( 25 - foundGame.state.minesCount === playedRounds ) {


            
            const fullPayout = minesWinRates[foundGame.state.minesCount][playedRounds]
            const foundCoin = currenciesDb.find( c => c.symbol === foundGame.currency )
            const wonAmount = parseFloat(foundGame.amount * fullPayout).toFixed(foundCoin.dicimals)
            const formattedUmValue = parseFloat(user.wallet[foundGame.currency].value).toFixed(foundCoin.dicimals)
            const newAmount = parseFloat( Number(formattedUmValue) + Number(wonAmount) ).toFixed(foundCoin.dicimals)

            let newStatisticScoped = {
                wins: 1,
                losses: 0,
                ties: 0,
                betAmount: Number(foundGame.amount),
                bets: 1
            }
        
            const newUser = await updateUserStats(user, newStatisticScoped, newAmount, foundGame.currency)

            //const newUser = await User.findOneAndUpdate({_id: req.user._id}, { $inc: { [`wallet.${foundGame.currency}.value`]: Number(wonAmount) } }, { new: true })

            sendToAllUserIds(req.io, [newUser._id.toString()], 'UserBalances', {
                wallet: newUser.wallet
            })

            await Games.findOneAndUpdate( { _id: foundGame._id }, {
                    $push: {
                        'state.rounds': {
                            $each: newFields
                        }
                    },
                    $set: {
                        'state.mines': minesPoses,
                        'payout': wonAmount,
                        'payoutMultiplier': fullPayout,
                        'updatedAt': Date.now(),
                        'active': false
                    }
                }
            )

            const populatedGame = await Games.findById(foundGame._id)
                .populate('user', 'username')
                .select('active amount payout payoutMultiplier currency game state createdAt')

        
            return res.status(200).json(populatedGame)

        }
        
        await Games.findOneAndUpdate( { _id: foundGame._id }, {
                $push: {
                    'state.rounds': {
                        $each: newFields
                    }
                },
                $set: { 'updatedAt': Date.now() }
            }
        )

        const populatedGame = await Games.findById(foundGame._id)
            .populate('user', 'username')
            .select('active amount payout payoutMultiplier currency game state createdAt')

        
        res.status(200).json(populatedGame)

    } catch ( err ) {
        console.error( err )
        res.status(500).json({ message: 'Internal server error' })
    }
}

const getActiveMinesBet = async (req, res) => {
    try {
        const foundGame = await Games.findOne({game: 'mines', user: req.user._id, active: true})
        if(!foundGame) return res.status(200).json({
            activeCasinoBet: null
        })

        const populatedGame = await Games.findById(foundGame._id)
            .populate('user', 'username')
            .select('active amount payout payoutMultiplier currency game state createdAt')

        res.status(200).json({
            activeCasinoBet: populatedGame
        })
    } catch ( err ) {
        console.error( err )
        res.status(500).json({ message: 'Internal server error' })
    }
}

const handleMinesCashout = async (req, res) => {

    const user = req.user

    const { variables } = req.body
    if(!variables || typeof variables !== 'object') return res.status(400).json({ message: 'Invalid request data' })

    const foundGame = await Games.findOne({game: 'mines', user: user._id, active: true})
    if(!foundGame) return res.status(400).json({ message: 'Game not found' })

    const { identifier } = variables

    const playedRounds = [...foundGame.state.rounds].length
    if(playedRounds === 0) return res.status(400).json({ message: 'Cannot cashout now.' })

    const gameMinesMap = foundGame.minesMap

    let minesPoses = []
    gameMinesMap.forEach( (p, i) => {
        if( p === 1 ) minesPoses.push(i)
    } )


    const fullPayout = minesWinRates[foundGame.state.minesCount][playedRounds]
    const foundCoin = currenciesDb.find( c => c.symbol === foundGame.currency )
    const wonAmount = parseFloat(foundGame.amount * fullPayout).toFixed(foundCoin.dicimals)
    const formattedUmValue = parseFloat(user.wallet[foundGame.currency].value).toFixed(foundCoin.dicimals)
    const newAmount = parseFloat( Number(formattedUmValue) + Number(wonAmount) ).toFixed(foundCoin.dicimals)

    let newStatisticScoped = {
        wins: 1,
        losses: 0,
        ties: 0,
        betAmount: Number(foundGame.amount),
        bets: 1
    }

    const newUser = await updateUserStats(user, newStatisticScoped, newAmount, foundGame.currency)

    sendToAllUserIds(req.io, [newUser._id.toString()], 'UserBalances', {
        wallet: newUser.wallet
    })

    await Games.findOneAndUpdate( { _id: foundGame._id }, {
            $set: {
                'state.mines': minesPoses,
                'payout': wonAmount,
                'payoutMultiplier': fullPayout,
                'updatedAt': Date.now(),
                'active': false
            }
        }
    )

    const populatedGame = await Games.findById(foundGame._id)
        .populate('user', 'username')
        .select('active amount payout payoutMultiplier currency game state createdAt')


    res.status(200).json(populatedGame)
    

}

module.exports = {
    createMinesBet,
    handleMinesNextMove,
    handleMinesCashout,
    getActiveMinesBet
}