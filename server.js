const express = require('express')
const fs = require('fs')
const app = express()
const http = require('https')
const cors = require('cors')
const bodyParser = require('body-parser')
const cookieParser = require( 'cookie-parser' )
const db = require("./models")
const config = require('./config')
const socketEvents = require('./sockets')
const { startConversionRateInterval } = require('./middlewares/currencyConversionRate')

const httpServerOptions = {
    cert: fs.readFileSync('antzax_dev.crt'),
    ca: fs.readFileSync('antzax_dev.ca-bundle'),
    key: fs.readFileSync('antzax.dev.key')
}

const httpServer = http.createServer(httpServerOptions, app)

db.mongoose.set('strictQuery', false)

db.mongoose
    .connect(config.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    })
    .then(async () => {
        console.log(`Successfully connected to MongoDB.`)

        initServer()
    })
    .catch((error) => {
        console.log(`Error connecting to MongoDB: ${error.message}`)
    })

process.on('SIGINT', () => {
    db.mongoose.connection.close(() => {
        console.log(`MongoDB connection closed due to application termination.`)
        process.exit(0)
    })
})

const initServer = () => {
    console.log(`Initializing servers.`)

    const io = require('socket.io')(httpServer, {
        cors: {
            origin: [config.CLIENT_URL, "http://localhost:3000"],
            methods: ["GET", "POST"]
        }
    })
    //io.use(encrypt(encryptionOpts))

    io.on('connection', socketEvents(io))

    const corsOptions = {
        "origin": [config.CLIENT_URL, "http://localhost:3000"],
        "methods": ['POST', 'PATCH', 'PUT', 'GET', 'OPTIONS', 'HEAD', 'DELETE'],
        "credentials": true,
        "preflightContinue": false,
        "optionsSuccessStatus": 204,
        "exposedHeaders": ["set-cookie"]
    }

    app.use((req, res, next) => {
        req.io = io
        next()
    })

    app.set( 'trust proxy', false )
    app.use( /*express.text(),*/ express.json() )
    app.use( bodyParser.urlencoded({ extended: true }) )
    app.use( cookieParser() )
    app.use( cors(corsOptions) )
    app.use( express.static( __dirname + '/public' ) )

    const authRoute = require('./routes/auth.route')
    const adminRoute = require('./routes/admin.route')
    const _apiRoute = require('./routes/_api.route')

    app.use( '/auth', authRoute )
    app.use( '/admin', adminRoute )
    app.use( '/_api', _apiRoute )

    httpServer.listen( config.PORT, () => {
        console.log(`Listening on port ${config.PORT}.`)
    })
}


startConversionRateInterval()