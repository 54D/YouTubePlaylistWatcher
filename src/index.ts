/* Setup */

// Debug mode
const DEBUG_MODE: boolean = false;

// axios
import axios, { AxiosResponse } from 'axios';
// discord.js
import discord, { Client, Message, MessageEmbed } from 'discord.js';
const client: Client = new discord.Client();
// mongoose
import mongoose, { Connection, Schema } from 'mongoose';
var db: Connection;
// node-schedule
import cron from 'node-schedule';
// Local files
import tokens from './config/token.json';
import settings from './config/settings.json';

// Data schemas & models
var videoSchema: Schema = new Schema({
    apiId       : String,
    videoId     : String,
    channelId   : String,
    publishedAt : String,
    title       : String,
    description : String,
    playlistId  : String
});
var Video = mongoose.model("Video",videoSchema);
var playlistSchema: Schema = new Schema({
    playlistId  : String,
    channelId   : String,
    videos      : {},
    watchers    : [String],
    lastUpdate  : Date
});
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

// Specialized YouTube API call -- get playlist items
async function getPlaylistItems(playlistId: string,data: AxiosResponse[] = [],nextPageKey: string = "") {
    var url: string = "https://www.googleapis.com/youtube/v3/playlistItems";
    await axios.get(url,{
        params:{
            key: tokens.youtube.api.key,
            part: "snippet",
            maxResults: 50,
            pageToken: nextPageKey,
            playlistId: playlistId
        }
    }).then(response => {
        data.push(response);
        if(response.data.nextPageToken!==undefined){
            getPlaylistItems(playlistId,data,response.data.nextPageToken); // recursion not yet done D:
        }
    });
}

// Specialized YouTube API call -- get a video
async function getVideo(videoId: string): Promise<AxiosResponse>{
    var url: string = "https://www.googleapis.com/youtube/v3/videos";
    return axios.get(url,{
        params:{
            key: tokens.youtube.api.key,
            part: "snippet",
            id: videoId
        }
    });
}

// Update playlist items
async function createPlaylist(playlist: any[],replace: boolean = false) {

    const playlistId: string = playlist[0].snippet.playlistId;
    const channelId: string = playlist[0].snippet.channelId;
    var videos: any[] = [];

    for(let i=0;i<playlist.length;i++){
        const apiId = playlist[i].id;
        const snippet = playlist[i].snippet;
        const publishedAt = snippet.publishedAt;
        const title = snippet.title;
        const description = snippet.description;
        const videoId = snippet.resourceId.videoId;
        const entry = new Video({
            apiId       : apiId,
            videoId     : videoId,
            channelId   : channelId,
            publishedAt : publishedAt,
            title       : title,
            description : description,
            playlistId  : playlistId
        });
        videos.push(entry);
    }

    return new Promise((resolve,reject) => {

        Playlist.findOne({
            playlistId: playlistId
        }).then(result=>{
            if(result===null){
                const playlist = new Playlist({
                    playlistId  : playlistId,
                    channelId   : channelId,
                    videos      : videos,
                    watchers    : [],
                    lastUpdate  : new Date()
                });
                playlist.save((error)=>{
                    if(error){
                        logConsole("error",error.message);
                        reject(error.message);
                    }else{
                        logConsole("info","Playlist "+playlistId+" has been successfully CREATED.");
                        resolve("Playlist "+playlistId+" has been successfully CREATED.");
                    }
                });
            }else if(replace){
                result.set("videos",videos);
                result.set("lastUpdate",new Date());
                const res = Playlist.updateOne({
                    playlistId: playlistId
                },result,[],(err,res)=>{
                    if(err){
                        logConsole("error","An unexpected error occured while updating a watch list.");
                        reject("An unexpected error occured while updating a watch list.");
                    }else{
                        resolve("Playlist "+playlistId+" has been successfully UPDATED.");
                    }
                });
            }else{
                resolve("Playlist "+playlistId+" already exists in database, update will occur periodically.");
            }
        });

    });

}

