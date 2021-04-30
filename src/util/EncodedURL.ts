import Logger from '../util/Logger';

export default class EncodedURL {

    private data: any = [];

    constructor(data: any){
        this.data = data;
    }

    getData(): any{
        return this.data;
    }

    setData(data: any) {
        this.data = data;
    }

    getURL(): string {
        const ret: string[] = [];
        for(let d in this.data){
            ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(this.data[d]));
        }
        return ret.join('&');
    }

}