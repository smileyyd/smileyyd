const db = require("../models")
const Games = db.games

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

module.exports = {
    getMyBetsList
}