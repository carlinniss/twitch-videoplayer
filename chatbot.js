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
    channels: [process.env.CHANNEL]
})

Bot.on('join', channel => {
    console.log(`Joined channel: ${channel}`)
})

Bot.on('message', chatter => {
    //console.log(chatter);
    let user_input = chatter.message.toLowerCase();
    Con.query("SELECT * FROM player.emote_count", function (err, rows, fields) {
        rows.forEach(function(row) {
            //console.log(row.emote);
            if (user_input.includes(row.emote.toLowerCase())){
                console.log('emote match');
                var sql = "update emote_count set count=count+1 where emote = ?"
                var values = [row.emote];
                sql = mysql.format(sql, values);
                Con.query(sql, function (err, rows, fields) {
                })
                var sql = "select * from emote_count where emote = ?"
                var values = [row.emote];
                sql = mysql.format(sql, values);
                Con.query(sql, function (err, rows, fields) {
                    console.log(rows);
                    Bot.say(row.emote + " has been used "+rows[0].count + " times in chat");
                })
            }
        });
    });


    if(user_input.includes('!commands') || user_input.includes("!help")) {
        Bot.say ("!sr (request) | !sl song list | !slaps video is good | !sucks vote video bad | !song current song | !delete (number)")
    }

        if(user_input.includes('!yt') || user_input.includes('!sr')) {

        //parse if url is in query, if so just grab the query string (particularly the video_id in v)
        if (chatter.message.includes('youtube.com') || chatter.message.includes('youtu.be')) {
            params = chatter.message.substr(chatter.message.indexOf(' ')+1);
            params = strip_yt(params);
            //console.log("url search: "+params)
            yt_search(params);
        }
        else if (chatter.message === "!sr"){
            Bot.say ("!sr (yt link or search term)")
        }
        else{
            // OR just send the whole query to the search
            search = user_input.split('!sr')[1];
            params = search.trim();
            yt_search(params);
        }
    }

    //song list -- !sl
    if(user_input === '!sl') {
        Con.query("SELECT * FROM player.songs order by id asc limit 1,8;", function (err, rows, fields) {
            rows.forEach(function(row) {
                //console.log(row.song_name);
                Bot.say(row.id + " - " + row.song_name)
            });
        });
    }

    if(user_input === '!clear') {
        if (is_mod() === true) {
            Con.query("delete from songs", function (err, rows, fields) {
                Bot.say("queue cleared");
            });
        }
        else{
            Bot.say("You aren't a mod");
        }
    }

    //slaps voting -- !slaps
    if(user_input.includes('!slaps')) {
        Con.query("SELECT song_name, video_id, user_requested FROM player.songs order by id asc limit 1", function (err, rows, fields) {
            var sql = "insert into slaps (song_name, video_id, user_requested, time) VALUES (?,?,?,NOW())";
            var values = [rows[0].song_name, rows[0].video_id, chatter.username]
            sql = mysql.format(sql, values);
            Con.query(sql, function (error, results, fields) {
                if (error) throw error;
                //console.log("Slaps inserted");
            });
            Bot.say(chatter.display_name + " voted that this video SLAPS!");
        });
    }

    //slaps voting -- sucks
    if(user_input.includes('!sucks')) {
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
    if(user_input.includes('!song') || chatter.message.includes('!playing') || chatter.message.includes('!current')) {
        Con.query("SELECT * FROM player.songs order by id asc limit 1;", function (err, rows, fields) {
            rows.forEach(function(row) {
                //console.log(row.song_name);
                Bot.say(row.id + " - " + row.song_name+" requested by "+row.user_requested)
            });
        });
    }

    //delete song, should work for mods only
    if(user_input.includes('!delete')) {
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
        if (chatter.username === process.env.CHANNEL || chatter.mod !== false )  {
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
                //console.log("Dupes detected");
                Bot.say('Sorry @'+user_requested+", that's already been added to the playlist.");
            }
            else{
                var sql = "insert into songs (song_name, video_id, user_requested, time) VALUES (?,?,?,NOW())";
                var values = [song_name, video_id, user_requested]
                sql = mysql.format(sql, values);
                Con.query(sql, function (error, results, fields) {
                    if (error) throw error;
                    //console.log("Song inserted");
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
            //console.log(parsed.v);
            return parsed.v;
        }
    }

    // using yt-search currently with some issues
    function yt_search(term = '', video_id){
        const ytSearch = require('yt-search');

        if (term !== '') {
            ytSearch(term, function (err, r) {
                if (err) throw err

                const videos = r.videos;

                //console.log(term);
                //console.log(videos);

                var result = [];

                videos.forEach(function(row) {
                    //console.log(term);
                    //console.log(row);
                   if (term === row.videoId){
                       result['videoId'] = row.videoId;
                       result['title'] = row.title;
                       console.log(result);
                   }

                })

                if (Object.keys(result).length === 0){
                    result = videos[0];
                }
                //console.log(result);

                if (result === undefined) {
                    Bot.say("Sorry, can't get that video from YT! Try !sr (search term) instead of the URL");
                }
                else {
                    Bot.say('video requested: ' + result.title + " by " + chatter.display_name);
                    add_yt_song(result.videoId, result.title, chatter.display_name);
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
        if (typeof result !== 'undefined' || result === '') {
            if (result[0].songs_left > 0) {
                Con.query("SELECT * FROM songs order by id asc limit 1;", function (err, result, fields) {
                    if (err) throw err;
                    //console.log(result);
                    var template = fs.readFileSync('player.html', 'utf8');
                    var rendered = Mustache.render(template, {
                        song_name: result[0].song_name,
                        video_id: result[0].video_id,
                        user_requested: result[0].user_requested,
                        channel: process.env.CHANNEL
                    });
                    res.send(rendered);
                });
            }
            else{
                res.sendFile('/Users/carli/WebstormProjects/twitchplayer/public/no_mo.html');
            }
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
        //console.log(result);
        res.json(result);
    });
})


app.get('/song_list', function (req, res) {
    Con.query("select count(*) as songs_left from songs", function (err, result, fields) {
        //console.log(result[0].songs_left);
        if (result[0].songs_left > 0) {
            Con.query("SELECT id,song_name FROM player.songs order by id asc limit 1,5", function (err, result, fields) {
                if (err) throw err;
                //console.log(result);
                res.json(result);
            });
        }
    });
})

app.get('/next_song', function (req, res) {
    Con.query("SELECT count(*) as video_count FROM player.songs", function (err, result, fields) {
        //console.log('vid count' + result[0].video_count);
        count = result[0].video_count;

        //console.log("count "+count);

        if (count > 1) {
            Con.query("SELECT id, video_id, song_name,user_requested FROM player.songs order by id asc limit 1", function (err, result, fields) {
                delete_song(result[0].id, true);
                Con.query("SELECT id, video_id, song_name,user_requested FROM player.songs order by id asc limit 1", function (err, result, fields) {
                    res.json(result);
                    Bot.say("Now playing "+result[0].song_name+" requested by @"+result[0].user_requested);
                })
            })
        }
        else{
            Con.query("SELECT id, video_id, song_name,user_requested FROM player.songs order by id asc limit 1", function (err, result, fields) {
                delete_song(result[0].id, true);
                data = {
                    id: 0,
                    response: "Empty"
                }
                res.json(data);
            })
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
    //console.log('mod');
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