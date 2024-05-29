const mongoose  = require('mongoose')

const dataSchema =  new mongoose.Schema({
    sessionId: {
        type: String,
    },
    userId: {
        type: String
    },
    deviceName: {
        type: String,
    },
    browserName: {
        type: String
    },
    ipAddress: {
        type: String
    },
    allowance: {
        type: Boolean
    }
})

const User = mongoose.model('User', dataSchema)
module.exports = {dataSchema}