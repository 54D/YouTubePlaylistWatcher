/* Setup */

// Debug mode
const DEBUG_MODE = true;

// axios
const axios = require('axios').default;
// discord.js
const Discord = require('discord.js');
const client = new Discord.Client();
// express
const express = require('express');
// node-schedule
var cron = require('node-schedule');
// Local files
const token = require('./token.json');



/* Utilities */

// Fancy console logging
function logConsole(type,msg){
    var date = new Date();
    var logMessage = `${date.toLocaleString()} \x1b[0m\x1b[30m`;
    if(type==`message`){
        logMessage = logMessage.concat(`\x1b[47mMSG`);
    }else if(type==`command`){
        logMessage = logMessage.concat(`\x1b[46mCMD`);
    }else if(type===`info`){
        logMessage = logMessage.concat(`\x1b[42mINF`);
    }else if(type===`debug`&&DEBUG_MODE){
        logMessage = logMessage.concat(`\x1b[43mDBG`);
	}else if(type===`error`){
        logMessage = logMessage.concat(`\x1b[41mERR`);
	}
    logMessage = logMessage.concat(`\x1b[0m \x1b[37m${msg}`);
    console.log(logMessage);
}

// Specialized YouTube API call (get playlist items)
function getPlaylistItems(playlistId){
    var url = "https://www.googleapis.com/youtube/v3/playlistItems";
    axios.get(url,{
        params:{
            key: token.youtube.api.key,
            part: "snippet",
            maxResults: 50,
            playlistId: playlistId
        }
    }).then(response => {
        var data = response.data;
        var size = data.items.length;
        for(var i=0;i<size;i++){
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
    }).catch(error => {
        logConsole("error","Something went wrong while calling YouTube API.");
        logConsole("error",error);
    });
}



/* Initialization */

// Setup YouTube API scheduling
var result = cron.scheduleJob(`* * * * *`,function(){
    // Japanese: PLCNK-7k3ZXSFpwkOkc0xWNJhU0jE4cuSG
    // see you.: PLCNK-7k3ZXSFsa39Hl2ff4JkS_vh5gyZV
    getPlaylistItems("PLCNK-7k3ZXSFsa39Hl2ff4JkS_vh5gyZV");
});
if(result===null){
    logConsole("error","Something went wrong while scheduling YouTube API calls.");
}else{
    logConsole("info","Successfully scheduled periodic YouTube API calls.");
}
// Set ready detection
client.once('ready', () => {
	logConsole("info","Now listening to commands.");
});
// Log in to Discord
client.login(token.discord.bot_token);



/* Events */

// On message
client.on('message', message => {

    // message logging
    var type = message.content.substring(0,4)==='/yt '?"command":"message";
    var location = message.guild===null?"(DM)":message.guild.name+"#"+message.channel.name;
    var user = message.author.tag+"("+message.author.id+")";
    logConsole(type,user+" @ "+location+" > "+message.content);

    // process commands
    if(type!=="command") return;
    var command = message.content.replace(`/yt `,``);
    if(command.startsWith("watch")){
        command = command.replace(`watch `,``);
        if(command.includes(' ')){ 
            message.channel.send("Provided playlist ID is not of correct format.");
            return;
        }else{
            message.channel.send("Manual check requested.");
            getPlaylistItems("PLCNK-7k3ZXSFsa39Hl2ff4JkS_vh5gyZV");
            // if playlist does not exist
            // else do stuff
        }
    }
    
});



/* Cleanup */