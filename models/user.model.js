const mongoose = require('mongoose')

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    adminAccess: {
        type: Boolean,
        default: false
    },
    superAdminAccess: {
        type: Boolean,
        default: false
    },
    streamer: {
        type: Boolean,
        default: false
    },
    uuid: {
        type: String,
        required: true
    },
    ip: {
        type: String,
        default: null
    },
    statisticScoped: [
        {
            betAmount: Number,
            bets: Number,
            currency: String,
            losses: Number,
            ties: Number,
            wins: Number
        }
    ],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    wallet: {
        btc: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        eth: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        ltc: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        usdt: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        doge: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        bch: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        xrp: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        eos: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        trx: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        bnb: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        usdc: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        ape: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        busd: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        cro: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        dai: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        link: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        sand: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        shib: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        uni: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        matic: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        eur: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        jpy: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        brl: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        cad: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        ars: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        clp: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        inr: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        },
        pen: {
            value:{
                type: Number,
                default: 0
            },
            vault:{
                type: Number,
                default: 0
            }
        }
    }
})

const User = mongoose.model('User', UserSchema)

module.exports = User