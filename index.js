/* Setup */

// Debug mode
const DEBUG_MODE = true;

// Discord.js
const Discord = require('discord.js');
const client = new Discord.Client();
// fs
var fs = require('fs');
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



/* Initialization */

// Hook up YouTube API v3 WIP
var url = "https://www.googleapis.com/youtube/v3/search?key=&type=video&part=snippet&q="
// Set ready detection
client.once('ready', () => {
	logConsole("info","YTPW ready!");
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
});



/* Cleanup */