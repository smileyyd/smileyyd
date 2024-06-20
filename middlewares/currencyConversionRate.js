const currenciesDb = require('../currenciesDb.json')

let currencyConversionRates = {
    "btc": {
        "usd": 64950
    },
    "eth": {
        "usd": 3514.99
    },
    "ltc": {
        "usd": 74.65
    },
    "usdt": {
        "usd": 0.99937
    },
    "doge": {
        "usd": 0.124501
    },
    "bch": {
        "usd": 389.66
    },
    "xrp": {
        "usd": 0.488794
    },
    "eos": {
        "usd": 0.569832
    },
    "trx": {
        "usd": 0.1168
    },
    "bnb": {
        "usd": 590.83
    },
    "usdc": {
        "usd": 0.999877
    },
    "ape": {
        "usd": 0.920548
    },
    "busd": {
        "usd": 0.99513
    },
    "cro": {
        "usd": 0.094015
    },
    "dai": {
        "usd": 0.999401
    },
    "link": {
        "usd": 14.3
    },
    "sand": {
        "usd": 0.00085123
    },
    "shib": {
        "usd": 0.00001813
    },
    "uni": {
        "usd": 10.12
    },
    "matic": {
        "usd": 0.575319
    }
}

const fetchCurrencyConversionRates = async () => {
    const coinsWithIds = currenciesDb.filter( c => !!c.id )
    const joinedCurrencyIds = coinsWithIds.map( c => c.id).join(',')

    fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${joinedCurrencyIds}&vs_currencies=usd`)
        .then( res => res.json() )
        .then( conversionRates => {
            console.log('conversionRates:', conversionRates)
            const coinsWithSymbols = {}
            coinsWithIds.forEach( c => {
                coinsWithSymbols[c.symbol] = conversionRates[c.id]
            } )
            currencyConversionRates = coinsWithSymbols
        } )
        .catch( err => {
            console.log("failed to fetch currencies:", err.message)
        } )
}

const startConversionRateInterval = () => {
    //fetchCurrencyConversionRates()
    setInterval( () => {
        //fetchCurrencyConversionRates()
    },180000 )
}



const getConversionRates = async (req, res) => {
    if(!currencyConversionRates) {
        const coinsWithIds = currenciesDb.filter( c => !!c.id )
        const joinedCurrencyIds = coinsWithIds.map( c => c.id).join(',')
    
        const exRates = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${joinedCurrencyIds}&vs_currencies=usd`)
            .then( res => res.json() )
            .then( conversionRates => {
                const coinsWithSymbols = {}
                coinsWithIds.forEach( c => {
                    coinsWithSymbols[c.symbol] = conversionRates[c.id]
                } )
                return coinsWithSymbols
            } )
            .catch( () => null )

        if(!exRates) return res.status(400).send({message: 'Could not get currency exchange rates'})
        res.status(200).send({currencies: exRates})
    }

    return res.status(200).send({currencies: currencyConversionRates})
}


module.exports = {
    fetchCurrencyConversionRates,
    getConversionRates,
    startConversionRateInterval
}