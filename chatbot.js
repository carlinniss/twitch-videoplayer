require('dotenv').config();
const TwitchBot = require('twitch-bot');
const Mustache = require('mustache');
const QueryString = require('query-string');
var mysql = require('mysql');
var fs = require('fs');

const express = require('express')
const app = express()
const port = 420

app.use(express.static('public'))

var $ = require('jQuery');

const Con = mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PW,
    database: "player",
    charset: 'utf8mb4'
});
Con.connect();
const Bot = new TwitchBot({
    username: 'dtldagodstudbot',
    oauth: process.env.OAUTH,
    channels: ['dtl_da_god']
})

Bot.on('join', channel => {
    console.log(`Joined channel: ${channel}`)
})

Bot.on('message', chatter => {
    console.log(chatter);
    if(chatter.message.includes('!yt') || chatter.message.includes('!sr')) {

        //parse if url is in query, if so just grab the query string (particularly the video_id in v)
        if (chatter.message.includes('youtube.com') || chatter.message.includes('youtu.be')) {
            params = chatter.message.substr(chatter.message.indexOf(' ')+1);
            params = strip_yt(params);
            yt_search(params, true);
        }
        else if (chatter.message === "!sr"){
            Bot.say ("!sr (yt link or search term)")
        }
        else{
            // OR just send the whole query to the search
            search = chatter.message.split('!sr')[1];
            params = search.trim();
            yt_search(params, false);
        }
    }

    //song list -- !sl
    if(chatter.message === '!sl') {
        Con.query("SELECT * FROM player.songs order by id asc limit 1,5;", function (err, rows, fields) {
            rows.forEach(function(row) {
                console.log(row.song_name);
                Bot.say(row.id + " - " + row.song_name)
            });
        });
    }

    //slaps voting -- !slaps
    if(chatter.message.includes('!slaps')) {
        Con.query("SELECT song_name, video_id, user_requested FROM player.songs order by id asc limit 1", function (err, rows, fields) {
            var sql = "insert into slaps (song_name, video_id, user_requested, time) VALUES (?,?,?,NOW())";
            var values = [rows[0].song_name, rows[0].video_id, chatter.username]
            sql = mysql.format(sql, values);
            Con.query(sql, function (error, results, fields) {
                if (error) throw error;
                console.log("Slaps inserted");
            });
            Bot.say(chatter.display_name + " voted that this video SLAPS!");
        });
    }

    //slaps voting -- sucks
    if(chatter.message.includes('!sucks')) {
        Con.query("SELECT song_name, video_id, user_requested FROM player.songs order by id asc limit 1", function (err, rows, fields) {
            var sql = "insert into sucks (song_name, video_id, user_requested, time) VALUES (?,?,?,NOW())";
            var values = [rows[0].song_name, rows[0].video_id, chatter.username]
            sql = mysql.format(sql, values);
            Con.query(sql, function (error, results, fields) {
                if (error) throw error;
                console.log("Sucks inserted");
            });

            Bot.say(chatter.display_name + " voted that this video SUCKS! savage.");
        });
    }

    //get current song
    if(chatter.message.includes('!song') || chatter.message.includes('!playing') || chatter.message.includes('!current')) {
        Con.query("SELECT * FROM player.songs order by id asc limit 1;", function (err, rows, fields) {
            rows.forEach(function(row) {
                console.log(row.song_name);
                Bot.say(row.id + " - " + row.song_name+" requested by "+row.user_requested)
            });
        });
    }

    //delete song, should work for mods only
    if(chatter.message.includes('!delete')) {
        if (is_mod() === true)  {
            var id = chatter.message.substr(chatter.message.indexOf(' ')+1);
            delete_song(id);
            Bot.say("Song deleted");
        }
        else{
            Bot.say("Sorry, delete is mod only");
        }
    }

    function is_mod(){
        if (chatter.username === 'dtl_da_god' || chatter.mod !== false )  {
            return true;
        }
        return false;
    }

    //add song to playlist
    function add_yt_song(video_id, song_name, user_requested){
        Con.query("select count(*) as dupes from songs where video_id = '"+ video_id +"'", function (error, results, fields) {
            if (error) throw error;
            var dupes = results[0]['dupes'];

            if (dupes > 0){
                console.log("Dupes detected");
                Bot.say('Sorry @'+user_requested+", that's already been added to the playlist.");
            }
            else{
                var sql = "insert into songs (song_name, video_id, user_requested, time) VALUES (?,?,?,NOW())";
                var values = [song_name, video_id, user_requested]
                sql = mysql.format(sql, values);
                Con.query(sql, function (error, results, fields) {
                    if (error) throw error;
                    console.log("Song inserted");
                });
            }
        });
    }

    //strip those pesky yt urls and grab video id
    function strip_yt(url){
        if (url.includes('youtu.be')) {
            return url.split("e/")[1];
        }
        else {
            parsed = QueryString.parse(url.split("?")[1])
            console.log(parsed.v);
            return parsed.v;
        }
    }

    // using yt-search currently with some issues
    function yt_search(term = '', video_id){
        const ytSearch = require('yt-search');

        if (term !== '') {
            ytSearch(term, function (err, r) {
                if (err) throw err

                const videos = r.videos
                const playlists = r.playlists
                const accounts = r.accounts

                const firstResult = videos[0]

                Bot.say('video requested: ' + firstResult.title + " by " + chatter.display_name);
                if (video_id == false) {
                    add_yt_song(firstResult.videoId, firstResult.title, chatter.display_name);
                } else {
                    add_yt_song(term, firstResult.title, chatter.display_name);
                }
            })
        }
        else{
            console.log("No query found");
        }
    }
})

