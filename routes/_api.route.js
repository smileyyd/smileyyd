const express = require('express')
const router = express.Router()

const authJwt = require('../middlewares/authJwt')
const { createMinesBet, handleMinesNextMove, handleMinesCashout } = require('../games/mines')
const { createVaultDeposit, createVaultWithdraw } = require('../middlewares/vault')


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
        } else if ( query === 'createVaultDeposit' ) {
            createVaultDeposit(req, res)
            return
        } else if ( query === 'createVaultWithdrawal' ) {
            createVaultWithdraw(req, res)
            return
        }

        res.status(400).json({ message: 'Request invalid' })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

module.exports = router