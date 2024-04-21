const express = require('express')
const router = express.Router()

const authJwt = require('../middlewares/authJwt')
const { createMinesBet, handleMinesNextMove, handleMinesCashout, getActiveMinesBet } = require('../games/mines')
const { createVaultDeposit, createVaultWithdraw } = require('../middlewares/vault')
const { getConversionRates } = require('../middlewares/currencyConversionRate')
const { getMyBetsList, getNotificationsList, createWithdrawal, getUserDetails, getDepositList, getWithdrawalList, handleSendTipMeta, handleSendTip } = require('../middlewares/extras')
const { createLimboBet } = require('../games/limbo')
const { createDiceRoll } = require('../games/dice')
const { createKenoBet } = require('../games/keno')
const { createBlackjackBet, handleBlackjackNext, getActiveBlackjackBet } = require('../games/blackjack')
const { createHiloBet, handleHiloNext, getActiveHiloBet, handleHiloCashout } = require('../games/hilo')



router.post( '/graphql', authJwt, async (req, res) => {
    try {
        const { query } = req.body

        if ( query === 'minesBet' ) {
            createMinesBet(req, res)
            return
        } else if ( query === 'minesNext' ) {
            handleMinesNextMove(req, res)
            return
        } else if ( query === 'minesCashout' ) {
            handleMinesCashout(req, res)
            return
        } else if ( query === 'minesActiveBet' ) {
            getActiveMinesBet(req, res)
            return
        } else if ( query === 'limboBet' ) {
            createLimboBet(req, res)
            return
        } else if( query === 'diceRoll' ) {
            createDiceRoll(req, res)
            return
        } else if ( query === 'kenoBet' ) {
            createKenoBet(req, res)
            return
        } else if ( query === 'blackjackBet' ) {
            createBlackjackBet(req, res)
            return
        } else if ( query === 'blackjackNext' ) {
            handleBlackjackNext(req, res)
            return
        } else if ( query === 'blackjackActiveBet' ) {
            getActiveBlackjackBet(req, res)
            return
        } else if ( query === 'hiloBet' ) {
            createHiloBet(req, res)
            return
        } else if ( query === 'hiloNext' ) {
            handleHiloNext(req, res)
            return
        } else if ( query === 'hiloCashout' ) {
            handleHiloCashout(req, res)
            return
        } else if ( query === 'hiloActiveBet' ) {
            getActiveHiloBet(req, res)
            return
        } else if ( query === 'createVaultDeposit' ) {
            createVaultDeposit(req, res)
            return
        } else if ( query === 'createVaultWithdrawal' ) {
            createVaultWithdraw(req, res)
            return
        } else if ( query === 'createWithdrawal' ) {
            createWithdrawal(req, res)
            return
        } else if ( query === 'currencyConversionRate' ) {
            getConversionRates(req, res)
            return
        } else if ( query === 'myBetList' ) {
            getMyBetsList(req, res)
            return
        } else if ( query === 'notificationList' ) {
            getNotificationsList(req, res)
            return
        } else if ( query === 'userDetails' ) {
            getUserDetails(req, res)
            return
        } else if ( query === 'depositList' ) {
            getDepositList(req, res)
            return
        } else if ( query === 'withdrawalList' ) {
            getWithdrawalList(req, res)
            return 
        } else if ( query === 'sendTip' ) {
            handleSendTip(req, res)
            return
        } 

        res.status(400).json({ message: 'Request invalid' })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

module.exports = router