//app controllers for views
app.get('/', function (req, res) {
    Con.query("select count(*) as songs_left from songs", function (err, result, fields) {
        if (result[0].songs_left > 0) {
            Con.query("SELECT * FROM songs order by id asc limit 1;", function (err, result, fields) {
                if (err) throw err;
                console.log(result);
                var template = fs.readFileSync('player.html', 'utf8');
                var rendered = Mustache.render(template, {
                    song_name: result[0].song_name,
                    video_id: result[0].video_id,
                    user_requested: result[0].user_requested
                });
                res.send(rendered);
            });
        }
        else{
            res.sendFile('/Users/carli/WebstormProjects/twitchplayer/public/no_mo.html');
        }
    });
})


app.get('/current_song', function (req, res) {
    var values = [req.params.video_id];
    sql = "SELECT * FROM player.songs order by id asc limit 1";
    sql = mysql.format(sql, values);
    Con.query(sql, function (err, result, fields) {
        if (err) throw err;
        console.log(result);
        res.json(result);
    });
})


app.get('/song_list', function (req, res) {
    Con.query("select count(*) as songs_left from songs", function (err, result, fields) {
        console.log(result[0].songs_left);
        if (result[0].songs_left > 0) {
            Con.query("SELECT id,song_name FROM player.songs order by id asc limit 1,5", function (err, result, fields) {
                if (err) throw err;
                console.log(result);
                res.json(result);
            });
        }
    });
})

app.get('/next_song', function (req, res) {
    Con.query("SELECT count(*) as video_count FROM player.songs", function (err, result, fields) {
        console.log('vid count' + result[0].video_count);
        count = result[0].video_count;
        if (count >= 1) {
            Con.query("SELECT id, video_id, song_name,user_requested FROM player.songs order by id asc limit 1", function (err, result, fields) {
                delete_song(result[0].id, true);
                Con.query("SELECT id, video_id, song_name,user_requested FROM player.songs order by id asc limit 1", function (err, result, fields) {
                    res.json(result);
                })
            })
        }
        else if (count === 0){
            data = {
                id: 0,
                response: "No more songs"
            }
            res.json(data);
        }
    });
})

app.get('/sucks/:video_id', function (req, res) {
    var sql = "SELECT count(*) as sucks_count, song_name, user_requested FROM player.sucks where video_id = ? order by id desc";
    var values = [req.params.video_id]
    sql = mysql.format(sql, values);
    Con.query(sql, function (error, results, fields) {
        if (error) throw error;
        res.send(results[0]);
    });
})

app.get('/slaps/:video_id', function (req, res) {
    var sql = "SELECT count(*) as slaps_count, song_name, user_requested FROM player.slaps where video_id = ? order by id desc";
    var values = [req.params.video_id]
    sql = mysql.format(sql, values);
    Con.query(sql, function (error, results, fields) {
        if (error) throw error;
        res.send(results[0]);
    });
})

//delete song from playlist, then calls this function
function delete_song(id,played=false){
    console.log('mod');
    if (played === true) {
        sql = "insert into player.played_songs (select * from player.songs where id = ?)";
        var values = [id];
        sql = mysql.format(sql, values);
        Con.query(sql, function (error, results, fields) {
            if (error) throw error;
            console.log("Song added to played songs");
        });
    }
    var sql = "DELETE FROM player.songs WHERE id = ? order by id asc limit 1";
    var values = [id]
    sql = mysql.format(sql, values);
    Con.query(sql, function (error, results, fields) {
        if (error) throw error;
        console.log("Video deleted");
    });
}

app.listen(port, () => console.log(`twitchplayer listening on port ${port}!`))