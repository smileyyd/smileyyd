const db = require("../models")
const User = db.user
const Games = db.games

const { updateUserStats } = require("../middlewares/extras")
const currenciesDb = require('../currenciesDb.json')

function generateRandomNumber(min, max) {
    return Math.random() * (max - min) + min
}

const cardsValues = {
    A: 1,
    J: 11,
    Q: 12,
    K: 13
}

const higherMessages = {
    K: "same",
    A: "higher"
}

const cardSuits = ["D", "H", "S", "C"]
const cardRanks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]

const generateCard = () => {
    const totalCards = cardSuits.length * cardRanks.length
        , randomIndex = Math.floor(Math.random() * totalCards) % totalCards
        , selectedSuit = cardSuits[randomIndex % 4]
        , selectedRank = cardRanks[Math.floor(randomIndex / 4)]

    return {
        suit: selectedSuit,
        rank: selectedRank
    }
}

const generateCustomCard = customRanks => {
    const totalCards = cardSuits.length * customRanks.length
        , randomIndex = Math.floor(Math.random() * totalCards) % totalCards
        , selectedSuit = cardSuits[randomIndex % 4]
        , selectedRank = customRanks[Math.floor(randomIndex / 4)]

    return {
        suit: selectedSuit,
        rank: selectedRank
    }
}

const getDesiredCardRanks = (guess, cardRank) => {
    const cardValue = getCardValue(cardRank)

    const conditionFunctions = {
        "higherEqual": rankValue => rankValue >= cardValue,
        "lowerEqual": rankValue => rankValue <= cardValue,
        "lower": rankValue => rankValue < cardValue,
        "higher": rankValue => rankValue > cardValue,
        "equal": rankValue => rankValue === cardValue,
        "notEqual": rankValue => rankValue !== cardValue,
    }

    const conditionFunction = conditionFunctions[guess]

    if (!conditionFunction) return []

    return cardRanks.filter(rank => {
        const rankValue = getCardValue(rank)
        return conditionFunction(rankValue)
    })
}



const calcChances = cardValue => {
    const fractionOfA = cardValue * .07692307692307693;
    return {
        lowerEqual: fractionOfA,
        lower: fractionOfA - 1 / 13,
        higherEqual: 1 - fractionOfA + 1 / 13,
        higher: 1 - fractionOfA
    }
}

const getCardValue = cardRank => cardRank in cardsValues ? cardsValues[cardRank] : Number(cardRank)

const payoutFromChance = chance => {
    const e = chance * 1e3;
    return Math.floor((1e5 - .01 * 1e5) / e * 1e5) / 1e5
}

const getHigherChance = cardRank => {
    const cardValue = getCardValue(cardRank)
    const newChance = calcChances(cardValue)[cardRank === "A" ? "higher" : "higherEqual"] * 100

    return {
        chance: newChance,
        payout: payoutFromChance(newChance)
    }
}

const getLowerChance = cardRank => {
    const cardValue = getCardValue(cardRank)
    const newChance = calcChances(cardValue)[cardRank === "K" ? "lower" : "lowerEqual"] * 100

    return {
        chance: newChance,
        payout: payoutFromChance(newChance)
    }
}

const statisticsFromMultiplier = (amount, multiplier) => {
    let newStatisticScoped = {
        wins: 0,
        losses: 0,
        ties: 0,
        betAmount: Number(amount),
        bets: 1
    }

    if( multiplier < 1 ) {
        newStatisticScoped.losses++
    } else if( multiplier === 1 ) {
        newStatisticScoped.ties++
    } else {
        newStatisticScoped.wins++
    }
    return newStatisticScoped
}

const calcBetPayout = (amount, userAmount, multiplier, currency, alreadyRemoved) => {
    const foundCoin = currenciesDb.find( c => c.symbol === currency )

    const formmattedAmount = parseFloat( amount ).toFixed( foundCoin.dicimals )
    const formmattedUserAmount = parseFloat( userAmount ).toFixed( foundCoin.dicimals )


    if( alreadyRemoved ) {
        return parseFloat( Number( formmattedUserAmount ) + ( Number( formmattedAmount ) * multiplier ) ).toFixed(foundCoin.dicimals)
    } else {
        return parseFloat( Number( formmattedUserAmount ) - Number( formmattedAmount ) + ( Number( formmattedAmount ) * multiplier ) ).toFixed(foundCoin.dicimals)
    }
}