// Add a playlist to a user's watch list
async function watchPlaylist(userId: string,playlistId:string) {

    return new Promise((resolve,reject) => {

        Playlist.findOne({
            playlistId: playlistId
        }).then(result=>{
            if(result===null){
                logConsole("error","Database issue -- this playlist has not been recorded!");
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
        
    });
}

// Playlist change processing
async function processPlaylistsChanges(){

    return new Promise(async (resolve,reject) => {

        // set up cursor
        (await Playlist.find()).forEach(async cursor => {

            var playlistId: string = cursor.get("playlistId",String);
            var changes: any[] = [];
            var count: number = 0;

            async function chain() {
                return new Promise((resolve,reject) => {
                    resolve("OK");
                });
            }

            // detect all changes in stored playlist
            var videos: any[] = cursor.get("videos");
            for(const video of videos){
                if(video.title !== "Private video" && video.title !== "Deleted video"){
                    await getVideo(video.videoId)
                    .then(response => {
                        if(response.data.pageInfo.totalResults==0){
                            logConsole("debug","  No video was returned.");
                            changes.push(video);
                            count++;
                            logConsole("debug","Changed: " + video.videoId + "/" + video.title);
                        }else{
                            logConsole("debug","  Obtained video: " + response.data.items[0].snippet.title);
                        }
                    }).catch(error => {
                        logConsole("debug","  Error while obtaining video: " + error.message);
                        changes.push(video);
                        count++;
                        logConsole("debug","Changed: " + video.videoId + "/" + video.title);
                    });
                }
            }

            // notify all watchers
            var watchers: any[] = cursor.get("watchers",[String]);
            for(const watcher of watchers){
                await client.users.fetch(watcher)
                .then(user => {
                    logConsole("debug","Number of changes: " + count);
                    if(count>0){ 
                        logConsole("info","Changes detected in playlist "+playlistId+", notifying watcher "+user+".");
                        user.createDM()
                        .then(dmChannel => {
                            // send changes as embed
                            var embed: MessageEmbed = new MessageEmbed({
                                author: {
                                    name: "YouTube Playlist Watcher",
                                    iconURL: "https://i.gyazo.com/666945b5f0eb94b0aac7fc69e2ea8759.png"
                                },
                                description: "The following videos have been changed since YTPW last checked.\n",
                                footer: {
                                    text: "Click on the link above to visit your playlist."
                                },
                                hexColor: "#00054D",
                                title: "Playlist change notification",
                                type: "rich",
                                url: "https://www.youtube.com/playlist?list="+playlistId
                            });
                            embed.setTimestamp(Date.now());
                            var list: string = "";
                            for(let i=0;i<count;i++){
                                list = list+" - "+changes[i].title+"\n";
                            }
                            embed.addField("List of privated / deleted videos:",list,true);
                            dmChannel.send(embed).catch(error => {
                                logConsole("error","Error occured while DMing user: "+error.message);
                            })
                        }).catch(error => {
                            logConsole("error","Error occured while DMing user: "+error.message);
                        });
                    }
                }).catch(error => {
                    logConsole("error","Error occured while fetching watcher: " + error.message);
                });
            }

            // sync the new playlist
            await getPlaylistItems(playlistId) // TODO: change to process multiple pages
            .then(response => {
                createPlaylist(response.data.items,true)
                .then(success => {
                }).catch(error => {
                    logConsole("error","Error occured while syncing playlist items: "+error.message);
                });
            }).catch(error => {
                logConsole("error","Error occured while getting playlist items: "+error.message);
            });

        });
        resolve("OK");

    });

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
    if(DEBUG_MODE){
        processPlaylistsChanges();
    }
});

// Discord client message listener
client.on('message', message => {

    // message logging
    var type: string = message.content.substring(0,4)==='/yt '?"command":"message";
    var location: string = message.guild===null?"(DM)":message.guild.name+"#"+(message.channel as discord.GuildChannel).name;
    var user: string = message.author.tag+"("+message.author.id+")";
    logConsole(type,user+" @ "+location+" > "+message.content);

    // ensure this is a command
    if(type!=="command") return;

    // process command string
    var command: string = message.content.replace(`/yt `,``);
    if(command.startsWith("watch")){ // watch playlist command

        // string parsing
        command = command.replace(`watch `,``);
        if(command.includes("https://www.youtube.com/playlist?list=")){
            command = command.replace("https://www.youtube.com/playlist?list=","");
        }else if(command.includes("http://www.youtube.com/playlist?list=")){
            command = command.replace("http://www.youtube.com/playlist?list=","");
        }else if(command.includes(' ')){ 
            message.channel.send("Provided playlist ID is not of correct format.");
            return;
        }

        // perform watching
        getPlaylistItems(command) // TODO: change to process multiple pages
        .then(response => {
            createPlaylist(response.data.items)
            .then(success => {
                watchPlaylist(message.author.id,response.data.items[0].snippet.playlistId)
                .then(success => {
                    message.channel.send(success as string);
                }).catch(error => {
                    message.channel.send(error);
                });
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
    
});

