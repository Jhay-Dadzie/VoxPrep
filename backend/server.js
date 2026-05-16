import express from 'express'

const PORT = 5050
const app = express()

app.listen((req, res) => {
    console.log(`App is listening on port ${PORT}`)
})