const createHiloBet = async (req, res) => {
    try {
        const user = req.user

        const foundGame = await Games.findOne({game: 'hilo', user: user._id, active: true})
        if(foundGame) return res.status(400).json({ message: 'already playing' })

        const { variables } = req.body
        if(!variables || typeof variables !== 'object') return res.status(400).json({ message: 'Invalid request data' })

        const { currency, amount, startCard } = variables

        const newStartCard = {
            rank: startCard?.rank,
            suit: startCard?.suit
        }

        if( isNaN(amount) ) return res.status(400).json({ message: 'Invalid request data' })

        const foundCoin = currenciesDb.find( c => c.symbol === currency )
        if( !foundCoin ) return res.status(400).json({ message: 'Currency not supported' })

        if( !user?.wallet?.[currency] ) return res.status(400).json({ message: 'Currency not supported' })

        if( !cardSuits.includes(newStartCard?.suit) || !cardRanks.includes(newStartCard?.rank) ) return res.status(400).json({ message: 'Invalid request data' })

        const formattedValue = parseFloat(amount).toFixed(foundCoin.dicimals)
        const formattedUmValue = parseFloat(user.wallet[currency].value).toFixed(foundCoin.dicimals)

        if( Number(formattedValue) < 0 ) return res.status(400).json({ message: 'Insufficient amount' })
        if( Number(formattedUmValue) < Number(formattedValue) ) return res.status(400).json({ message: 'Insufficient amount' })


        const newGame = await Games.create({
            active: true,
            amount,
            currency,
            game: 'hilo',
            user: user._id,
            payout: 0,
            payoutMultiplier: 0,
            state: {
                rounds: [],
                startCard: newStartCard,
            }
        })

        let newAmount = calcBetPayout(formattedValue, formattedUmValue, 0, currency)
        user.wallet[currency].value = newAmount
        const newUser = await user.save()

        const populatedGame = await Games.findById(newGame._id)
            .populate('user', 'username')
            .select('active amount payout payoutMultiplier currency game state createdAt')

        res.status(200).json({hiloBet: populatedGame})
    } catch ( err ) {
        console.error( err )
        res.status(500).json({ message: 'Internal server error' })
    }
}

const handleHiloCashout = async (req, res) => {
    try {
        const user = req.user

        const { variables } = req.body
        if(!variables || typeof variables !== 'object') return res.status(400).json({ message: 'Invalid request data' })

        const foundGame = await Games.findOne({game: 'hilo', user: user._id, active: true})
        if(!foundGame) return res.status(400).json({ message: 'Game not found' })

        const gameRounds = foundGame.state.rounds
        if( gameRounds.filter( r => r.guess !== "skip" ).length === 0 ) return res.status(400).json({ message: 'Invalid request data' })

        const lastRound = gameRounds[gameRounds.length-1]

        let newPayoutMultiplier = lastRound.payoutMultiplier
        let updateData = {
            active: false,
            payout: Number(foundGame.amount) * newPayoutMultiplier,
            payoutMultiplier: newPayoutMultiplier
        }

        let newAmount = calcBetPayout(foundGame.amount, user.wallet[foundGame.currency].value, newPayoutMultiplier, foundGame.currency, true)
        const newStatisticScoped = statisticsFromMultiplier(foundGame.amount, newPayoutMultiplier)
        const newUser = await updateUserStats(user, newStatisticScoped, newAmount, foundGame.currency)

        const populatedGame = await Games.findByIdAndUpdate(foundGame._id, updateData, {new: true})
            .populate('user', 'username')
            .select('active amount payout payoutMultiplier currency game state createdAt')


        res.status(200).json(populatedGame)
    } catch ( err ) {
        console.error( err )
        res.status(500).json({ message: 'Internal server error' })
    }
}

