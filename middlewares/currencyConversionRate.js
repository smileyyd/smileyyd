const currenciesDb = require('../currenciesDb.json')

let currencyConversionRates

const fetchCurrencyConversionRates = async () => {
    const coinsWithIds = currenciesDb.filter( c => !!c.id )
    const joinedCurrencyIds = coinsWithIds.map( c => c.id).join(',')

    fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${joinedCurrencyIds}&vs_currencies=usd`)
        .then( res => res.json() )
        .then( conversionRates => {
            const coinsWithSymbols = {}
            coinsWithIds.forEach( c => {
                coinsWithSymbols[c.symbol] = conversionRates[c.id]
            } )
            currencyConversionRates = coinsWithSymbols
        } )
}

const startConversionRateInterval = () => {
    fetchCurrencyConversionRates()
    setInterval( () => {
        fetchCurrencyConversionRates()
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