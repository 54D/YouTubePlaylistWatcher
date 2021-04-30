import Logger from '../util/Logger';
import EncodedURL from '../util/EncodedURL';
import mongoose, { Connection } from 'mongoose';

export default class DatabaseManager {

    private connection: Connection;

    constructor(){}
    
    connect(): Connection {

        var query: string = new EncodedURL({
            "authSource": settings.mongodb.auth_source,
            "appname": settings.mongodb.app_name,
            "ssl": settings.mongodb.ssl,
        }).getURL();
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
            Logger.logConsole("error",error.message);
        });
        return mongoose.connection;

    }

}