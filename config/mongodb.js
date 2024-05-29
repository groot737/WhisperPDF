const mongoose  = require('mongoose')

const dataSchema =  new mongoose.Schema({
    sessionId: {
        type: String,
    },
    userId: {
        type: String
    },
    deviceInfo: {
        type: String,
    },
    ipAddress: {
        type: String
    },
    allowance: {
        type: String
    }
})

const User = mongoose.model('User', dataSchema)
module.exports = {User}