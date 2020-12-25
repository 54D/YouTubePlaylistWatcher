/* Setup */

// Debug mode
const DEBUG_MODE: boolean = true;

// axios
import axios, { AxiosResponse } from 'axios';
// discord.js
import discord, { Client } from 'discord.js';
const client: Client = new discord.Client();
// fs
import fs from 'fs';
// json-diff
import jsondiff from 'json-diff';
// mongoose
import mongoose, { Connection, Schema } from 'mongoose';
var db: Connection;
// node-schedule
import cron from 'node-schedule';
// Local files
import tokens from './config/token.json';
import settings from './config/settings.json';

// Data schemas & models
/*var watcherSchema = new Schema({
    userId: String,
    playlistIds: [String]
});
var Watcher = mongoose.model("Watcher",watcherSchema);*/
var videoSchema = new Schema({
    apiId: String,
    videoId: String,
    publishedAt: String,
    title: String,
    description: String,
    playlistId: String
})
var Video = mongoose.model("Video",videoSchema);
var playlistSchema = new Schema({
    playlistId: String,
    channelId: String,
    videos: [Video],
    watchers: [String]
})
var Playlist = mongoose.model("Playlist",playlistSchema);

/* Utilities */

// Fancy console logging
function logConsole(type: string,msg: string|number){
    var date: Date = new Date();
    var logMessage: string = `${date.toLocaleString()} \x1b[0m\x1b[30m`;
    if(type==`message`){
        logMessage = logMessage.concat(`\x1b[47mMSG`);
    }else if(type==`command`){
        logMessage = logMessage.concat(`\x1b[46mCMD`);
    }else if(type===`info`){
        logMessage = logMessage.concat(`\x1b[42mINF`);
    }else if(type===`debug`&&DEBUG_MODE){
        logMessage = logMessage.concat(`\x1b[44mDBG`);
	}else if(type===`warn`){
        logMessage = logMessage.concat(`\x1b[43mWRN`);
	}else if(type===`error`){
        logMessage = logMessage.concat(`\x1b[41mERR`);
	}
    logMessage = logMessage.concat(`\x1b[0m \x1b[37m${msg}`);
    console.log(logMessage);
}

// URL encoder
function encodeURL(data: any): string {
    const ret: string[] = [];
    for(let d in data){
        ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]));
    }
    return ret.join('&');
}



/* Bigger utilities */

// Specialized YouTube API call (get playlist items)
function getPlaylistItems(playlistId: string): Promise<AxiosResponse>{
    var url: string = "https://www.googleapis.com/youtube/v3/playlistItems";
    return axios.get(url,{
        params:{
            key: tokens.youtube.api.key,
            part: "snippet",
            maxResults: 50,
            playlistId: playlistId
        }
    });
}

// Add a playlist to a user's watch list
async function watchPlaylist(userId: string,playlist:any) {
    var playlistId = playlist[0].snippet.playlistId;
    var channelId = playlist[0].snippet.channelId;

    return new Promise((resolve,reject) => {

        Playlist.findOne({
            playlistId: playlistId
        }).then(result=>{
            if(result===null){
                /* this needs work */
                /* TODO: Warning: accessing db may result in auth fail!! */
                var playlist = new Playlist({
                    playlistId: playlistId,
                    channelId: channelId,
                    videos: [Video],
                    watchers: [userId]
                });
                watcher.save((error)=>{
                    if(error){
                        logConsole("error",error.message);
                    }else{
                        resolve("You are now watching this playlist.");
                    }
                });
            }else{
                var watcherIds: [string] = result!.get("watchers");
                if(watcherIds.includes(userId)){
                    reject("You are already watching this playlist.");
                }else{
                    watcherIds.push(userId);
                    result.set("watchers",watcherIds);
                    const res = Playlist.updateOne({
                        playlistId: playlistId
                    },result,[],(err,res)=>{
                        if(err){
                            logConsole("error",err.message);
                            reject("An unexpected error occured while updating a watch list.");
                        }else{
                            resolve("You are now watching this playlist.");
                        }
                    });
                }
            }
        });


        /*Watcher.findOne({
            userId: userId
        }).then(user=>{
            if(user===null){
                var watcher = new Watcher({
                    userId: userId,
                    playlistIds: [playlistId]
                });
                watcher.save((error)=>{
                    if(error){
                        logConsole("error",error.message);
                    }else{
                        resolve("You are now watching this playlist.");
                    }
                });
            }else{
                var playlistIds: [string] = user!.get("playlistIds");
                if(playlistIds.includes(playlistId)){
                    reject("You are already watching this playlist.");
                }else{
                    playlistIds.push(playlistId);
                    user.set("playlistIds",playlistIds);
                    const res = Watcher.updateOne({
                        userId: userId
                    },user,[],(err,res)=>{
                        if(err){
                            logConsole("error",err.message);
                            reject("An unexpected error occured while updating a watch list.");
                        }else{
                            resolve("You are now watching this playlist.");
                        }
                    });
                }
            }
        });*/

    });
}