const handleHiloNext = async (req, res) => {
    try {
        const user = req.user

        const { variables } = req.body
        if(!variables || typeof variables !== 'object') return res.status(400).json({ message: 'Invalid request data' })

        const foundGame = await Games.findOne({game: 'hilo', user: user._id, active: true})
        if(!foundGame) return res.status(400).json({ message: 'Game not found' })

        const { guess } = variables

        if( !["skip", "equal", "higher", "lower", "higherEqual", "lowerEqual"].includes(guess) ) return res.status(400).json({ message: 'Invalid request data' })


        if( guess === "skip" ) {
            _SKIP_Guess(req, res, foundGame)
            return
        } else if ( guess === "higherEqual" ) {
            _HIGHER_EQ_Guess(req, res, foundGame)
            return
        } else if ( guess === "lowerEqual" ) {
            _LOWER_EQ_Guess(req, res, foundGame)
            return
        } else if ( guess === "higher" ) {
            _HIGHER_Guess(req, res, foundGame)
            return
        } else if ( guess === "lower" ) {
            _LOWER_Guess(req, res, foundGame)
            return
        } else if ( guess === "equal" ) {
            _EQUAL_Guess(req, res, foundGame)
            return
        }

        res.status(400).json({ message: 'Invalid request data' })
    } catch ( err ) {
        console.error( err )
        res.status(500).json({ message: 'Internal server error' })
    }
}

const _SKIP_Guess = async (req, res, foundGame) => {
    try {
        let newPayoutMultiplier

        const skipRounds = foundGame.state.rounds.filter( r => r.guess === "skip" )
        if( skipRounds.length >= 52  ) return res.status(400).json({ message: 'Invalid request data' })

        const lastRound = foundGame.state.rounds[foundGame.state.rounds.length-1]

        if( lastRound ) {
            newPayoutMultiplier = lastRound.payoutMultiplier
        } else {
            newPayoutMultiplier = 1
        }

        const newSkipCard = generateCard()
        const newRound = {
            card: newSkipCard,
            guess: "skip",
            payoutMultiplier: newPayoutMultiplier
        }
        let updateData = {
            $push: {
                'state.rounds': newRound
            }
        }

        const populatedGame = await Games.findByIdAndUpdate(foundGame._id, updateData, {new: true})
            .populate('user', 'username')
            .select('active amount payout payoutMultiplier currency game state createdAt')

        res.status(200).json(populatedGame)
    } catch ( err ) {
        console.error( err )
        res.status(500).json({ message: 'Internal server error' })
    }
}

const _HIGHER_EQ_Guess = async (req, res, foundGame) => {
    try {
        const user = req.user

        let updateData = {}
        let newPayoutMultiplier
        let lastRoundMultiplier
        const gameRounds = foundGame.state.rounds
        const lastRound = gameRounds[gameRounds.length-1]
        const selectedCard = lastRound?.card || foundGame.state.startCard

        if( lastRound ) {
            lastRoundMultiplier = lastRound.payoutMultiplier
        } else {
            lastRoundMultiplier = 1
        }


        const cardHigherChances = getHigherChance(selectedCard.rank)
        const cardLowerChances = getLowerChance(selectedCard.rank)

        const generatedChance = generateRandomNumber(0, cardHigherChances.chance + cardLowerChances.chance)

        if( generatedChance < cardHigherChances.chance ) {
            newPayoutMultiplier = lastRoundMultiplier * cardHigherChances.payout

            
            const customRanks = getDesiredCardRanks("higherEqual", selectedCard.rank)
            const newGuessCard = generateCustomCard(customRanks)

            const newRound = {
                card: newGuessCard,
                guess: "higherEqual",
                payoutMultiplier: newPayoutMultiplier
            }

            updateData = {
                $push: {
                    'state.rounds': newRound
                }
            }
        } else {
            newPayoutMultiplier = 0

            const customRanks = getDesiredCardRanks("lower", selectedCard.rank)
            const newGuessCard = generateCustomCard(customRanks)
            const newRound = {
                card: newGuessCard,
                guess: "higherEqual",
                payoutMultiplier: newPayoutMultiplier
            }

            updateData = {
                active: false,
                $push: {
                    'state.rounds': newRound
                }
            }
        }
        
        const populatedGame = await Games.findByIdAndUpdate(foundGame._id, updateData, {new: true})
            .populate('user', 'username')
            .select('active amount payout payoutMultiplier currency game state createdAt')

        res.status(200).json(populatedGame)
    } catch ( err ) {
        console.error( err )
        res.status(500).json({ message: 'Internal server error' })
    }
}

