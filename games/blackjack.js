const db = require("../models")
const User = db.user
const Games = db.games

const { sendToAllUserIds } = require("../sockets/helpers")
const { updateUserStats } = require("../middlewares/extras")
const currenciesDb = require('../currenciesDb.json')

const ranksValues = {
    A: [1, 11],
    J: [10],
    Q: [10],
    K: [10],
    10: [10],
    9: [9],
    8: [8],
    7: [7],
    6: [6],
    5: [5],
    4: [4],
    3: [3],
    2: [2],
    0: [0]
}

const cardSuits = ["D", "H", "S", "C"]
const cardRanks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
//const cardRanks = ["K", "A"]

function getRandomItew(array) {
    const randomIndex = Math.floor(Math.random() * array.length)

    return array[randomIndex]
}


function calcCardsValue(cards) {
    let value = 0;
    for (let card of cards) {
        if (card.rank === 'A') {
            value += 11
        } else if (['K', 'Q', 'J'].includes(card.rank)) {
            value += 10
        } else {
            value += parseInt(card.rank)
        }
    }

    for (let card of cards) {
        if (card.rank === 'A' && value > 21) {
            value -= 10
        }
    }
    return value
}

function playDealerTurns(cards, playerValue) {
    const newCards = [...cards]
    let resultValue = calcCardsValue(cards)
    let newActions = []
    let pushedAtLeastOnce = false // Flag to track if at least one card has been pushed

    while (!pushedAtLeastOnce || resultValue < 17) {
        const newCard = {
            suit: getRandomItew(cardSuits),
            rank: getRandomItew(cardRanks)
        };
        newCards.push(newCard)
        resultValue = calcCardsValue(newCards)
        newActions.push("hit")
        pushedAtLeastOnce = true // Set flag to true after pushing at least once
    }

    if (resultValue > 21) newActions.push("bust")
    else if (resultValue === 21) newActions.push("full")

    return {
        value: resultValue,
        cards: newCards,
        actions: newActions
    }
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


const getActiveBlackjackBet = async (req, res) => {
    try {
        const foundGame = await Games.findOne({game: 'blackjack', user: req.user._id, active: true})
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


const createBlackjackBet = async (req, res) => {
    try {
        const user = req.user

        const foundGame = await Games.findOne({game: 'blackjack', user: user._id, active: true})
        if(foundGame) return res.status(400).json({ message: 'already playing' })

        const { variables } = req.body
        if(!variables || typeof variables !== 'object') return res.status(400).json({ message: 'Invalid request data' })

        const { currency, amount, identifier } = variables

        if( isNaN(amount) ) return res.status(400).json({ message: 'Invalid request data' })

        const foundCoin = currenciesDb.find( c => c.symbol === currency )
        if( !foundCoin ) return res.status(400).json({ message: 'Currency not supported' })

        if( !user?.wallet?.[currency] ) return res.status(400).json({ message: 'Currency not supported' })

        const formattedValue = parseFloat(amount).toFixed(foundCoin.dicimals)
        const formattedUmValue = parseFloat(user.wallet[currency].value).toFixed(foundCoin.dicimals)

        if( Number(formattedValue) < 0 ) return res.status(400).json({ message: 'Insufficient amount' })
        if( Number(formattedUmValue) < Number(formattedValue) ) return res.status(400).json({ message: 'Insufficient amount' })



        let addPlayerActions = []
        let addDealerActions = []
        let gameActive = true
        let resultMultiplier = 0


        const newPlayerCards = []
        while( newPlayerCards.length < 2 ) {
            newPlayerCards.push({
                suit: getRandomItew(cardSuits),
                rank: getRandomItew(cardRanks)
            })
        }

        const newDealerCards = []
        while( newDealerCards.length < 2 ) {
            newDealerCards.push({
                suit: getRandomItew(cardSuits),
                rank: getRandomItew(cardRanks)
            })
        }

        const playerValue = calcCardsValue(newPlayerCards)
        let dealerValue = calcCardsValue(newDealerCards)

        if( playerValue === 21 && dealerValue === 21  ) {
            addPlayerActions.push("blackjack")
            addDealerActions.push("blackjack")
            resultMultiplier = 1
            gameActive = false
        } else if ( playerValue !== 21 && dealerValue === 21 ) {
            if( newDealerCards[0].rank === 'A' ) {
                newDealerCards.pop()
                dealerValue = calcCardsValue(newDealerCards)

                //gameActive = false // remove this ( testing only )
            } else {
                resultMultiplier = 0
                gameActive = false
                addDealerActions.push("blackjack")
            }
        } else if ( playerValue === 21 && dealerValue !== 21 ) {
            resultMultiplier = 2.5
            addPlayerActions.push("blackjack")
            gameActive = false
        } else {
            if( newDealerCards[0].rank === 'A' ) {

                //gameActive = false // remove this ( testing only )
            }

            newDealerCards.pop()
            dealerValue = calcCardsValue(newDealerCards)
        }


        const newGame = await Games.create({
            active: gameActive,
            amount,
            currency,
            game: 'blackjack',
            user: user._id,
            payout: Number(amount) * resultMultiplier,
            payoutMultiplier: resultMultiplier,
            state: {
                dealer: [
                    {
                        actions: [
                            "deal",
                            ...addDealerActions
                        ],
                        cards: [
                            ...newDealerCards
                        ],
                        value: dealerValue
                    }
                ],
                player: [
                    {
                        actions: [
                            "deal",
                            ...addPlayerActions
                        ],
                        cards: [
                            ...newPlayerCards
                        ],
                        value: playerValue
                    }
                ]
            }
        })


        if( !gameActive ) {
            //console.log("[deal]-multiplier:", resultMultiplier)

            let newAmount = calcBetPayout(formattedValue, formattedUmValue, resultMultiplier, currency)

            const newStatisticScoped = statisticsFromMultiplier(amount, resultMultiplier)

            const newUser = await updateUserStats(user, newStatisticScoped, newAmount, currency)
        } else {
            let newAmount = calcBetPayout(formattedValue, formattedUmValue, 0, currency)

            user.wallet[currency].value = newAmount
            const newUser = await user.save()
        }

        

        const populatedGame = await Games.findById(newGame._id)
            .populate('user', 'username')
            .select('active amount payout payoutMultiplier currency game state createdAt')

        res.status(200).json(populatedGame)
    } catch ( err ) {
        console.error( err )
        res.status(500).json({ message: 'Internal server error' })
    }
}

const handleBlackjackNext = async (req, res) => {
    try {
        const user = req.user

        const { variables } = req.body
        if(!variables || typeof variables !== 'object') return res.status(400).json({ message: 'Invalid request data' })

        const foundGame = await Games.findOne({game: 'blackjack', user: user._id, active: true})
        if(!foundGame) return res.status(400).json({ message: 'Game not found' })

        const { action } = variables

        if( !["hit", "stand", "split", "double", "insurance", "noInsurance"].includes(action) ) return res.status(400).json({ message: 'Invalid request data' })


        if( action === "hit" ) {
            _HIT_Action(req, res, foundGame)
            return
        } else if ( action === "stand" ) {
            _STAND_Action(req, res, foundGame)
            return
        } else if ( action === "double" ) {
            _DOUBLE_Action(req, res, foundGame)
            return
        } else if ( action === "split" ) {
            _SPLIT_Action(req, res, foundGame)
            return
        } else if ( action === "insurance" ) {
            _INSURANCE_Action(req, res, foundGame)
            return
        } else if ( action === "noInsurance" ) {
            _NO_INSURANCE_Action(req, res, foundGame)
            return
        }

        res.status(400).json({ message: 'Invalid request data' })
    } catch ( err ) {
        console.error( err )
        res.status(500).json({ message: 'Internal server error' })
    }
}

const _INSURANCE_Action = async(req, res, foundGame) => {
    try {
        const user = req.user

        let resultMultiplier

        const firstPlayerHand = foundGame.state.player[0]
        const firstDealerHand = foundGame.state.dealer[0]

        if(
            firstDealerHand.cards[0].rank !== "A" ||
            ["insurance", "noInsurance"].includes(firstPlayerHand.actions[firstPlayerHand.actions.length-1])
        ) {
            return res.status(400).json({ message: 'Invalid request data' })
        }

        const newDealerCard = {
            suit: getRandomItew(cardSuits),
            rank: getRandomItew(cardRanks)
        }

        const newDealerHandCards = [
            ...firstDealerHand.cards,
            newDealerCard
        ]

        const newDealerValue = calcCardsValue(newDealerHandCards)

        const addPlayerActions = [
            ...firstPlayerHand.actions,
            "insurance"
        ]

        let updateData = {}

        if( newDealerValue === 21 ) {
            addPlayerActions.push("bust")

            resultMultiplier = 1

            updateData = {
                $set: {
                    active: false,
                    payoutMultiplier: resultMultiplier,
                    payout: Number(foundGame.amount) * resultMultiplier,
                    [`state.player.0.actions`]: addPlayerActions,
                    [`state.dealer.0.value`]: newDealerValue,
                    [`state.dealer.0.cards`]: newDealerHandCards
                }
            }
        } else {
            updateData = {
                $set: {
                    [`state.player.0.actions`]: addPlayerActions
                }
            }
        }
        
        

        if( resultMultiplier !== undefined ) {
            //console.log("[insurance]-multiplier:", resultMultiplier)

            let newAmount = calcBetPayout(foundGame.amount, user.wallet[foundGame.currency].value, resultMultiplier, foundGame.currency, true)

            const newStatisticScoped = statisticsFromMultiplier(foundGame.amount, resultMultiplier)

            const newUser = await updateUserStats(user, newStatisticScoped, newAmount, foundGame.currency)
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

const _NO_INSURANCE_Action = async(req, res, foundGame) => {
    try {
        const user = req.user

        let resultMultiplier

        const firstPlayerHand = foundGame.state.player[0]
        const firstDealerHand = foundGame.state.dealer[0]

        if(
            firstDealerHand.cards[0].rank !== "A" ||
            ["insurance", "noInsurance"].includes(firstPlayerHand.actions[firstPlayerHand.actions.length-1])
        ) {
            return res.status(400).json({ message: 'Invalid request data' })
        }

        const newDealerCard = {
            suit: getRandomItew(cardSuits),
            rank: getRandomItew(cardRanks)
        }

        const newDealerHandCards = [
            ...firstDealerHand.cards,
            newDealerCard
        ]

        const newDealerValue = calcCardsValue(newDealerHandCards)

        const addPlayerActions = [
            ...firstPlayerHand.actions,
            "noInsurance"
        ]

        let updateData = {}

        if( newDealerValue === 21 ) {
            addPlayerActions.push("bust")

            resultMultiplier = 0

            updateData = {
                $set: {
                    active: false,
                    payoutMultiplier: resultMultiplier,
                    payout: 0,
                    [`state.player.0.actions`]: addPlayerActions,
                    [`state.dealer.0.value`]: newDealerValue,
                    [`state.dealer.0.cards`]: newDealerHandCards
                }
            }
        } else {
            updateData = {
                $set: {
                    [`state.player.0.actions`]: addPlayerActions
                }
            }
        }
        
        

        if( resultMultiplier !== undefined ) {
            //console.log("[noInsurance]-multiplier:", resultMultiplier)

            let newAmount = calcBetPayout(foundGame.amount, user.wallet[foundGame.currency].value, resultMultiplier, foundGame.currency, true)

            const newStatisticScoped = statisticsFromMultiplier(foundGame.amount, resultMultiplier)

            const newUser = await updateUserStats(user, newStatisticScoped, newAmount, foundGame.currency)
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

const _SPLIT_Action = async(req, res, foundGame) => {
    try {
        const user = req.user

        let resultMultiplier

        const firstDealerHand = foundGame.state.dealer[0]

        const firstPlayerHand = foundGame.state.player[0]
        const secondPlayerHand = foundGame.state.player[0]


        if (
            firstPlayerHand.actions.includes("split") ||
            foundGame.state.player.length !== 1 ||
            firstPlayerHand.cards.length !== 2 ||
            firstPlayerHand.cards[0].rank !== firstPlayerHand.cards[1].rank
        ) return res.status(400).json({ message: 'Invalid request data' })


        const firstHandCard = {
            suit: getRandomItew(cardSuits),
            rank: getRandomItew(cardRanks)
        }
        const secondHandCard = {
            suit: getRandomItew(cardSuits),
            rank: getRandomItew(cardRanks)
        }

        const firstPlayerCard = firstPlayerHand.cards[0]

        const newFirstHandCards = [
            firstPlayerCard,
            firstHandCard
        ]
        const newSecondHandCards = [
            firstPlayerCard,
            secondHandCard
        ]


        const firstHandValue = calcCardsValue(newFirstHandCards)
        const secondHandValue = calcCardsValue(newSecondHandCards)

        let addFirstHandActions = [
            ...firstPlayerHand.actions,
            "split"
        ]
        let addSecondHandActions = [
            ...secondPlayerHand.actions,
            "split"
        ]

        let updateData = {}
        

        if( firstHandValue === 21 ) {
            addFirstHandActions.push("full")
        }
        if( secondHandValue === 21 ) {
            addSecondHandActions.push("full")
        }

        if( firstHandValue === 21 && secondHandValue === 21 ) {
            const newDealerResults = playDealerTurns(firstDealerHand.cards, 21)

            let addDealerActions = [
                ...firstDealerHand.actions,
                ...newDealerResults.actions
            ]

            if( newDealerResults.value === 21 ) {
                resultMultiplier = 1
            } else {
                resultMultiplier = 2
            }

            updateData = {
                $set: {
                    active: false,
                    payoutMultiplier: resultMultiplier,
                    payout: Number(foundGame.amount) * resultMultiplier,
                    [`state.dealer.0.value`]: newDealerResults.value,
                    [`state.dealer.0.cards`]: newDealerResults.cards,
                    [`state.dealer.0.actions`]: addDealerActions,
                    [`state.player.0.value`]: firstHandValue,
                    [`state.player.0.cards`]: newFirstHandCards,
                    [`state.player.0.actions`]: addFirstHandActions,
                    [`state.player.1.value`]: secondHandValue,
                    [`state.player.1.cards`]: newSecondHandCards,
                    [`state.player.1.actions`]: addSecondHandActions
                }
            }

        } else {
            updateData = {
                $set: {
                    [`state.player.0.value`]: firstHandValue,
                    [`state.player.0.cards`]: newFirstHandCards,
                    [`state.player.0.actions`]: addFirstHandActions,
                    [`state.player.1.value`]: secondHandValue,
                    [`state.player.1.cards`]: newSecondHandCards,
                    [`state.player.1.actions`]: addSecondHandActions
                }
            }
        }

        if( resultMultiplier !== undefined ) {
            //console.log("[split]-multiplier:", resultMultiplier)

            let newAmount = calcBetPayout(foundGame.amount, user.wallet[foundGame.currency].value, resultMultiplier, foundGame.currency, true)

            const newStatisticScoped = statisticsFromMultiplier(foundGame.amount, resultMultiplier)

            const newUser = await updateUserStats(user, newStatisticScoped, newAmount, foundGame.currency)
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

const _DOUBLE_Action = async(req, res, foundGame) => {
    try {
        const user = req.user

        let resultMultiplier

        const hitCard = {
            suit: getRandomItew(cardSuits),
            rank: getRandomItew(cardRanks)
        }


        let updateData = {}

        const firstPlayerHand = foundGame.state.player[0]
        const firstDealerHand = foundGame.state.dealer[0]


        let handIndex = 0
        if( foundGame.state.player.length === 2 ) {
            const handHasPlayed = firstPlayerHand.actions.some( action => ["bust", "full", "stand", "double"].includes(action) )
            if( handHasPlayed ) handIndex = 1
        }

        const selectedPlayerHand = foundGame.state.player[handIndex]

        let canDouble = false

        if( foundGame.state.player.length === 2 ) {
            if( selectedPlayerHand.actions[selectedPlayerHand.actions.length-1] === "split" ) {
                canDouble = true
            }
        } else {
            if( ["deal", "insurance", "noInsurance"].includes(selectedPlayerHand.actions[selectedPlayerHand.actions.length-1]) ) {
                canDouble = true
            }
        }

        if ( !canDouble ) return res.status(400).json({ message: 'Invalid request data' })

        let addPlayerActions = [
            ...selectedPlayerHand.actions,
            "double"
        ]

        const newPlayerCards = [
            ...selectedPlayerHand.cards,
            hitCard
        ]
        const playerValue = calcCardsValue(newPlayerCards)
        
        if( foundGame.state.player.length === 2 ) {
            const contrHand = foundGame.state.player[handIndex === 0 ? 1 : 0]
            const contrHandEnded = contrHand.actions.some( action => ["bust", "full", "stand", "double"].includes(action) )
            const contrHandBust = contrHand.actions.includes("bust")
            const contrHandFull = contrHand.actions.includes("full")
            const contrHandStand = contrHand.actions.includes("stand")
            const contrHandDouble = contrHand.actions.includes("double")

                if( playerValue > 21 ) {
                    // first hand lost
                    addPlayerActions.push("bust")

                    if( contrHandBust ) {
                        // other hand lost
                        resultMultiplier = 0

                        updateData = {
                            $set: {
                                active: false,
                                payoutMultiplier: resultMultiplier,
                                payout: 0,
                                [`state.player.${handIndex}.value`]: playerValue,
                                [`state.player.${handIndex}.cards`]: newPlayerCards,
                                [`state.player.${handIndex}.actions`]: addPlayerActions
                            }
                        }
                    } else if ( contrHandFull || contrHandStand || contrHandDouble ) {
                        // other hand is 21 or lower
                        const newDealerResults = playDealerTurns(firstDealerHand.cards, 21)
    
                        let addDealerActions = [
                            ...firstDealerHand.actions,
                            ...newDealerResults.actions
                        ]
                        
                        if( newDealerResults.value === 21 ) {
                            if( contrHand.value === 21 ) {
                                resultMultiplier = 0.5
                            } else {
                                resultMultiplier = 0
                            }
                        } else if ( newDealerResults.value > 21 ) {
                            resultMultiplier = 1
                        } else {
                            if( contrHand.value === newDealerResults.value ) {
                                resultMultiplier = 0.5
                            } else if( contrHand.value > newDealerResults.value && newDealerResults.value <= 21 ) {
                                resultMultiplier = 1
                            } else {
                                resultMultiplier = 0
                            }
                        }
    
                        updateData = {
                            $set: {
                                active: false,
                                payoutMultiplier: resultMultiplier,
                                payout: Number(foundGame.amount) * resultMultiplier,
                                [`state.player.${handIndex}.value`]: playerValue,
                                [`state.player.${handIndex}.cards`]: newPlayerCards,
                                [`state.player.${handIndex}.actions`]: addPlayerActions,
                                [`state.dealer.0.cards`]: newDealerResults.cards,
                                [`state.dealer.0.value`]: newDealerResults.value,
                                [`state.dealer.0.actions`]: addDealerActions
                            }
                        }
                    } else {
                        updateData = {
                            $set: {
                                [`state.player.${handIndex}.value`]: playerValue,
                                [`state.player.${handIndex}.cards`]: newPlayerCards,
                                [`state.player.${handIndex}.actions`]: addPlayerActions
                            }
                        }
                    }

                } else {
                    if( playerValue === 21 ) {
                        addPlayerActions.push("full")
                    }

                    if( contrHandEnded ) {
                        const newDealerResults = playDealerTurns(firstDealerHand.cards, 21)
    
                        let addDealerActions = [
                            ...firstDealerHand.actions,
                            ...newDealerResults.actions
                        ]

                        if( playerValue === 21 ) {
                            if( newDealerResults.value > 21 ) {
                                if( contrHand.value > 21 ) {
                                    resultMultiplier = 1
                                } else {
                                    resultMultiplier = 2
                                }
                            } else if( newDealerResults.value === 21 ) {
                                if( contrHand.value > 21 ) {
                                    resultMultiplier = 0.5
                                } else if( contrHand.value === 21 ) {
                                    resultMultiplier = 1
                                } else if( contrHand.value > newDealerResults.value && newDealerResults.value <= 21 ) {
                                    resultMultiplier = 1.5
                                } else {
                                    resultMultiplier = 0.5
                                }
                            } else {
                                if( contrHand.value > 21 ) {
                                    resultMultiplier = 1
                                } else if( contrHand.value === newDealerResults.value ) {
                                    resultMultiplier = 1.5
                                } else if( contrHand.value > newDealerResults.value && newDealerResults.value <= 21 ) {
                                    resultMultiplier = 2
                                } else {
                                    resultMultiplier = 1
                                }
                            }
                        } else {
                            if( newDealerResults.value > 21 ) {
                                if( contrHand.value > 21 ) {
                                    resultMultiplier = 1
                                } else {
                                    resultMultiplier = 2
                                }
                            } else if( newDealerResults.value === 21 ) {
                                if( contrHand.value === 21 ) {
                                    resultMultiplier = 0.5
                                } else {
                                    resultMultiplier = 0
                                }
                            } else {
                                if( playerValue > newDealerResults.value && newDealerResults.value <= 21 ) {
                                    if( contrHand.value > 21 ) {
                                        resultMultiplier = 1
                                    } else if( contrHand.value === newDealerResults.value ) {
                                        resultMultiplier = 1.5
                                    } else if( contrHand.value > newDealerResults.value && newDealerResults.value <= 21 ) {
                                        resultMultiplier = 2
                                    } else {
                                        resultMultiplier = 1
                                    }
                                } else {
                                    if( contrHand.value > 21 ) {
                                        resultMultiplier = 0
                                    } else if( contrHand.value === newDealerResults.value ) {
                                        resultMultiplier = 0.5
                                    } else if( contrHand.value > newDealerResults.value && newDealerResults.value <= 21 ) {
                                        resultMultiplier = 1
                                    } else {
                                        resultMultiplier = 0
                                    }
                                }
                            }
                        }
                        
                        
                        updateData = {
                            $set: {
                                active: false,
                                payoutMultiplier: resultMultiplier,
                                payout: Number(foundGame.amount) * resultMultiplier,
                                [`state.player.${handIndex}.value`]: playerValue,
                                [`state.player.${handIndex}.cards`]: newPlayerCards,
                                [`state.player.${handIndex}.actions`]: addPlayerActions,
                                [`state.dealer.0.cards`]: newDealerResults.cards,
                                [`state.dealer.0.value`]: newDealerResults.value,
                                [`state.dealer.0.actions`]: addDealerActions
                            }
                        }
                    } else {
                        updateData = {
                            $set: {
                                [`state.player.${handIndex}.value`]: playerValue,
                                [`state.player.${handIndex}.cards`]: newPlayerCards,
                                [`state.player.${handIndex}.actions`]: addPlayerActions
                            }
                        }
                    }

                }

        } else {

            if( playerValue > 21 ) {
                resultMultiplier = 0
                addPlayerActions.push("bust")

                updateData = {
                    $set: {
                        active: false,
                        payoutMultiplier: resultMultiplier,
                        payout: 0,
                        [`state.player.0.value`]: playerValue,
                        [`state.player.0.cards`]: newPlayerCards,
                        [`state.player.0.actions`]: addPlayerActions
                    }
                }
            } else {
                if( playerValue === 21 ) addPlayerActions.push("full")

                const newDealerResults = playDealerTurns(firstDealerHand.cards, playerValue)

                let addDealerActions = [
                    ...firstDealerHand.actions,
                    ...newDealerResults.actions
                ]

                if( newDealerResults.value === playerValue ) {
                    resultMultiplier = 1
                } else {
                    if( newDealerResults.value > playerValue && newDealerResults.value <= 21 ) {
                        resultMultiplier = 0
                    } else {
                        resultMultiplier = 2
                    }
                }

                updateData = {
                    $set: {
                        active: false,
                        payoutMultiplier: resultMultiplier,
                        payout: Number(foundGame.amount) * resultMultiplier,
                        [`state.player.0.cards`]: newPlayerCards,
                        [`state.player.0.value`]: playerValue,
                        [`state.player.0.actions`]: addPlayerActions,
                        [`state.dealer.0.cards`]: newDealerResults.cards,
                        [`state.dealer.0.value`]: newDealerResults.value,
                        [`state.dealer.0.actions`]: addDealerActions
                    }
                }
            }
        }

        

        if( resultMultiplier !== undefined ) {
            //console.log("[double]-multiplier:", resultMultiplier)

            let newAmount = calcBetPayout(foundGame.amount, user.wallet[foundGame.currency].value, resultMultiplier, foundGame.currency, true)

            const newStatisticScoped = statisticsFromMultiplier(foundGame.amount, resultMultiplier)

            const newUser = await updateUserStats(user, newStatisticScoped, newAmount, foundGame.currency)
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


const _STAND_Action = async(req, res, foundGame) => {
    try {
        const user = req.user

        let resultMultiplier

        let updateData = {}

        const firstPlayerHand = foundGame.state.player[0]
        const firstDealerHand = foundGame.state.dealer[0]

        let handIndex = 0
        if( foundGame.state.player.length === 2 ) {
            const handHasPlayed = firstPlayerHand.actions.some( action => ["bust", "full", "stand", "double"].includes(action) )
            if( handHasPlayed ) handIndex = 1
        }

        const selectedPlayerHand = foundGame.state.player[handIndex]

        let addPlayerActions = [
            ...selectedPlayerHand.actions,
            "stand"
        ]

        if( foundGame.state.player.length === 2 ) {
            const contrHand = foundGame.state.player[handIndex === 0 ? 1 : 0]
            const contrHandEnded = contrHand.actions.some( action => ["bust", "full", "stand", "double"].includes(action) )

            if( contrHandEnded ) {
                const newDealerResults = playDealerTurns(firstDealerHand.cards, 21)

                let addDealerActions = [
                    ...firstDealerHand.actions,
                    ...newDealerResults.actions
                ]
                
                if (newDealerResults.value === 21) {

                    if( contrHand.value === 21 ) {
                        resultMultiplier = 0.5
                    } else {
                        resultMultiplier = 0
                    }

                } else if (newDealerResults.value > 21) {

                    if (contrHand.value > 21) {
                        resultMultiplier = 0.5
                    } else {
                        resultMultiplier = 2
                    }

                } else {
                    // dealer is under 21

                    if( contrHand.value === 21 ) {
                        // contr hand is won in this situation

                        if( selectedPlayerHand.value > 21 ) {
                            resultMultiplier = 1
                        } else if ( selectedPlayerHand.value === 21 ) {
                            resultMultiplier = 2
                        } else if ( selectedPlayerHand.value === newDealerResults.value ) {
                            resultMultiplier = 1.5
                        } else if ( selectedPlayerHand.value > newDealerResults.value && newDealerResults.value <= 21 ) {
                            resultMultiplier = 2
                        } else {
                            resultMultiplier = 1
                        }

                    } else if( contrHand.value > 21 ) {
                        // contr hand is lost

                        if( selectedPlayerHand.value > 21 ) {
                            resultMultiplier = 0
                        } else if ( selectedPlayerHand.value === 21 ) {
                            resultMultiplier = 1
                        } else if ( selectedPlayerHand.value === newDealerResults.value ) {
                            resultMultiplier = 0.5
                        } else if ( selectedPlayerHand.value > newDealerResults.value && newDealerResults.value <= 21 ) {
                            resultMultiplier = 1
                        } else {
                            resultMultiplier = 0
                        }

                    } else {
                        // contr is under 21
                        
                        if( contrHand.value === newDealerResults.value ) {
                            if( selectedPlayerHand.value > 21 ) {
                                resultMultiplier = 0.5
                            } else if ( selectedPlayerHand.value === 21 ) {
                                resultMultiplier = 1.5
                            } else if ( selectedPlayerHand.value === newDealerResults.value ) {
                                resultMultiplier = 1
                            } else if ( selectedPlayerHand.value > newDealerResults.value && newDealerResults.value <= 21 ) {
                                resultMultiplier = 1.5
                            } else {
                                resultMultiplier = 0.5
                            }
                        } else if ( contrHand.value > newDealerResults.value && contrHand.value <= 21 ) {
                            if( selectedPlayerHand.value > 21 ) {
                                resultMultiplier = 1
                            } else if ( selectedPlayerHand.value === 21 ) {
                                resultMultiplier = 2
                            } else if ( selectedPlayerHand.value === newDealerResults.value ) {
                                resultMultiplier = 1.5
                            } else if ( selectedPlayerHand.value > newDealerResults.value && newDealerResults.value <= 21 ) {
                                resultMultiplier = 2
                            } else {
                                resultMultiplier = 1
                            }
                        } else {
                            if( selectedPlayerHand.value > 21 ) {
                                resultMultiplier = 0
                            } else if ( selectedPlayerHand.value === 21 ) {
                                resultMultiplier = 1
                            } else if ( selectedPlayerHand.value === newDealerResults.value ) {
                                resultMultiplier = 0.5
                            } else if ( selectedPlayerHand.value > newDealerResults.value && newDealerResults.value <= 21 ) {
                                resultMultiplier = 1
                            } else {
                                resultMultiplier = 0
                            }
                        }

                    }
                }
                

                updateData = {
                    $set: {
                        active: false,
                        payoutMultiplier: resultMultiplier,
                        payout: Number(foundGame.amount) * resultMultiplier,
                        [`state.player.${handIndex}.actions`]: addPlayerActions,
                        [`state.dealer.0.cards`]: newDealerResults.cards,
                        [`state.dealer.0.value`]: newDealerResults.value,
                        [`state.dealer.0.actions`]: addDealerActions
                    }
                }
            } else {
                updateData = {
                    $set: {
                        [`state.player.${handIndex}.actions`]: addPlayerActions
                    }
                }
            }
            
        } else {
            const newDealerResults = playDealerTurns(firstDealerHand.cards, firstPlayerHand.value)

            let addDealerActions = [
                ...firstDealerHand.actions,
                ...newDealerResults.actions
            ]

            if( newDealerResults.value === firstPlayerHand.value ) {
                resultMultiplier = 1
            } else {

                if( newDealerResults.value > firstPlayerHand.value && newDealerResults.value <= 21 ) {
                    resultMultiplier = 0
                } else {
                    resultMultiplier = 2
                }
            }

            updateData = {
                $set: {
                    active: false,
                    payoutMultiplier: resultMultiplier,
                    payout: Number(foundGame.amount) * resultMultiplier,
                    [`state.player.0.actions`]: addPlayerActions,
                    [`state.dealer.0.cards`]: newDealerResults.cards,
                    [`state.dealer.0.value`]: newDealerResults.value,
                    [`state.dealer.0.actions`]: addDealerActions
                }
            }
        }

        

        if( resultMultiplier !== undefined ) {
            //console.log("[stand]-multiplier:", resultMultiplier)

            let newAmount = calcBetPayout(foundGame.amount, user.wallet[foundGame.currency].value, resultMultiplier, foundGame.currency, true)

            const newStatisticScoped = statisticsFromMultiplier(foundGame.amount, resultMultiplier)

            const newUser = await updateUserStats(user, newStatisticScoped, newAmount, foundGame.currency)
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

const _HIT_Action = async(req, res, foundGame) => {
    try {
        const user = req.user

        let resultMultiplier

        const hitCard = {
            suit: getRandomItew(cardSuits),
            rank: getRandomItew(cardRanks)
        }

        let updateData = {}

        const firstPlayerHand = foundGame.state.player[0]
        const firstDealerHand = foundGame.state.dealer[0]

        let handIndex = 0
        if( foundGame.state.player.length === 2 ) {
            const handHasPlayed = firstPlayerHand.actions.some( action => ["bust", "full", "stand", "double"].includes(action) )
            if( handHasPlayed ) handIndex = 1
        }

        const selectedPlayerHand = foundGame.state.player[handIndex]
        

        const newPlayerCards = [
            ...selectedPlayerHand.cards,
            hitCard
        ]
        const playerValue = calcCardsValue(newPlayerCards)

        if( playerValue > 21 ) {
            // player lost here

            const newPlayerActions = [
                ...selectedPlayerHand.actions,
                "hit",
                "bust"
            ]
            
            if( foundGame.state.player.length === 2 ) {

                const contrHand = foundGame.state.player[handIndex === 0 ? 1 : 0]
                const contrHandBust = contrHand.actions.includes("bust")
                const contrHandFull = contrHand.actions.includes("full")
                const contrHandStand = contrHand.actions.includes("stand")
                const contrHandDouble = contrHand.actions.includes("double")


                if( contrHandBust ) {
                    // both lost here
                    resultMultiplier = 0

                    updateData = {
                        $set: {
                            active: false,
                            payoutMultiplier: resultMultiplier,
                            payout: 0,
                            [`state.player.${handIndex}.value`]: playerValue,
                            [`state.player.${handIndex}.cards`]: newPlayerCards,
                            [`state.player.${handIndex}.actions`]: newPlayerActions
                        }
                    }
                } else if ( contrHandFull || contrHandStand || contrHandDouble ) {
                    // other hand is 21 or lower
                    const newDealerResults = playDealerTurns(firstDealerHand.cards, 21)

                    let addDealerActions = [
                        ...firstDealerHand.actions,
                        ...newDealerResults.actions
                    ]
                    
                    if( newDealerResults.value === 21 ) {
                        if( contrHand.value === 21 ) {
                            resultMultiplier = 0.5
                        } else {
                            resultMultiplier = 0
                        }
                    } else if ( newDealerResults.value > 21 ) {
                        resultMultiplier = 1
                    } else {
                        if( contrHand.value === newDealerResults.value ) {
                            resultMultiplier = 0.5
                        } else if( contrHand.value > newDealerResults.value && newDealerResults.value <= 21 ) {
                            resultMultiplier = 1
                        } else {
                            resultMultiplier = 0
                        }
                    }

                    updateData = {
                        $set: {
                            active: false,
                            payoutMultiplier: resultMultiplier,
                            payout: Number(foundGame.amount) * resultMultiplier,
                            [`state.player.${handIndex}.value`]: playerValue,
                            [`state.player.${handIndex}.cards`]: newPlayerCards,
                            [`state.player.${handIndex}.actions`]: newPlayerActions,
                            [`state.dealer.0.cards`]: newDealerResults.cards,
                            [`state.dealer.0.value`]: newDealerResults.value,
                            [`state.dealer.0.actions`]: addDealerActions
                        }
                    }
                } else {
                    updateData = {
                        $set: {
                            [`state.player.${handIndex}.value`]: playerValue,
                            [`state.player.${handIndex}.cards`]: newPlayerCards,
                            [`state.player.${handIndex}.actions`]: newPlayerActions
                        }
                    }
                }

            } else {
                resultMultiplier = 0
                updateData = {
                    $set: {
                        active: false,
                        payoutMultiplier: resultMultiplier,
                        payout: 0,
                        [`state.player.${handIndex}.value`]: playerValue,
                        [`state.player.${handIndex}.cards`]: newPlayerCards,
                        [`state.player.${handIndex}.actions`]: newPlayerActions
                    }
                }
            }

            
        } else if ( playerValue === 21 ) {
            
            let addPlayerActions = [
                ...selectedPlayerHand.actions,
                "hit",
                "full"
            ]


            if( foundGame.state.player.length === 2 ) {
                const contrHand = foundGame.state.player[handIndex === 0 ? 1 : 0]
                const contrHandEnded = contrHand.actions.some( action => ["bust", "full", "stand", "double"].includes(action) )

                if ( contrHandEnded ) {
                    const newDealerResults = playDealerTurns(firstDealerHand.cards, 21)

                    let addDealerActions = [
                        ...firstDealerHand.actions,
                        ...newDealerResults.actions
                    ]
                    
                    if( newDealerResults.value === 21 ) {
                        if( contrHand.value > 21 ) {
                            resultMultiplier = 0.5
                        } else if( contrHand.value === 21 ) {
                            resultMultiplier = 1
                        } else if( contrHand.value > newDealerResults.value && newDealerResults.value <= 21 ) {
                            resultMultiplier = 1.5
                        } else {
                            resultMultiplier = 0.5
                        }
                    } else if ( newDealerResults.value > 21 ) {
                        if( contrHand.value > 21 ) {
                            resultMultiplier = 1
                        } else {
                            resultMultiplier = 2
                        }
                    } else {
                        if( contrHand.value > 21 ) {
                            resultMultiplier = 1
                        } else if( contrHand.value === newDealerResults.value ) {
                            resultMultiplier = 1.5
                        } else if( contrHand.value > newDealerResults.value && newDealerResults.value <= 21 ) {
                            resultMultiplier = 2
                        } else {
                            resultMultiplier = 1
                        }
                    }

                    updateData = {
                        $set: {
                            active: false,
                            payoutMultiplier: resultMultiplier,
                            payout: Number(foundGame.amount) * resultMultiplier,
                            [`state.player.${handIndex}.value`]: playerValue,
                            [`state.player.${handIndex}.cards`]: newPlayerCards,
                            [`state.player.${handIndex}.actions`]: addPlayerActions,
                            [`state.dealer.0.cards`]: newDealerResults.cards,
                            [`state.dealer.0.value`]: newDealerResults.value,
                            [`state.dealer.0.actions`]: addDealerActions
                        }
                    }
                } else {
                    updateData = {
                        $set: {
                            active: true,
                            [`state.player.${handIndex}.value`]: playerValue,
                            [`state.player.${handIndex}.cards`]: newPlayerCards,
                            [`state.player.${handIndex}.actions`]: addPlayerActions
                        }
                    }
                }

            } else {
                const newDealerResults = playDealerTurns(firstDealerHand.cards, playerValue)

                let addDealerActions = [
                    ...firstDealerHand.actions,
                    ...newDealerResults.actions
                ]

                if( newDealerResults.value === 21 ) {
                    resultMultiplier = 1
                } else {
                    resultMultiplier = 2
                }

                updateData = {
                    $set: {
                        active: false,
                        payoutMultiplier: resultMultiplier,
                        payout: Number(foundGame.amount) * resultMultiplier,
                        [`state.player.${handIndex}.value`]: playerValue,
                        [`state.player.${handIndex}.cards`]: newPlayerCards,
                        [`state.player.${handIndex}.actions`]: addPlayerActions,
                        [`state.dealer.0.cards`]: newDealerResults.cards,
                        [`state.dealer.0.value`]: newDealerResults.value,
                        [`state.dealer.0.actions`]: addDealerActions
                    }
                }
            }

        } else {

            let addPlayerActions = [
                ...selectedPlayerHand.actions,
                "hit"
            ]

            updateData = {
                $set: {
                    [`state.player.${handIndex}.value`]: playerValue,
                    [`state.player.${handIndex}.cards`]: newPlayerCards,
                    [`state.player.${handIndex}.actions`]: addPlayerActions,
                }
            }
        }
        

        if( resultMultiplier !== undefined ) {
            //console.log("[hit]-multiplier:", resultMultiplier)

            let newAmount = calcBetPayout(foundGame.amount, user.wallet[foundGame.currency].value, resultMultiplier, foundGame.currency, true)

            const newStatisticScoped = statisticsFromMultiplier(foundGame.amount, resultMultiplier)

            const newUser = await updateUserStats(user, newStatisticScoped, newAmount, foundGame.currency)
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

module.exports = {
    createBlackjackBet,
    handleBlackjackNext,
    getActiveBlackjackBet
}