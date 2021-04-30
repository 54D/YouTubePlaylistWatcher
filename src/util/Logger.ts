export default class Logger {

    private static DEBUG_MODE: boolean = false;

    constructor(){}

    static setDebugMode(enable: boolean){
        this.DEBUG_MODE = enable;
    }

    static logConsole(type: string,msg: string|number){
        var date: Date = new Date();
        var logMessage: string = `${date.toLocaleString()} \x1b[0m\x1b[30m`;
        if(type==`message`){
            logMessage = logMessage.concat(`\x1b[47mMSG`);
        }else if(type==`command`){
            logMessage = logMessage.concat(`\x1b[46mCMD`);
        }else if(type===`info`){
            logMessage = logMessage.concat(`\x1b[42mINF`);
        }else if(type===`debug`&&this.DEBUG_MODE){
            logMessage = logMessage.concat(`\x1b[44mDBG`);
        }else if(type===`warn`){
            logMessage = logMessage.concat(`\x1b[43mWRN`);
        }else if(type===`error`){
            logMessage = logMessage.concat(`\x1b[41mERR`);
        }
        logMessage = logMessage.concat(`\x1b[0m \x1b[37m${msg}`);
        console.log(logMessage);
    }

}