const _LOWER_EQ_Guess = async (req, res, foundGame) => {
    try {
        const user = req.user

        let updateData = {}
        let newPayoutMultiplier
        let lastRoundMultiplier
        const gameRounds = foundGame.state.rounds
        const lastRound = gameRounds[gameRounds.length-1]
        const selectedCard = lastRound?.card || foundGame.state.startCard

        if( lastRound ) {
            lastRoundMultiplier = lastRound.payoutMultiplier
        } else {
            lastRoundMultiplier = 1
        }


        const cardHigherChances = getHigherChance(selectedCard.rank)
        const cardLowerChances = getLowerChance(selectedCard.rank)

        const generatedChance = generateRandomNumber(0, cardHigherChances.chance + cardLowerChances.chance)

        if( generatedChance < cardLowerChances.chance ) {
            newPayoutMultiplier = lastRoundMultiplier * cardLowerChances.payout

            
            const customRanks = getDesiredCardRanks("lowerEqual", selectedCard.rank)
            const newGuessCard = generateCustomCard(customRanks)

            const newRound = {
                card: newGuessCard,
                guess: "lowerEqual",
                payoutMultiplier: newPayoutMultiplier
            }

            updateData = {
                $push: {
                    'state.rounds': newRound
                }
            }
        } else {
            newPayoutMultiplier = 0

            const customRanks = getDesiredCardRanks("higher", selectedCard.rank)
            const newGuessCard = generateCustomCard(customRanks)
            const newRound = {
                card: newGuessCard,
                guess: "lowerEqual",
                payoutMultiplier: newPayoutMultiplier
            }

            updateData = {
                active: false,
                $push: {
                    'state.rounds': newRound
                }
            }
        }
        
        const populatedGame = await Games.findByIdAndUpdate(foundGame._id, updateData, {new: true})
            .populate('user', 'username')
            .select('active amount payout payoutMultiplier currency game state createdAt')

        res.status(200).json(populatedGame)
    } catch ( err ) {
        console.error( err )
        res.status(500).json({ message: 'Internal server error' })
    }
}

const _HIGHER_Guess = async (req, res, foundGame) => {
    try {
        const user = req.user

        let updateData = {}
        let newPayoutMultiplier
        let lastRoundMultiplier
        const gameRounds = foundGame.state.rounds
        const lastRound = gameRounds[gameRounds.length-1]
        const selectedCard = lastRound?.card || foundGame.state.startCard

        if( lastRound ) {
            lastRoundMultiplier = lastRound.payoutMultiplier
        } else {
            lastRoundMultiplier = 1
        }


        const cardHigherChances = getHigherChance(selectedCard.rank)
        const cardLowerChances = getLowerChance(selectedCard.rank)

        const generatedChance = generateRandomNumber(0, cardHigherChances.chance + cardLowerChances.chance)

        if( generatedChance < cardHigherChances.chance ) {
            newPayoutMultiplier = lastRoundMultiplier * cardHigherChances.payout

            const customRanks = getDesiredCardRanks("higher", selectedCard.rank)
            const newGuessCard = generateCustomCard(customRanks)

            const newRound = {
                card: newGuessCard,
                guess: "higher",
                payoutMultiplier: newPayoutMultiplier
            }

            updateData = {
                $push: {
                    'state.rounds': newRound
                }
            }
        } else {
            newPayoutMultiplier = 0

            const customRanks = getDesiredCardRanks("lowerEqual", selectedCard.rank)
            const newGuessCard = generateCustomCard(customRanks)
            const newRound = {
                card: newGuessCard,
                guess: "higher",
                payoutMultiplier: newPayoutMultiplier
            }

            updateData = {
                active: false,
                $push: {
                    'state.rounds': newRound
                }
            }
        }
        
        const populatedGame = await Games.findByIdAndUpdate(foundGame._id, updateData, {new: true})
            .populate('user', 'username')
            .select('active amount payout payoutMultiplier currency game state createdAt')

        res.status(200).json(populatedGame)
    } catch ( err ) {
        console.error( err )
        res.status(500).json({ message: 'Internal server error' })
    }
}

