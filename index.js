/* eslint-env es6 */
'use strict';

const server = require('http').createServer();
const WebSocketServer = require('ws').Server;
const wss = new WebSocketServer({ server: server });
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const config = {
	bufferDurationSeconds: 0.1,
	serverSampleRate: 22050
};
const configStr = JSON.stringify(config);
let lastSent;

// 0th entry is always filled
let ids = [true];

app.use(express.static(__dirname + '/static', {
	maxAge: 3600 * 1000 * 24
}));

wss.on('connection', function connection(ws) {
	let id = ids.indexOf(false);
	ws.__buffer = [];
	if (lastSent) ws.__buffer.push(lastSent);

	if (id === -1) {
		id = ids.push(true) - 1;
	}
	ws.id = id;

	ws.on('message', function incoming(message) {
		lastSent = message;

		// update the current message to be synced down
		for (const ws of wss.clients) {
			ws.__buffer.push(message);
			if (ws.__buffer.length > 5) ws.__buffer.shift();
		}
	});

	ws.send(configStr);
});

server.on('request', app);
server.listen(port, function () {
	console.log('Listening on ' + server.address().port)
});

setInterval(function () {
	wss.clients.forEach(sendBuffer);
}, config.bufferDurationSeconds * 1000);

function sendBuffer(ws) {
	if (ws.__buffer.length) {
		ws.send(ws.__buffer.shift(), function (e) {
			if (e) {
				console.log(e.message);
				console.log('Oh no! ' + Date.now());
			}
		});
	}
}