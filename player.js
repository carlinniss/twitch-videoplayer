const TwitchBot = require('twitch-bot')
const express = require('express')
const app = express()
const port = 420



const Bot = new TwitchBot({
    username: 'Kappa_Bot',
    oauth: 'oauth:le2ttvrt4x08snhr6bhhdgcbnvq7cs',
    channels: ['dtldagod']
})

Bot.on('join', channel => {
    console.log(`Joined channel: ${channel}`)
})

Bot.on('message', chatter => {
    if(chatter.message.includes('!sr')) {
        params = chatter.message.substr(chatter.message.indexOf(' ')+1);

        const ytSearch = require('yt-search');

        ytSearch( params, function ( err, r ) {
            if ( err ) throw err

            const videos = r.videos
            const playlists = r.playlists
            const accounts = r.accounts

            const firstResult = videos[ 0 ]

            console.log( firstResult )
            Bot.say('song requested: '+firstResult.title);
            //todo: use rest to set title, song, etc and store in session in express
        } )
    }
})

//use sessions to save video data
var session = require('express-session')
app.use(session({ secret: 'keyboard cat', cookie: { maxAge: 60000 }}))

app.get('/set_title', function (req, res) {
    res.send(req.session.title)
})

app.listen(port, () => console.log(`Example app listening on port ${port}!`))