const _LOWER_Guess = async (req, res, foundGame) => {
    try {
        const user = req.user

        let updateData = {}
        let newPayoutMultiplier
        let lastRoundMultiplier
        const gameRounds = foundGame.state.rounds
        const lastRound = gameRounds[gameRounds.length-1]
        const selectedCard = lastRound?.card || foundGame.state.startCard

        if( lastRound ) {
            lastRoundMultiplier = lastRound.payoutMultiplier
        } else {
            lastRoundMultiplier = 1
        }


        const cardHigherChances = getHigherChance(selectedCard.rank)
        const cardLowerChances = getLowerChance(selectedCard.rank)
        const generatedChance = generateRandomNumber(0, cardHigherChances.chance + cardLowerChances.chance)

        if( generatedChance < cardLowerChances.chance ) {
            newPayoutMultiplier = lastRoundMultiplier * cardLowerChances.payout

            const customRanks = getDesiredCardRanks("lower", selectedCard.rank)
            const newGuessCard = generateCustomCard(customRanks)

            const newRound = {
                card: newGuessCard,
                guess: "lower",
                payoutMultiplier: newPayoutMultiplier
            }

            updateData = {
                $push: {
                    'state.rounds': newRound
                }
            }
        } else {
            newPayoutMultiplier = 0

            const customRanks = getDesiredCardRanks("higherEqual", selectedCard.rank)
            const newGuessCard = generateCustomCard(customRanks)
            const newRound = {
                card: newGuessCard,
                guess: "lower",
                payoutMultiplier: newPayoutMultiplier
            }
            
            updateData = {
                active: false,
                $push: {
                    'state.rounds': newRound
                }
            }
        }
        
        const populatedGame = await Games.findByIdAndUpdate(foundGame._id, updateData, {new: true})
            .populate('user', 'username')
            .select('active amount payout payoutMultiplier currency game state createdAt')

        res.status(200).json(populatedGame)
    } catch ( err ) {
        console.error( err )
        res.status(500).json({ message: 'Internal server error' })
    }
}

const _EQUAL_Guess = async (req, res, foundGame) => {
    try {
        const user = req.user

        let updateData = {}
        let newPayoutMultiplier
        let lastRoundMultiplier
        const gameRounds = foundGame.state.rounds
        const lastRound = gameRounds[gameRounds.length-1]
        const selectedCard = lastRound?.card || foundGame.state.startCard

        if( lastRound ) {
            lastRoundMultiplier = lastRound.payoutMultiplier
        } else {
            lastRoundMultiplier = 1
        }


        const cardHigherChances = getHigherChance(selectedCard.rank)
        const cardLowerChances = getLowerChance(selectedCard.rank)
        let selectedChances
        const generatedChance = generateRandomNumber(0, cardHigherChances.chance + cardLowerChances.chance)
        if( selectedCard.rank === "K" ) {
            selectedChances = cardHigherChances
        } else {
            selectedChances = cardLowerChances
        }
        if( generatedChance < selectedChances.chance ) {
            newPayoutMultiplier = lastRoundMultiplier * selectedChances.payout

            const newGuessCard = generateCustomCard([selectedCard.rank])

            const newRound = {
                card: newGuessCard,
                guess: "equal",
                payoutMultiplier: newPayoutMultiplier
            }

            updateData = {
                $push: {
                    'state.rounds': newRound
                }
            }
        } else {
            newPayoutMultiplier = 0

            const customRanks = getDesiredCardRanks("notEqual", selectedCard.rank)
            const newGuessCard = generateCustomCard(customRanks)
            const newRound = {
                card: newGuessCard,
                guess: "equal",
                payoutMultiplier: newPayoutMultiplier
            }
            
            updateData = {
                active: false,
                $push: {
                    'state.rounds': newRound
                }
            }
        }
        
        const populatedGame = await Games.findByIdAndUpdate(foundGame._id, updateData, {new: true})
            .populate('user', 'username')
            .select('active amount payout payoutMultiplier currency game state createdAt')

        res.status(200).json(populatedGame)
    } catch ( err ) {
        console.error( err )
        res.status(500).json({ message: 'Internal server error' })
    }
}


const getActiveHiloBet = async (req, res) => {
    try {
        const foundGame = await Games.findOne({game: 'hilo', user: req.user._id, active: true})
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

module.exports = {
    createHiloBet,
    handleHiloNext,
    getActiveHiloBet,
    handleHiloCashout
}