// Playlist change processing
function processPlaylistsChanges(){
    // stuff
}



/* Initialization */

// Open database connection
var query: string = encodeURL({
    "authSource": settings.mongodb.auth_source,
    "appname": settings.mongodb.app_name,
    "ssl": settings.mongodb.ssl,
});
mongoose.connect(
    `mongodb://`+
    `${settings.mongodb.username}:${settings.mongodb.password}`+
    `@${settings.mongodb.host}:${settings.mongodb.port}`+
    `/${settings.mongodb.database}?`+
    query
    , { 
        useNewUrlParser: true,
        useUnifiedTopology: true
    }).catch( error => {
    logConsole("error",error.message);
});
db = mongoose.connection;

// Setup playlist change processing
var result: cron.Job = cron.scheduleJob(`* * * * *`,function(){
    processPlaylistsChanges();
});
if(result===null){
    logConsole("error","Something went wrong while scheduling playlist change processing.");
}else{
    logConsole("info","Successfully scheduled periodic playlist change processing.");
}
// Log in to Discord
client.login(tokens.discord.bot_token);



/* Events */

// Database connection result
client.on('error', error => {
    logConsole("error",error.message);
});
client.once('open', () => {
    logConsole("info","Connection to database established.");
});

// Discord client connection result
client.once('ready', () => {
	logConsole("info","Now listening to commands.");
});

// Discord client message listener
client.on('message', message => {

    // message logging
    var type: string = message.content.substring(0,4)==='/yt '?"command":"message";
    var location: string = message.guild===null?"(DM)":message.guild.name+"#"+(message.channel as discord.GuildChannel).name;
    var user: string = message.author.tag+"("+message.author.id+")";
    logConsole(type,user+" @ "+location+" > "+message.content);

    // process commands
    if(type!=="command") return;
    var command: string = message.content.replace(`/yt `,``);
    if(command.startsWith("watch")){
        command = command.replace(`watch `,``);
        if(command.includes(' ')){ 
            message.channel.send("Provided playlist ID is not of correct format.");
            return;
        }else{
            // Japanese:        PLCNK-7k3ZXSFpwkOkc0xWNJhU0jE4cuSG
            // see you.:        PLCNK-7k3ZXSFsa39Hl2ff4JkS_vh5gyZV
            // a private one:   PLCNK-7k3ZXSHl3YkOK5Ij7nn2GkfkK5cp
            getPlaylistItems(command)
            .then(response => {
                /*
                var data = response.data;
                var size: number = data.items.length;
                for(var i=0;i<(size>3?3:size);i++){
                    var snippet = data.items[i].snippet;
                    var publishedAt = snippet.publishedAt;
                    var channelId = snippet.channelId;
                    var title = snippet.title;
                    var playlistId = snippet.playlistId;
                    var position = snippet.position;
                    var videoId = snippet.resourceId.videoId;
                    logConsole("info",i);
                    logConsole("info","  "+publishedAt);
                    logConsole("info","  "+channelId);
                    logConsole("info","  "+title);
                    logConsole("info","  "+playlistId);
                    logConsole("info","  "+position);
                    logConsole("info","  "+videoId);
                    logConsole("info","");
                }
                */
                watchPlaylist(message.author.id,response.data.items)
                .then(success => {
                    message.channel.send(success as string);
                }).catch(error => {
                    message.channel.send(error);
                });
            }).catch(error => {
                var status: number = error.response!.status;
                switch(status){
                    case 400:
                        message.channel.send("An empty playlist ID was provided.");
                        break;
                    case 403:
                        message.channel.send("The playlist is not accessible.");
                        break;
                    case 404:
                        message.channel.send("The playlist does not exist or is not public.");
                        break;
                    default:
                        logConsole("warn","An unexpected error occured while calling YouTube API.");
                        message.channel.send("An unexpected error occured while calling YouTube API.");
                        break;
                }
            });
        }
    }
    
});

