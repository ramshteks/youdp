import * as net from "net";
import * as dgram from "dgram";
import {AddressInfo, Socket} from "dgram";
import {PacketIO} from "./packet.io";
import {NetworkAddress, Packet, Protocol} from "./protocol";

export class Udp{
    private _io : PacketIO;
    private _boundAddress : NetworkAddress;
    private _isBound : boolean;
    private _isInBindingProcess : boolean;
    private _udp : Socket;
    private _protocol : Protocol;
    private _id : number = 0;
    
    
    constructor(private _magic : number){
        this._protocol = new Protocol();
    }
    
    bind(ip?:string, port ?: number ) : Promise<any>{
        if( this._isBound ) return Promise.reject( new Error("Already bound") );
        if( this._isInBindingProcess ) return Promise.reject( new Error("Already in binding progress") );

        this._isInBindingProcess = true;
        
        this._io = new PacketIO(this._magic, 3, 1000);
        
        return this
            .resolveLocalAddress(ip, port)
            .then(()=>this.bindUDP())
            .then(()=>{
                this._isBound = true;
                this._isInBindingProcess = false;
            })
            .catch((e)=>{
                this._isBound = false;
                this._isInBindingProcess = false;
                return Promise.reject(e);
            });
    }
    
    signal(addr : NetworkAddress, data : Buffer ) : Packet {
        let packet = new Packet(addr);
        packet.magic = this._magic;
        packet.type = PacketIO.SIGNAL;
        packet.id = this.nextId;
        packet.data = data;
        packet.updateBuffer(this._protocol);
        return this.io.send(packet);
    }
    
    request(addr : NetworkAddress, data : Buffer ) : Promise<Packet> {
        let packet = new Packet(addr);
        packet.magic = this._magic;
        packet.type = PacketIO.REQUEST;
        packet.id = this.nextId;
        packet.data = data;
        packet.updateBuffer(this._protocol);
        return this.io.sendAndWait(packet);
    }
    
    response(addr : NetworkAddress, request : Packet, responseData : Buffer){
        let packet = new Packet(addr);
        packet.magic = this._magic;
        packet.type = PacketIO.RESPONSE;
        packet.id = request.id;
        packet.data = responseData;
        packet.updateBuffer(this._protocol);
        return this.io.send(packet);
    }
    
    unbind(){
        if( this._isBound ){
            this._io = null;
            this._udp.close();
            this._udp.removeAllListeners();
            this._isBound = false;
            this._isInBindingProcess = false;
        }
    }

    private resolveLocalAddress(ip?:string, port?: number) : Promise<any> {
        if( port && ip ){
            this._boundAddress = new NetworkAddress(ip, port);
            return Promise.resolve();
        }
        
        return new Promise((resolve, reject)=>{
            let socket = net.createConnection(80, "google.com");
            socket.on('connect', ()=>{
                this._boundAddress = new NetworkAddress(socket.address().address, port);
                socket.end();
                socket.removeAllListeners();
                resolve();
            });

            socket.on("error", (e)=>{
                socket.removeAllListeners();
                reject(e);
            });
        });
    }

    private bindUDP() : Promise<any> {
        return new Promise((resolve, reject)=>{
            this._udp = dgram.createSocket("udp4");

            this._udp.on("listening", ()=>{
                resolve();
            });

            this._udp.on("message", (msg : Buffer, rinfo : AddressInfo)=>{
                let packet = new Packet(new NetworkAddress(rinfo.address, rinfo.port));
                packet.fillBy(msg, this._protocol);
                this._io.input.notify(packet);
            });

            this._udp.on("error", (e)=>{
                if( this._isInBindingProcess ) {
                    reject(e);
                } else {
                    //TODO
                }
            });

            this._udp.on("close", ()=>{
                //TODO 
            });

            this._io.output.subscribe((packet)=>{
                this._udp.send(packet.packetBuffer, 0, packet.packetBuffer.length, packet.address.port, packet.address.ip);
            });

            this._udp.bind(this.boundAddress.port, this.boundAddress.ip);
        });
    }

    get nextId() {
        if( this._id == Number.MAX_SAFE_INTEGER ){
            this._id = 0;
        } else {
            this._id ++;
        }
        return this._id;
    }

    get lastId(){
        return this._id;
    }

    get io(){
        return this._io;
    }

    get boundAddress(): NetworkAddress {
        return this._boundAddress;
    }
}