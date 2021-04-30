import { MessageEmbed } from "discord.js";
import * as en from "../lang/en.json"

export default class extends MessageEmbed {

	playlistId: string

	constructor(playlistId: string, changes: any[], count: number) {
		super({
			author:{
				name: "YouTube Playlist Watcher",
				iconURL: "https://i.gyazo.com/666945b5f0eb94b0aac7fc69e2ea8759.png"
			},
			description: "The following videos have been changed since YTPW last checked.\n",
			color: "#00054D",
			footer: {
				text: "Click on the link above to visit your playlist."
			},
			title: "Playlist change notification",
			timestamp: Date.now(),
		});
		this.type = "rich";

		this.playlistId = playlistId;
		this.url = "https://www.youtube.com/playlist?list="+playlistId;

		var list: string = "";
		for(let i=0;i<count;i++){
			list = list+" - "+changes[i].title+"\n";
		}
		this.addField("List of privated / deleted videos:",list,true);
		this.addField("Number of changes: ",count,true);
	}

};

