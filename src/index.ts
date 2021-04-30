/* Setup */

// Debug mode
const DEBUG_MODE: boolean = true;

// axios
import axios, { AxiosResponse } from 'axios';
// discord.js
import discord, { Client } from 'discord.js';
const client: Client = new discord.Client();
// mongoose
import mongoose, { Schema } from 'mongoose';
// node-schedule
import cron from 'node-schedule';

// Local files
import tokens from './config/token.json';
import settings from './config/settings.json';

// own classes
import Logger from './util/Logger';
import EncodedURL from './util/EncodedURL';
import NotificationEmbed from './embeds/NotificationEmbed';
import DatabaseManager from './util/DatabaseManager';

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

Logger.setDebugMode(DEBUG_MODE);



/* Bigger utilities */

// Specialized YouTube API call -- get playlist items
async function getPlaylistItems(playlistId: string,data: AxiosResponse[] = [],nextPageKey: string = ""): Promise<AxiosResponse[]> {
    var url: string = "https://www.googleapis.com/youtube/v3/playlistItems";
    await axios.get(url,{
        params:{
            key: tokens.youtube.api.key,
            part: "snippet",
            maxResults: 50,
            pageToken: nextPageKey,
            playlistId: playlistId
        }
    }).then(async response => {
        data.push(response);
        if(response.data.nextPageToken!==undefined){
            await getPlaylistItems(playlistId,data,response.data.nextPageToken);
        }
    }).catch(error => {
        return new Promise((resolve,reject) => {
            var status: number = error.response!.status;
            switch(status){
                case 400:
                    reject("An empty playlist ID was provided.");
                    break;
                case 403:
                    reject("The playlist is not accessible.");
                    break;
                case 404:
                    reject("The playlist does not exist or is not public.");
                    break;
                default:
                    Logger.logConsole("warn","An unexpected error occured while calling YouTube API.");
                    reject("An unexpected error occured while calling YouTube API.");
                    break;
            }
        });
    });
    return new Promise((resolve,reject) => {
        resolve(data);
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

    return new Promise<any>((resolve,reject) => {

        Playlist.findOne({
            playlistId: playlistId
        }).then( (result: any) => {
            if(result===null){
                const playlist = new Playlist({
                    playlistId  : playlistId,
                    channelId   : channelId,
                    videos      : videos,
                    watchers    : [],
                    lastUpdate  : new Date()
                });
                playlist.save( (error: any) => {
                    if(error){
                        Logger.logConsole("error",error.message);
                        reject(error.message);
                    }else{
                        Logger.logConsole("info","Playlist "+playlistId+" has been successfully CREATED.");
                        resolve({
                            "message":`Playlist ${playlistId} has been successfully CREATED.`,
                            playlist
                        });
                    }
                });
            }else if(replace){
                result.set("videos",videos);
                result.set("lastUpdate",new Date());
                const res = Playlist.updateOne({
                    playlistId: playlistId
                },result,[],(err,res)=>{
                    if(err){
                        Logger.logConsole("error","An unexpected error occured while updating a watch list.");
                        reject("An unexpected error occured while updating a watch list.");
                    }else{
                        resolve({
                            "message":`Playlist ${playlistId} has been successfully UPDATED.`,
                            playlist
                        });
                    }
                });
            }else{
                resolve({
                    "message":`Playlist ${playlistId} already exists in database, update will occur periodically.`,
                    playlist
                });
            }
        });

    });

}

// Add a playlist to a user's watch list
async function watchPlaylist(userId: string,playlistId:string) {

    return new Promise((resolve,reject) => {

        Playlist.findOne({
            playlistId: playlistId
        }).then( (result: any) => {
            if(result===null){
                Logger.logConsole("error","Database issue -- this playlist has not been recorded!");
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
                            Logger.logConsole("error",err.message);
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
function processPlaylistsChanges(){

    return new Promise(async (resolve,reject) => {

        // set up cursor
        (await Playlist.find()).forEach(async (cursor: any) => {

            var playlistId: string = cursor.get("playlistId",String);
            var changes: any[] = [];
            var count: number = 0;

            // detect all changes in stored playlist
            let f = () => {
                return new Promise<number>(async (resolve,reject) => {
                    var videos: any[] = cursor.get("videos");
                    for await (const video of videos){
                        // we don't watch already private or deleted videos until they come back
                        if(video.title !== "Private video" && video.title !== "Deleted video"){
                            await getVideo(video.videoId)
                            .then(response => {
                                if(response.data.pageInfo.totalResults==0){
                                    changes.push(video);
                                    count++;
                                    Logger.logConsole("debug","Change count: "+count);
                                    Logger.logConsole("debug","Changed: " + video.videoId + "/" + video.title);
                                }
                            }).catch(error => {
                                changes.push(video);
                                count++;
                                Logger.logConsole("debug","Change count: "+count);
                                Logger.logConsole("debug","Changed: " + video.videoId + "/" + video.title);
                            });
                        }
                    }
                    resolve(count);
                });
            }

            await f().then(async count => {
                Logger.logConsole("debug","Change count: "+count);
                // notify watchers if there are changes
                if(count!=0){
                    Logger.logConsole("info",count+" changes detected in playlist "+playlistId+", notifying watchers.");
                    let watchers: any[] = cursor.get("watchers",[String]);
                    let newWatchers: any[] = cursor.get("watchers",[String]);
                    for await(const [i,watcher] of watchers.entries()){
                        client.users.fetch(watcher)
                        .then(user => {
                            return user.createDM()
                        }).then(dmChannel => {
                            // send changes as embed
                            var embed: NotificationEmbed = new NotificationEmbed(playlistId, changes, count);
                            dmChannel.send(embed).catch(error => {
                                Logger.logConsole("error","Error occured while DMing watcher: "+error.message);
                            });
                        }).catch(error => {
                            Logger.logConsole("error","Error occured while fetching or DMing watcher, watcher has been removed: " + error.message);
                            newWatchers.splice(i,1);
                        });
                    }
                }
                resolve("OK");
            }).then(() => {
                // sync the new playlist
                getPlaylistItems(playlistId)
                .then(async data => {
                    var items: any[] = [];
                    for await(const p of data){
                        for(const v of p.data.items){
                            items.push(v);
                        }
                    }
                    if(DEBUG_MODE){
                        Logger.logConsole("debug","PLAYLIST "+playlistId+" ------------ ");
                        var c: number = 0;
                        for await(const i of items){
                            c++;
                            Logger.logConsole("debug","  "+c+"\t" + i.snippet.title);
                        }
                    }
                    // TODO: change to return promise, then do then chaining instead
                    createPlaylist(items,true)
                    .then(success => {
                    }).catch(error => {
                        Logger.logConsole("error","Error occured while syncing playlist items: "+error.message);
                    });
                }).catch(async error => {
                    let watchers: any[] = cursor.get("watchers",[String]);
                    for await(const watcher of watchers){
                        client.users.fetch(watcher)
                        .then(user => {
                            return user.createDM()
                        }).then(dmChannel => {
                            dmChannel.send("A previously watched playlist has become unavailable, and has been automatically unwatched: \n"+playlistId);
                            // TODO: playlist NAME add into schema
                        }).catch(error => {
                            Logger.logConsole("error","Error occured while fetching or DMing watcher: " + error.message);
                        });
                    }
                    cursor.remove();
                    reject("");
                });
            })
            resolve("");

        });

    });

}



/* Initialization */

// Open database connection
DatabaseManager.connect();

// Setup playlist change processing
var result: cron.Job = cron.scheduleJob(`0 0 * * *`,function(){
    processPlaylistsChanges();
});
if(result===null){
    Logger.logConsole("error","Something went wrong while scheduling playlist change processing.");
}else{
    Logger.logConsole("info","Successfully scheduled periodic playlist change processing.");
}
// Log in to Discord
client.login(tokens.discord.bot_token);



/* Events */

// Database connection result
client.on('error', error => {
    Logger.logConsole("error",error.message);
});
client.once('open', () => {
    Logger.logConsole("info","Connection to database established.");
});

// Discord client connection result
client.once('ready', () => {
    Logger.logConsole("info","Now listening to commands.");
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
    Logger.logConsole(type,user+" @ "+location+" > "+message.content);

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
        }else if(command.includes("https://youtube.com/playlist?list=")){
            command = command.replace("https://youtube.com/playlist?list=","");
        }else if(command.includes("http://youtube.com/playlist?list=")){
            command = command.replace("http://youtube.com/playlist?list=","");
        }else if(command.includes(' ')){ 
            message.channel.send("Provided playlist ID is not of correct format.");
            return;
        }

        // perform watching
        getPlaylistItems(command)
        .then(async data => {
            var items: any[] = [];
            for await(const p of data){
                for await(const v of p.data.items){
                    items.push(v);
                }
            }
            if(DEBUG_MODE){
                var c: number = 0;
                for await (const i of items){
                    c++;
                    Logger.logConsole("debug","  "+c+"\t" + i.snippet.title);
                }
            }
            return items;
        }).then(items => {
            return createPlaylist(items);
        }).then(response => {
            return watchPlaylist(message.author.id,response.playlist[0].snippet.playlistId)
        }).then(success => {
            message.channel.send(success as string);
        }).catch(error => {
            message.channel.send(error);
            /*
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
                    Logger.logConsole("warn","An unexpected error occured while calling YouTube API.");
                    message.channel.send("An unexpected error occured while calling YouTube API.");
                    break;
            }
            */
        });

    }
    
});

